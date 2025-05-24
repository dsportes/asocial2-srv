import { env } from 'process' 
import express from 'express'
import cors from 'cors'
import http from 'http'
import https from 'https'
import path from 'path'
import { existsSync, readFileSync } from 'node:fs'
import { encode, decode } from '@msgpack/msgpack'

// import admin from 'firebase-admin'
import webpush from 'web-push'

import { Log as MyLog  } from './log'
import { Operation as MyOperation} from './operation'
import { register } from './operations'
import { Util as MyUtil, testECDH } from './util'
export { MyOperation as Operation, MyLog as Log, MyUtil as Util }

import { DbConnector } from './dbConnector'
import { StGeneric, StConnector } from './stConnector'

export interface BaseConfig {
  PROD: boolean,
  GCLOUDLOGGING: boolean,
  SRVKEY: string, // passée par env var - Clé de décryptage de keys.ts (entre autre)
  STORAGE_EMULATOR_HOST: string,
  FIRESTORE_EMULATOR_HOST: string,

  BUILD: string, // 'v1.0'
  API: number, // 1
  APIVERSIONS: number[], // [1, 1]
  debugLevel: number, // 0: aucun, 1: standard: 2: élevé
  adminAlerts: boolean, // false: simulation true: envoi de mail

  logsPath: string, // './logs'
  port: any, // 8080
  https: boolean,
  origins: Set<string>, // new Set<string>(['http://localhost:8080']),

  site: string, // 'A'
  database: string, // 'sqla'
  storage: string,  // 'fsa'
  // Uitlisé seulement par les storage: File-System et GC en mode EMULATOR
  srvUrl: string, // '' si défaut 'http://localhost:8080'
  keys: Object,

  firebase?: any,
  messaging?: any
}

let dbConnector: DbConnector
let storage: StGeneric
let app: express.Application
let config: BaseConfig

export function init (_config: BaseConfig, encryptedKeys: string) {
  config = _config
  MyOperation.config = config
  new MyLog(config.PROD, config.GCLOUDLOGGING, config['logsPath'])

  // Chargement des "keys" cryptées dans config.keys
  try {
    if (config.SRVKEY) {
      const key = Buffer.from(config.SRVKEY, 'base64')
      const bin = Buffer.from(encryptedKeys, 'base64')
      const x = MyUtil.decrypt(key, bin).toString('utf-8')
      config['keys'] = JSON.parse(x)
    } else {
      throw new AppExc(1012, 'env.SRVKeY NOT FOUND', null)
    }
  } catch (e) {
    const m = './keys.bin or ./keys.json is NOT readable / decipherable: ' + e.toString()
    throw new AppExc(1012, m, null)
  }

  if (!config.site || !config.keys['sites'][config.site])
    throw new AppExc(1014, 'config.site not found or no key', null, [config.site || '?'])

  const nbOp = register()
  if (config.debugLevel > 0) MyLog.debug(nbOp + ' operations registered')

  webpush.setVapidDetails('https://example.com/', config.keys['vapid_public_key'], config.keys['vapid_private_key'])

}

export function getExpressApp (): express.Application {

  dbConnector = config.database ? DbConnector.get(config.database) : null
  storage =  config.storage ? StConnector.getStorage(config.storage, config.site) : null

  app = express()
  app.use(cors({}))
  app.use(express.json())

  // OPTIONS est toujours envoyé pour tester les appels cross origin
  app.use('/', (req, res, next) => {
    if (req.method === 'OPTIONS')res.send('')
    else next()
  })

  app.get('/robots.txt', (req, res) => {
    res.send('User-agent: *\nDisallow: /\n')
  })

  app.get('/ping', (req, res) => {
    res.send(new Date().toISOString() + ' ' + config.BUILD + ' [' + config.APIVERSIONS[0] + '/' + config.APIVERSIONS[1] + ']')
  })

  app.get('/file/:arg', async (req, res) => {
    if (!storage) {
      res.status(404).send('File not found')
      return
    }
    try {
      const [id1, id2, id3] = storage.decode3(req.params.arg)
      const bytes = await storage.getFile(id1, id2, id3)
      if (bytes) res.status(200).type('application/octet-stream').send(bytes)
      else res.status(404).send('File not found')
    } catch (e) {
      res.status(404).send('File not found')
    }
  })

  app.put('/file/:arg', async (req, res) => {
    if (!storage) {
      res.status(404).send('File not uploaded')
      return
    }
    try {
      const bufs = [];
      req.on('data', (chunk) => {
        bufs.push(chunk);
      }).on('end', async () => {
        const bytes = Buffer.concat(bufs)
        const [id1, id2, id3] = storage.decode3(req.params.arg)
        await storage.putFile(id1, id2, id3, bytes)
        res.status(200).send('OK')
      })
    } catch (e) {
      res.status(404).send('File not uploaded')
    }
  })

  app.post("/send-notification", async (req, res) => {
    try {
      const { token, title, body } = req.body   
      const message = {
        notification: {
          title,
          body,
        },
        token
      }
      try {
        await config.messaging.send(message)
        res.status(200).json({ success: true, message: "Notification sent!" })
        console.log('Sent : ', JSON.stringify(message))
      } catch (e) {
        res.status(200).json({ success: false, message: e.toString() })
      }
    } catch (error) {
      console.error("Error sending notification:", error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  //**** appels des opérations ****
  app.use('/op/:operation', async (req, res) => {
    let body
    if (!req['rawBody']) {
      let chunks = [];
      req.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk))
      }).on('end', async () => {
        body = Buffer.concat(chunks)
        await doOp(storage, dbConnector, req, res, body)
      })
    } else // Cloud functions
      await doOp(storage, dbConnector, req, res, req['rawBody'])
  })
  
  return app
}

export function startSRV () : Promise<void>{
  return new Promise(async (resolve, reject) => {
    let server : http.Server | https.Server

    if (config.debugLevel === 2)
      await testDb()

    if (config.https) {
      let p = path.resolve('./cert/fullchain.pem')
      const cert = existsSync(p) ? readFileSync(p) : ''
      if (!cert)
        throw new AppExc(1015, 'certificate NOT FOUND', null, [p])
      p = path.resolve('./cert/privkey.pem')
      const key = existsSync(p) ? readFileSync(p) : ''
      if (!key ) 
        throw new AppExc(1015, 'private key NOT FOUND', null, [p])
      server = https.createServer({key, cert}, app).listen(config.port, async () => {
        MyLog.info('HTTPS listen [' + config.port + ']')
      })
    } else {
      server = http.createServer(app).listen(config.port, async () => {
        MyLog.info('HTTP listen [' + config.port + ']')
      })
    }

    if (server)
      server.on('error', (e) => { // les erreurs de création du server ne sont pas des exceptions
        MyLog.error('HTTP/S error: ' + e.message + '\n' + e.stack)
        reject(e.message)
      })
    resolve()
  })
}

export async function testDb () : Promise<void> {
  await testECDH()
  const op = MyOperation.fake()
  await dbConnector.getConnexion(config.site, op)
  {
    const [status, msg] = await op.db.ping()
    if (status === 0) MyLog.info(msg)
    else throw new AppExc(1012, 'PING SDatabase FAILED', null, [msg])
  }
  {
    const [status, msg] = await storage.ping()
    if (status === 0) MyLog.info(msg)
    else throw new AppExc(1013, 'PING Storage FAILED: ', null, [msg])
  }
}

/****************************************************************/
function checkOrigin(req: express.Request, origins: Set<string>) {
  let origin = req.headers['origin']
  if (origins.has(origin)) return true
  if (!origin || origin === 'null') {
    const referer = req.headers['referer']
    if (referer) origin = referer
  }
  if (origins.has(origin)) return true
  if (!origin || origin === 'null') origin = req.headers['host']
  const [hn, po] = MyUtil.getHP(origin)
  if (origins.has(hn) || origins.has(hn + ':' + po)) return true
  throw new AppExc(1001, 'origin not authorized', null, [origin])
}

let today = 0
let todayEpoch = 0

export async function doOp (
  storage: StGeneric, 
  dbConnector: DbConnector,
  req: express.Request, 
  res: express.Response, 
  body: Buffer) {
  
  const now = Date.now()
  const e = Math.floor(now / 86400000)
  if (e !== todayEpoch) { 
    todayEpoch = Math.floor(now / 86400000)
    today = MyUtil.amj(now)
  }

  const opName = req.params.operation

  try {
    if (opName === 'yo'){
      await MyUtil.sleep(1000)
      res.status(200).type('text/plain').send('yo ' + new Date().toISOString())
      return
    }

    if (MyOperation.config.origins.size) checkOrigin(req, MyOperation.config.origins)

    if (opName === 'yoyo'){
      await MyUtil.sleep(1000)
      res.status(200).type('text/plain').send('yoyo ' + new Date().toISOString())
      return
    }
    
    const op = MyOperation.new(opName)
    if (!op) throw new AppExc(1002, 'unknown operation', null, [opName])
    op.opName = opName
    op.storage = storage
    op.now = now
    op.today = today
    op.args = decode(body)
    op.params = {}

    if (op.args.APIVERSION && (op.args.APIVERSION < MyOperation.config.APIVERSIONS[0] 
      || op.args.APIVERSION > MyOperation.config.APIVERSIONS[1]))
      throw new AppExc(1003, 'unsupported API', null, [MyOperation.config.APIVERSIONS[0], 
        MyOperation.config.APIVERSIONS[1], op.args.APIVERSION, MyOperation.config.BUILD])

    if (MyOperation.config.debugLevel === 2)
      MyLog.info(opName + ' started')
    op.init()

    if (MyOperation.config.database)
      await dbConnector.getConnexion(MyOperation.config.site, op)

    await op.run()
    if (MyOperation.config.debugLevel === 2)
      MyLog.info(opName + ' finished')
    const b = encode(op.result || {})
    res.status(200).type('application/octet-stream').send(Buffer.from(b))
  } catch(exc) {
    if (MyOperation.config.debugLevel === 2)
      MyLog.info(opName + ' terminated on exception')
    // 400: AppExc
    // 401: AppExc inattendue
    const e = exc
    let b: Buffer
    let st = 400
    if (e instanceof AppExc) {
      b = e.serial()
    } else {
      const e2 = new AppExc(1999, 'unexpected exception', null, [e.message], e.stack || '')
      b = e2.serial()
      st = 401
    }
    res.status(st).type('application/octet-stream').send(b)
  }
}

/*****************************************************/
interface admin_alerts { url: string, pwd: string, to: string }

export async function adminAlert (
    op: MyOperation, 
    subject: string, 
    text: string) {
  const config = MyOperation.config
  const al: admin_alerts  = config.keys['adminAlerts']
  if (al['adminAlerts'] === 0) return
  const s = '[' + config.site + '] '  
    + (op && op.org ? 'org:' + op.org + ' - ' : '') 
    + (op ? 'op:' + op.opName + ' - ' : '') 
    + subject
  MyLog.info('Mail sent to:' + al.to + ' subject:' + s + (text ? '\n' + text : ''))

  if (!config.adminAlerts) return

  // Test avec le script server.php
  try {
    const response = await fetch(al.url, {
      method: 'POST',
      headers:{
        'Content-Type': 'application/x-www-form-urlencoded'
      },    
      body: new URLSearchParams({ 
        mailer: 'A',
        mdp: al.pwd, 
        subject: s, 
        to: al.to, 
        text:  text || '-'
      })
    })
    const t = await response.text()
    if (!t.startsWith('OK'))
      MyLog.error('Send mail error: [' + al.url + '] -  ' + t)
  } catch (e) {
    MyLog.error('Send mail exception: [' + al.url + '] -  ' + e.toString())
  }
}

/* code
  1000: erreurs fonctionnelles FW
  2000: erreurs fonctionnelles APP
  3000: asserions FW
  4000: asserions APP
  8000: asserions FW - transmises à l'administrateur
  9000: asserions APP - transmises à l'administrateur
*/

export class AppExc {
  public code: number
  public label: string
  public opName: string
  public org: string
  public stack: string
  public args: string[]
  public message: string

  constructor (code: number, label: string, op: MyOperation, args?: string[], stack?: string) {
    this.label = label
    this.code = code
    this.opName = op ? op.opName : ''
    this.org = op && op.org ? op.org : ''
    this.args = args || []
    this.stack = stack || ''
    this.message = 'AppExc: ' + code + ':' + label + (op ? '@' + op.opName + ':' : '') + JSON.stringify(args || [])
    if (code > 3000) MyLog.error(this.message)
    else { if (MyOperation.config.debugLevel > 0) MyLog.debug(this.toString()) }
    if (code > 8000)
      adminAlert(op, this.message, this.stack)
  }

  serial () { 
    return Buffer.from(encode({code: this.code, label: this.label, opName: this.opName,
      org: this.org, stack: this.stack, args: this.args}))
  }

  toString () { return this.message + (this.stack ? '\n' + this.stack : '')}
}
