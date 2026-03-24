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
import { SafeOperation } from './safeop'
import { Util } from './util'

import { DbConnector } from './dbConnector'
import { IStGeneric } from './iStGeneric'
// import { StorageGeneric } from './storageGeneric'

export function init () {
  new Log(config.PROD, config.GCLOUDLOGGING, config['logsPath'])

  const nbOp = register()
  if (config.debugLevel > 0) Log.debug(nbOp + ' operations registered')

  webpush.setVapidDetails('https://example.com/', config.keys['vapid_public_key'], config.keys['vapid_private_key'])
}

export class OrgsConfig {
  static updating: boolean = false
  static current: OrgsConfig = null
  static lastLoading: number = 0

  orgs : Map<string, [string, string]>
  dbs : Map<string, Set<string>>
  storages : Map<string, Set<string>>

  constructor (x: Object) { // { org1:[db1, st1], ...}
    this.orgs = new Map<string, [string, string]>()
    this.dbs = new Map<string, Set<string>>()
    this.storages = new Map<string, Set<string>>()
    for (const org in x) {
      const [db, st] = x[org]
      this.orgs.set(org, [db, st])
      let e = this.dbs.get(db); if (!e) e = new Set<string>(); this.dbs.set(db, e)
      e.add(org)
      e = this.storages.get(st); if (!e) e = new Set<string>(); this.storages.set(st, e)
      e.add(org)
    }
  }

  static getDbSt (org: string) {
    OrgsConfig.reload()
    const c = OrgsConfig.current
    return !c ? null : c.orgs.get(org)
  }

  static reload () {
    if (OrgsConfig.updating) return
    if (Date.now() - OrgsConfig.lastLoading < 300000) return
    OrgsConfig.updating = true
    setTimeout(OrgsConfig.doReload, 50)
  }

  static async save (op: Operation, org: string, db: string, st: string) {
    const val = await op.db.getSingleton('orgs') as string
    const x = JSON.parse(val)
    if (!db) delete(x[org])
    else x[org] = [db, st]
    const nval = JSON.stringify(x, null, '\t')
    const oc = new OrgsConfig(x)
    OrgsConfig.current = oc
    OrgsConfig.updating = false
    OrgsConfig.lastLoading = Date.now()
    await op.db.setSingleton('orgs', nval)
  }

  static async doReload (init?: boolean) : Promise<boolean> {
    const op = new Operation()
    op.now = Date.now()
    try {
      const dbConnector = config.svcDB
      await dbConnector.getConnexion(op)
      const val = await op.db.getSingleton('orgs') as string
      const x = JSON.parse(val)
      const oc = new OrgsConfig(x)
      op.db.disconnect()
      OrgsConfig.current = oc
      OrgsConfig.updating = false
      OrgsConfig.lastLoading = Date.now()
      if (config.debugLevel > 0) 
        Log.debug('Reloading orgs config OK')
      return true
    } catch (e) {
      if (op && op.db) op.db.disconnect()
      Log.error('Reloading orgs config KO: ' + e.toString())
      if (!init) setTimeout(OrgsConfig.doReload, 60000)
      return false 
    }
  }

  static getDbConnector (org: string) : DbConnector {
    OrgsConfig.reload()
    const c = OrgsConfig.current
    if (!c) return null
    const e = c.orgs.get(org)
    if (!e || !e[0]) return null
    return config.databases.get(e[0]) || null
  }

  static getStorage (org: string) : IStGeneric {
    OrgsConfig.reload()
    const c = OrgsConfig.current
    if (!c) return null
    const e = c.orgs.get(org)
    if (!e || !e[1]) return null
    return config.storages.get(e[1]) || null
  }
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

  app.get('/file/:name/:arg', async (req, res) => {
    const name = req.params.name
    const st: IStGeneric = config.storages[name]
    if (!st) {
      res.status(404).send('File not found')
      return
    }
    try {
      const [id1, id2, id3] = st.decode3(req.params.arg)
      const bytes = await st.getFile(null, id1, id2, id3)
      if (bytes) res.status(200).type('application/octet-stream').send(bytes)
      else res.status(404).send('File not found')
    } catch (e) {
      res.status(404).send('File not found')
    }
  })

  app.put('/file/:name/:arg', async (req, res) => {
    const name = req.params.name
    const st: IStGeneric = config.storages[name]
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
        await st.putFile(null, id1, id2, id3, bytes)
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
  app.use('/op/:org/:operation', async (req, res) => {
    const org = req.params.org
    let storage, dbConnector
    if (org.startsWith('$')) {
      dbConnector = config.svcDB
    } else {
      storage = OrgsConfig.getStorage(req.params.org)
      dbConnector = OrgsConfig.getDbConnector(req.params.org)
    }

    if (!req['rawBody']) {
      let chunks = [];
      req.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk))
      }).on('end', async () => {
        const body = Buffer.concat(chunks)
        await doOp(storage, dbConnector, req, res, body)
      })
    } else // Cloud functions
      await doOp(storage, dbConnector, req, res, req['rawBody'])
  })

  //**** appels des opérations du module safe****
  app.use('/safe/:operation', async (req, res) => {
    let result: Object
    const opName = req.params.operation as string
    if (!req['rawBody']) {
      let chunks = [];
      req.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk))
      }).on('end', async () => {
        const body = Buffer.concat(chunks)
        await doSafeOp(opName, body, res)
      })
    } else // Cloud functions
      result = doSafeOp(opName, req['rawBody'], res)
    })
  
  return app
}

async function doSafeOp(opName: string, body: Buffer, res) {
  try {
    const result = await SafeOperation.doOp(opName, decode(body))
    if (config.debugLevel === 2) Log.info(opName + ' finished')
    const b = encode(result || {})
    res.status(200).type('application/octet-stream').send(Buffer.from(b))
  } catch(exc) { 
    ExcOp(exc, opName, res)
  }
}

function ExcOp (exc: any, opName: string, res: any) {
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

export function startSRV (app : any) : Promise<void>{
  return new Promise(async (resolve, reject) => {
    if (!await OrgsConfig.doReload(true)) reject('Cannot get orgs config')

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
  
  OrgsConfig.reload()
  const now = Date.now()
  const e = Math.floor(now / 86400000)
  if (e !== todayEpoch) { 
    todayEpoch = Math.floor(now / 86400000)
    today = Util.amj(now)
  }
  
  const opName = req.params.operation as string

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
    op.baseUrl = req.protocol + '://' + req.host
    op.org = req.params.org
    if (!op.noDB) {
      if (!dbConnector) 
        throw new AppExc(1003, 'unknown organisation', null, [opName, op.org])
      op.storage = storage
      op.dbConnector = dbConnector
    }
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
    ExcOp(exc, opName, res)
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
  const s = '[' + op.baseUrl + '] '  
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

/* La méthode static "post" soumet une opération à un SafeStore.
PAR DEFAUT c'est le MASTERDIR dont l'URL est en configuration.
SINON l'url est passée en arguments afin qu'une opération puisse 
soumettre des appels au SafeStore pour le compte d'un utilisateur "cible".
*/
export class MasterDir {
  static keys: Map<string, [string, string]> = new Map()

  static async post (opName: string, args: Object, safeStoreUrl?: string) : Promise<Object> {
    const url = (safeStoreUrl || config.MASTERDIR) + '/safe/' + opName
    const body = new Uint8Array(encode(args))
    try {
      const response = await fetch(url , {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',  // sent request
          'Accept':       'application/octet-stream'   // expected data sent back
        },
        body,
      })
      const buf = await response.bytes()
      const obj = decode(buf)
      if (response.status === 200) return obj
      throw new AppExc(3003, 'masterdir error', null, [opName, '' + response.status])
    } catch(e) {
      if (e instanceof AppExc) throw e
      throw new AppExc(3003, 'masterdir error', null, [opName, e.message])
    }
  }

  static async GetPubKeys (userId: string) : Promise<[string, string]> {
    const e = MasterDir.keys.get(userId)
    if (e) return e
    const ret = await MasterDir.post('$GetPubKeys', { userId })
    if (ret['status'] === 0) {
      const e: [string, string] = [ret['pemC'], ret['pemV']]
      MasterDir.keys.set(userId, e)
      return e
    }
    return ['', '']
  }

}