import express from 'express'
import cors from 'cors'
import http from 'http'
import https from 'https'
import path from 'path'
import { existsSync, readFileSync } from 'node:fs'
import { encode, decode } from '@msgpack/msgpack'
import webpush from 'web-push'

import { Log } from './log'
import { config } from './config'
import { Operation } from './operation'
import { register } from './operations'
import { Util } from './util'

import { DbConnector } from './dbConnector'
import { IStGeneric } from './iStGeneric'

export function init () {
  new Log(config.PROD, config.GCLOUDLOGGING, config['logsPath'])

  const nbOp = register()
  if (config.debugLevel > 0) Log.debug(nbOp + ' operations registered')

  webpush.setVapidDetails('https://example.com/', config.keys['vapid_public_key'], config.keys['vapid_private_key'])
}

export function getExpressApp (): express.Application {
  const app = express()
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

  app.get('/url/:org', async (req, res) => {
    const u = await getUrl(req.params.org)
    res.send(u)
  })

  app.get('/file/:arg', async (req, res) => {
    const st = config.storages[0][1]
    if (!st) {
      res.status(404).send('File not found')
      return
    }
    try {
      const [id1, id2, id3] = st.decode3(req.params.arg)
      const bytes = await st.getFile(id1, id2, id3)
      if (bytes) res.status(200).type('application/octet-stream').send(bytes)
      else res.status(404).send('File not found')
    } catch (e) {
      res.status(404).send('File not found')
    }
  })

  app.put('/file/:arg', async (req, res) => {
    const st = config.storages[0][1]
    if (!config.GCLOUDLOGGING) {
      res.status(404).send('File not uploaded')
      return
    }
    try {
      const bufs = [];
      req.on('data', (chunk) => {
        bufs.push(chunk);
      }).on('end', async () => {
        const bytes = Buffer.concat(bufs)
        const [id1, id2, id3] = st.decode3(req.params.arg)
        await st.putFile(id1, id2, id3, bytes)
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
    const storage = config.storages[0][1]
    const dbConnector = config.databases[0][1]

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

async function getUrl (org: string) {
  try {
    const connector = config.directoryDB
    const op = new Operation()
    const cnx = await connector.getConnexion(op)
    const url = await cnx.getUrl(org)
    await cnx.disconnect()
    return url
  } catch (e) {
    return '$' + e.toString()
  }
}

export function startSRV (app : any) : Promise<void>{
  return new Promise(async (resolve, reject) => {
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
      server = https.createServer({key, cert}, app).listen(config.port, async () => {
        Log.info('HTTPS listen [' + config.port + ']')
      })
    } else {
      server = http.createServer(app).listen(config.port, async () => {
        Log.info('HTTP listen [' + config.port + ']')
      })
    }

    if (server)
      server.on('error', (e) => { // les erreurs de création du server ne sont pas des exceptions
        Log.error('HTTP/S error: ' + e.message + '\n' + e.stack)
        reject(e.message)
      })
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
  const [hn, po] = Util.getHP(origin)
  if (origins.has(hn) || origins.has(hn + ':' + po)) return true
  throw new AppExc(1001, 'origin not authorized', null, [origin])
}

let today = 0
let todayEpoch = 0

export async function doOp (
  storage: IStGeneric, 
  dbConnector: DbConnector,
  req: express.Request, 
  res: express.Response, 
  body: Buffer) {
  
  const now = Date.now()
  const e = Math.floor(now / 86400000)
  if (e !== todayEpoch) { 
    todayEpoch = Math.floor(now / 86400000)
    today = Util.amj(now)
  }

  const opName = req.params.operation

  try {
    if (opName === 'yo'){
      await Util.sleep(1000)
      res.status(200).type('text/plain').send('yo ' + new Date().toISOString())
      return
    }

    if (config.origins.size) checkOrigin(req, config.origins)

    if (opName === 'yoyo'){
      await Util.sleep(1000)
      res.status(200).type('text/plain').send('yoyo ' + new Date().toISOString())
      return
    }
    
    const f = Operation.factories.get(opName)
    if (!f) throw new AppExc(1002, 'unknown operation', null, [opName])
    const op = f()
    op.opName = opName
    op.storage = storage
    op.dbConnector = dbConnector
    op.now = now
    op.today = today
    op.args = decode(body)

    if (op.args.APIVERSION && (op.args.APIVERSION < config.APIVERSIONS[0] 
      || op.args.APIVERSION > config.APIVERSIONS[1]))
      throw new AppExc(1003, 'unsupported API', null, [config.APIVERSIONS[0], 
        config.APIVERSIONS[1], op.args.APIVERSION, config.BUILD])

    op.init()

    await op.run()
    if (config.debugLevel === 2)
      Log.info(opName + ' finished')
    const b = encode(op.result || {})
    res.status(200).type('application/octet-stream').send(Buffer.from(b))
  } catch(exc) {
    if (config.debugLevel === 2)
      Log.info(opName + ' terminated on exception')
    // 400: AppExc
    // 401: AppExc inattendue
    const e = exc
    let b: Buffer
    let st = 400
    if (e instanceof AppExc) {
      b = e.serial()
    } else {
      const e2 = new AppExc(3001, 'unexpected exception', null, [e.message], e.stack || '')
      b = e2.serial()
      st = 401
    }
    res.status(st).type('application/octet-stream').send(b)
  }
}

/*****************************************************/
interface admin_alerts { url: string, pwd: string, to: string }

export async function adminAlert (
    op: Operation, 
    subject: string, 
    text: string) {

  const al: admin_alerts  = config.keys['adminAlerts']
  if (al['adminAlerts'] === 0) return
  const s = '[' + config.srvUrl + '] '  
    + (op && op.org ? 'org:' + op.org + ' - ' : '') 
    + (op ? 'op:' + op.opName + ' - ' : '') 
    + subject
  Log.info('Mail sent to:' + al.to + ' subject:' + s + (text ? '\n' + text : ''))

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
      Log.error('Send mail error: [' + al.url + '] -  ' + t)
  } catch (e) {
    Log.error('Send mail exception: [' + al.url + '] -  ' + e.toString())
  }
}

/* code
  1000: erreurs fonctionnelles FW
  2000: erreurs fonctionnelles APP
  3000: asserions FW
  4000: asserions APP
  5000: asserions FW - transmises à l'administrateur
  6000: asserions APP - transmises à l'administrateur
*/

export class AppExc {
  public code: number
  public label: string
  public opName: string
  public org: string
  public stack: string
  public args: string[]
  public message: string

  constructor (code: number, label: string, op: Operation, args?: string[], stack?: string) {
    this.label = label
    this.code = code
    this.opName = op ? op.opName : ''
    this.org = op && op.org ? op.org : ''
    this.args = args || []
    this.stack = stack || ''
    this.message = 'AppExc: ' + code + ':' + label + (op ? '@' + op.opName + ':' : '') + JSON.stringify(args || [])
    if (code > 3000) Log.error(this.message)
    else { if (config.debugLevel > 0) Log.debug(this.toString()) }
    if (code > 5000)
      adminAlert(op, this.message, this.stack)
  }

  serial () { 
    return Buffer.from(encode({code: this.code, label: this.label, opName: this.opName,
      org: this.org, stack: this.stack, args: this.args}))
  }

  toString () { return this.message + (this.stack ? '\n' + this.stack : '')}
}
