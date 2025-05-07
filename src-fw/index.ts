import express from 'express'
import cors from 'cors'
import http from 'http'
import https from 'https'
import path from 'path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { env } from 'process'
import { encode, decode } from '@msgpack/msgpack'

import { Log as MyLog  } from './log'
import { Operation as MyOperation} from './operation'
import { Util as MyUtil } from './util'
export { MyOperation as Operation, MyLog as Log, MyUtil as Util }

import { register } from './operations'

import { StGeneric } from '../src-dbst'

export interface BaseConfig {
  PROD: boolean,
  GAE: string, // ''
  SRVKEY: string, // passée par env var - Clé de décryptage de keys.ts (entre autre)
  STORAGE_EMULATOR_HOST: string,
  FIRESTORE_EMULATOR_HOST: string,

  BUILD: string, // 'v1.0'
  API: number, // 1
  APIVERSIONS: number[], // [1, 1]
  debugLevel: number, // 0: aucun, 1: standard: 2: élevé
  adminAlerts: boolean, // false: simulation true: envoi de mail

  logsPath: string, // './logs'
  port: number, // 8080
  https: boolean,
  origins: Set<string>, // new Set<string>(['http://localhost:8080']),

  site: string, // 'A'
  database: string, // 'sqla'
  storage: string,  // 'fsa'
  // Uitlisé seulement par les storage: File-System et GC en mode EMULATOR
  srvUrl: string, // '' si défaut 'http://localhost:8080'

  dbOptions: Object,
  /* {
    sqla: { path: 'sqlite/testa.db3', cryptIds: false, credentials: 'sqlite' },
    sqlb: { path: 'sqlite/testb.db3', cryptIds: true, credentials: 'sqlite' }
  } */
  
  stOptions: Object,
  /* {
    fsa: { bucket: 'filestorea', cryptIds: false, credentials: 'storageFS'}
  } */

  keys: Object
}

export function checkConfig ( encryptedKeys: string ) {
  const config = MyOperation.config
  new MyLog(config.PROD, config.GAE, config['logsPath'])

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

  if (config.database) {
    if (!config.dbOptions || !config.dbOptions[config.database])
      throw new AppExc(1013, 'config.dbOptions not found', null, [config.database])
    if (!config.site || !config.keys['sites'][config.site])
      throw new AppExc(1014, 'config.site not found or no key', null, [config.site || '?'])
  }

  register()
}

export function getExpressApp (
    dbConnexion: Function, 
    storage: StGeneric
  ) : express.Application {
    
  const config = MyOperation.config
  const app = express()
  app.use(cors({}))

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

  //**** appels des opérations ****
  app.use('/op/:operation', async (req, res) => {
    let body
    if (!req['rawBody']) {
      let chunks = [];
      req.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk))
      }).on('end', async () => {
        body = Buffer.concat(chunks)
        await doOp(storage, dbConnexion, req, res, body)
      })
    } else // Cloud functions
      await doOp(storage, dbConnexion, req, res, req['rawBody'])
  })
  
  return app
}

export function startSRV (config: BaseConfig, app: express.Application) {
  const port = env.PORT || config.port
  let server : http.Server | https.Server

  if (config.https) {
    let p = path.resolve('./cert/fullchain.pem')
    const cert = existsSync(p) ? readFileSync(p) : ''
    if (!cert)
      throw new AppExc(1015, 'certificate NOT FOUND', null, [p])
    p = path.resolve('./cert/privkey.pem')
    const key = existsSync(p) ? readFileSync(p) : ''
    if (!key ) 
      throw new AppExc(1015, 'private key NOT FOUND', null, [p])
    server = https.createServer({key, cert}, app).listen(port, async () => {
      MyLog.info('HTTPS listen [' + config.port + ']')
    })
  } else {
    server = http.createServer(app).listen(port, async () => {
      MyLog.info('HTTP listen [' + port + ']')
    })
  }

  if (server)
    server.on('error', (e) => { // les erreurs de création du server ne sont pas des exceptions
      MyLog.error('HTTP/S error: ' + e.message + '\n' + e.stack)
      throw new AppExc(1016, 'HTTP/S error', null, [e.message])
    })
}

export async function testDb (
  dbConnexion: Function, 
  storage: StGeneric) : Promise<void> {
  
  return new Promise(async (resolve, reject) => {
    const config = MyOperation.config
    const op = MyOperation.fake()
    await dbConnexion(config.database, config.site, op)
    {
      const [status, msg] = await op.db.ping()
      if (status === 0) MyLog.info(msg)
      else reject('PING SDatabase FAILED')
    }
    {
      const [status, msg] = await storage.ping()
      if (status === 0) MyLog.info(msg)
      else reject('PING Storage FAILED: ' + msg)
    }
    resolve()
  })
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
  dbConnexion: Function,
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
      await dbConnexion(MyOperation.config.database, MyOperation.config.site, op)

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

/*****************************************************
 * Ligne de commande: node src/crypKeys.ts "toto est tres tres beau"
 * Transforme le fichier keys.json en un script keys.ts 
 * exportant l'objet keys.json crypté.
*/
export function cryptKeys () {
  const cmdargs = parseArgs({
    allowPositionals: false,
    options: { 
      pwd: { type: 'string', short: 'p' }
    }
  })

  const pwd = cmdargs.values['pwd']
  const key = MyUtil.pbkdf2(pwd)
  console.log('key= ' + key.toString('base64'))
  const pjson = path.resolve('./keys.json')
  if (!existsSync(pjson)) {
    console.log('./keys.json NOT FOUND')
  } else {
    try {
      const buf = readFileSync(pjson)
      const b64 = MyUtil.crypt(key, buf).toString('base64')
      const pmjs = path.resolve('./src/keys.ts')
      const x = 'export const encryptedKeys = \'' + b64 + '\'' + '\n'
      writeFileSync(pmjs, Buffer.from(x, 'utf8'))
      console.log('./src/keys.js written')
    } catch (e) {
      console.log('Encryption failed. ' + e.message)
    }
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

  constructor (code: number, label: string, op: MyOperation, args?: string[], stack?: string) {
    this.label = label
    this.code = code
    this.opName = op ? op.opName : ''
    this.org = op && op.org ? op.org : ''
    this.args = args || []
    this.stack = stack || ''
    const m = 'AppExc: ' + code + ':' + label + (op ? '@' + op.opName + ':' : '') + JSON.stringify(args || [])
    if (code > 3000) MyLog.error(m + this.stack)
    else { if (MyOperation.config.debugLevel > 0) MyLog.info(m) }
    if (code > 8000)
      adminAlert(op, m, this.stack)
  }

  serial() { 
    return Buffer.from(encode({code: this.code, label: this.label, opName: this.opName,
      org: this.org, stack: this.stack, args: this.args}))
  }
}
