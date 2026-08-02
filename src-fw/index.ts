import express from 'express'
import cors from 'cors'
import http from 'http'
import https from 'https'
import path from 'path'
import { existsSync, readFileSync } from 'node:fs'
import axios from 'axios'
import { encode, decode } from '@msgpack/msgpack'

import { config } from '../src/config'
import { Log, setAdminAlert } from './log'
import { Registry } from './registry'
import { Util } from './util'

import { IStGeneric } from './iStGeneric'
import { IDbGeneric } from './iDbGeneric'
import { Operation } from './operation'
import { SafeOperation } from './safeop'
import { MDOperation, getSafeUrl } from './masterdir'

export class DbConnector {

  public key: Buffer
  public credentials: any
  public factory: Function

  constructor (credentials: Object, cryptKey: string) {
    if (!credentials)
      throw new AppExc(110, 'DbConnector_credentials_not_found', null)
    if (!cryptKey) 
      throw new AppExc(110, 'DbConnector_missing_crypt_key', null)
    this.key = Buffer.from(cryptKey, 'base64')
    this.credentials = credentials
  }

  async getConnexion (op: AbstractOperation, org?: string, cryptKey?: string) {
    const cnx = this.factory(this, op, cryptKey) as IDbGeneric
    cnx.org = org || '' 
    await cnx.connect()
    op.db = cnx
    return cnx
  }
}

export class DbConnexion {
  public connector: DbConnector
  public op: AbstractOperation
  public key: Buffer
  public org: string
  public transaction: any

  constructor (connector: DbConnector, op: AbstractOperation, cryptKey?: string) {
    this.connector = connector
    this.key = !cryptKey ? this.connector.key : Buffer.from(cryptKey, 'base64')
    this.op = op
  }
}

/** ExpressApp ********************************************************/
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
        Log.info('Sent : ' + JSON.stringify(message))
      } catch (e) {
        res.status(200).json({ success: false, message: e.toString() })
      }
    } catch (error) {
      console.error("Error sending notification:", error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  /* Appels des opérations *************************************************/
  app.use('/op', async (req, res) => {
    if (config.origins.size&& !checkOrigin(req, res, config.origins)) return
    const baseUrl = req.protocol + '://' + req.host
    if (!req['rawBody']) {
      let chunks = [];
      req.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk))
      }).on('end', async () => {
        const body = Buffer.concat(chunks)
        await doSvcOp(res, body, baseUrl)
      })
    } else // Cloud functions
      await doSvcOp(res, req['rawBody'], baseUrl)
  })

  /* Appels des opérations sur le SAFE store *****************************/
  app.use('/safe', async (req, res) => {
    if (!req['rawBody']) {
      let chunks = [];
      req.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk))
      }).on('end', async () => {
        const body = Buffer.concat(chunks)
        await doSOp(body, res)
      })
    } else // Cloud functions
      await doSOp(req['rawBody'], res)
    })

  /* Appels des opérations sur le SAFE store *****************************/
  app.use('/master', async (req, res) => {
    if (!req['rawBody']) {
      let chunks = [];
      req.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk))
      }).on('end', async () => {
        const body = Buffer.concat(chunks)
        await doMDOp(body, res)
      })
    } else // Cloud functions
      await doMDOp(req['rawBody'], res)
  })

  return app
}

/* Retourne true si "origin" d'une requête est dans la liste autorisée,
sinon génère une resonse avec un texte d'exception.*/
function checkOrigin(req: express.Request, res: express.Response, origins: Set<string>) : boolean {
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
  const e = new AppExc(103, 'origin_not_authorized', null, [origin])
  if (config.debugLevel === 2)
    Log.info('origin_not_authorized: ' + origin)
  const b: Buffer = e.serial()
  res.status(401).type('application/octet-stream').send(b)
  return false
}

// Opérations d'un service
async function doSvcOp (res: express.Response, body: Buffer, baseUrl: string) {
  let args: Object
  try {
    args = decode(body)
  } catch (e) {
    ExcDecode(res, 1)
    return
  }
  await doOp(args, res, baseUrl)
}

// Opérations MasterDir
async function doMDOp(body: Buffer, res: express.Response) {
  let args: Object, opName: string = ''
  try {
    args = decode(body)
    opName = args['opName']
  } catch (e) {
    ExcDecode(res, 2)
    return
  }
  try {
    const result = await MDOperation.doOp(opName, args)
    const b = encode(result) as Buffer
    res.status(200).type('application/octet-stream').send(Buffer.from(b))
    if (config.debugLevel === 2) Log.info(opName + ' finished')
  } catch (exc: any) {
    ExcOp(exc, opName, res, 2)
  }
}

async function doSOp(body: Buffer, res: express.Response) {
  let args: Object, opName: string
  try {
    args = decode(body)
    opName = args['opName']
  } catch (e) {
    ExcDecode(res, 3)
    return
  }
  try {
    const result = await SafeOperation.doOp(opName, args)
    const b = encode(result) as Buffer
    res.status(200).type('application/octet-stream').send(Buffer.from(b))
    if (config.debugLevel === 2) Log.info(opName + ' finished')
  } catch (exc: any) {
    ExcOp(exc, opName, res, 3)
  }
}

function ExcDecode (res: express.Response, src: number) {
  const s = ['', 'service', 'masterdir', 'safe'][src]
  if (config.debugLevel === 2)
    Log.info(s + ' terminated on exception arguments NOT decodable')
  const e = new AppExc(105, s + '_arguments_notdecodable', null)
  const b: Buffer = e.serial()
  res.status(401).type('application/octet-stream').send(b)
}

function ExcOp (exc: any, opName: string, res: express.Response, src: number) {
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
    const s = ['', 'service', 'masterdir', 'safe'][src]
    const e2 = new AppExc(105, s + '_unexpected_exception', null, [e.message], e.stack || '')
    b = e2.serial()
    st = 401
  }
  res.status(st).type('application/octet-stream').send(b)
}

/* Lancement du serveur **************************************************/
export function startSRV (app : any) : Promise<void> {
  return new Promise(async (resolve, reject) => {
    // if (!await OrgsConfig.doReload(true)) reject('Cannot get orgs config')

    let server : http.Server | https.Server

    if (config.https) {
      let p = path.resolve('./cert/fullchain.pem')
      const cert = existsSync(p) ? readFileSync(p) : ''
      if (!cert)
        throw new AppExc(110, 'startSRV_certificate_not_found', null, [p])
      p = path.resolve('./cert/privkey.pem')
      const key = existsSync(p) ? readFileSync(p) : ''
      if (!key ) 
        throw new AppExc(110, 'startSRV_private_key_not_found', null, [p])
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

let today = 0
let todayEpoch = 0

export async function doOp (args: Object, res: express.Response, baseUrl: string) {
  const now = Date.now()
  const e = Math.floor(now / 86400000)
  if (e !== todayEpoch) { 
    todayEpoch = Math.floor(now / 86400000)
    today = Util.amj(now)
  }

  const opName = args['opName']

  if (opName.startsWith('CONFIG$')) {
    let obj : Object
    switch (opName) {
      case 'CONFIG$CKey' : 
        const dc = config.keys['DCKeys'][args['name']]
        obj = { key: dc ? dc.pub : '' }
        break
      case 'CONFIG$VKey' : 
        const sv = config.keys['SVKeys'][args['name']]
        obj = { key: sv ? sv.pub : '' }
        break
      case 'CONFIG$yo' : 
        await Util.sleep(1000)
        res.status(200).type('text/plain').send('yo ' + new Date().toISOString())
        return
      default :
        const e = new AppExc(103, 'unknown_operation', null, [opName])
        const b: Buffer = e.serial()
        res.status(401).type('application/octet-stream').send(b)
        return
    }
    const b = encode(obj)
    res.status(200).type('application/octet-stream').send(Buffer.from(b))
    return
  }

  try {
    const op = Registry.newOp(opName) as Operation
    if (!op) throw new AppExc(103, 'unknown_operation', null, [opName])

    const apiv = args['APIVERSION'] || 0
    if (apiv && (apiv < config.APIVERSIONS[0] || apiv > config.APIVERSIONS[1]))
      throw new AppExc(103, 'unsupported_API', null, [config.APIVERSIONS[0], 
        config.APIVERSIONS[1], apiv, config.BUILD])

    op.now = now
    op.today = today
    op.args = args
    op.opName = opName
    op.baseUrl = baseUrl

    if (opName.startsWith('ADMIN$')) {
      op.site = args['site']
      op.dbConnector = config.databases.get('svcDB')
    } else {
      op.svc = args['svc']
      op.org = args['org']
      op.dbConnector = config.databases.get(op.org + '_DB') || config.databases.get('svcDB')
      op.storage = config.storages.get(op.org + '_ST') || config.storages.get('svcST')
    }

    op.init()

    await op.run()

    if (config.debugLevel === 2)
      Log.info(opName + ' finished')

    const b = encode(op.result || {})
    res.status(200).type('application/octet-stream').send(Buffer.from(b))
  } catch(exc) {
    ExcOp(exc, opName, res, 1)
  }
}

/* Envoi d'une alerte d'administration **************************************/
interface admin_alerts { url: string, pwd: string, to: string }

function adminAlert ( op: AbstractOperation, subject: string, text: string) {
  const org = op && op['org'] ? op['org'] : ''
  const al: admin_alerts  = config.keys['adminAlerts']
  if (al['adminAlerts'] === 0) return
  const s = (org ? 'org:' + org + ' - ' : '') 
    + (op ? 'op:' + op.opName + ' - ' : '') 
    + subject
  Log.info('Mail sent to:' + al.to + ' subject:' + s + (text ? '\n' + text : ''))

  if (!config.adminAlerts) return

  setTimeout(async () => {
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
  }, 1)
}
setAdminAlert(adminAlert)

/* Classe AppExc ********************************************************/
export class AppExc {
  /* codes:
  Détecté par l'application
  1: erreur fonctionnelle APP
  2: erreur fonctionnelle FW
  3: assertion FW - BUG: 
  4: assertion APP - BUG:
  8: FW : Exception technique DB / réseau
  9: APP: Exception technique DB / réseau
  10: FW : Exception technique DB / réseau : configuration suspectée
  11: APP: Exception technique DB / réseau : configuration suspectée
  99: Interruption actionnée par l'utilisateur

  Remonté d'un service - assertions 13...16 transmises à l'adiministarteur
  101: erreur fonctionnelle FW : non détectable par l'application
  102: erreur fonctionnelle APP : non détectable par l'application
  103: assertion FW - BUG: l'erreur fonctionnelle est censée avoir été bloquée par l'application
  104: assertion APP - BUG: l'erreur fonctionnelle est censée avoir été bloquée par l'application
  105: assertions FW - Données incohérentes non détectables par l'application
  106: assertions APP - Données incohérentes non détectables par l'application
  108: FW : Exception technique DB / réseau
  109: APP : Exception technique DB / réseau
  110: FW : Exception technique DB / réseau : configuration suspectée
  111: APP : Exception technique DB / réseau : configuration suspectée
  */

  public code: number
  public label: string
  public opName: string
  public org: string
  public stack: string
  public args: string[]

  static important = new Set([103, 104, 108, 109, 110, 111])

  constructor (code: number, label: string, op: AbstractOperation, args?: string[], stack?: string) {
    this.label = label
    this.code = code
    this.opName = op ? op.opName : ''
    this.org = op && op['org'] ? op['org'] : ''
    this.args = args || []
    this.stack = stack || ''
    if (code > 103) Log.error(this.message)
    else { if (config.debugLevel > 0) Log.debug(this.toString()) }
    if (AppExc.important.has(code))
      adminAlert(op, this.message, this.stack)
  }

  serial () { 
    return Buffer.from(encode({code: this.code, label: this.label, opName: this.opName,
      org: this.org, stack: this.stack, args: this.args}))
  }

  get message () { return 'AppExc: ' + this.code + ':' + this.label + 
    (this.opName ? '@' + this.opName + ':' : '') 
    + JSON.stringify(this.args || []) }

  toString () { return this.message + (this.stack ? '\n' + this.stack : '')}
}

export interface AbstractOperation {
  opName: string
  result: any
  args: any 
  db: any
  now: number

  /* Fixe LA valeur de la propriété 'prop' du résultat (et la retourne)*/
  setRes(prop: string, val: any) : void
}

export interface OperationWC extends AbstractOperation {
  org: string
  cache: any
  authRecord: any

  transac () : Promise<void>
}

/************************************************************
Accès HTTP au MasterDir et aux Safes depuis les opérations
**************************************************************/
type ICVS = {
  i: string
  c: string
  v: string
  s: string
  dh: number
}

async function requestWithRetry(config, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await axios(config);
    } catch (error) {
      lastError = error;
      
      // Check if it's a connection reset error
      const isResetError = 
        error.code === 'ECONNRESET' ||
        error.code === 'EPIPE' ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ETIMEDOUT';
      
      if (!isResetError || attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      const jitter = Math.floor(Math.random() * 250);
      console.log(`Connection reset, retrying in ${delay + jitter}ms (attempt ${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }
  
  throw lastError;
}

export class MDandSafe {
  static icvsCache : Map<string, ICVS> = new Map()
  static lastClean : number = Date.now()

  static cleanCache () : number{
    const now: number = Date.now()
    if ((now - MDandSafe.lastClean) < 3600000) return now
    for (const [id, x] of MDandSafe.icvsCache)
      if ((now - x.dh) > 1800000) MDandSafe.icvsCache.delete(id)
    MDandSafe.lastClean = now
    return now
  }

  static headers: {
    'Content-Type': 'application/octet-stream',  // sent request
    'Accept':       'application/octet-stream'   // expected data sent back
  }

  /* SANS axios
  static async postMDS1 (url: string, args: any) : Promise<Object> {
    try {
      const body = Buffer.from(encode(args))
      const response = await fetch(url, {
        method: 'POST', headers: MDandSafe.headers, body
      })
      const buf = await response.bytes()
      const obj = decode(buf)
      if (response.status === 200) return obj
      const txt = new TextDecoder().decode(buf)
      throw new AppExc(108, 'remote_md_safes_access_status', args, [(url || '?'), '' + response.status, txt])
    } catch (e: any) {
      if (e instanceof AppExc) throw e
      throw new AppExc(108, 'remote_md_safes_access_exc', args, [(url || '?'), e.toString()], e.stack)
    }
  }
  */

  static async postMDS (url: string, args: any) : Promise<Object> {
    try {
      const maxRetries = 3
      let lastError
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const body = Buffer.from(encode(args))
          /*
          // Interface fetch
          const response = await fetch(url, {
            method: 'POST', headers: MDandSafe.headers, body
          })
          const buf = await response.bytes()
          */
          
          // Interface axios
          const response = await axios.post(url, body, { 
            headers: MDandSafe.headers,
            responseType: 'arraybuffer',
            timeout: 600000
          })
          const buf = Buffer.from(response.data)
          
          const obj = decode(buf)
          if (response.status === 200) return obj
          const txt = new TextDecoder().decode(buf)
          throw new AppExc(108, 'remote_md_safes_access_status', args, [(url || '?'), '' + response.status, txt])
        } catch (error) {
          lastError = error;
          
          // Check if it's a connection reset error
          const isResetError = 
            error.code === 'ECONNRESET' ||
            error.code === 'EPIPE' ||
            error.code === 'ECONNABORTED' ||
            error.code === 'ETIMEDOUT';
          
          if (!isResetError || attempt === maxRetries) {
            throw error;
          }
          
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          const jitter = Math.floor(Math.random() * 250);
          console.log(`Connection reset, retrying in ${delay + jitter}ms (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay + jitter));
        }
  }
  
  throw lastError;
      } 
    } catch (e: any) {
      if (e instanceof AppExc) throw e
      throw new AppExc(108, 'remote_md_safes_access_exc', args, [(url || '?'), e.toString()], e.stack)
    }
  }

  static async getCVS (userId: string) : Promise<[string, string, string] | null> {
    const now = MDandSafe.cleanCache()
    let icvs = MDandSafe.icvsCache.get(userId)
    if (icvs) return [icvs.c, icvs.v, icvs.s]
    const args = {
      opName: '$mdUserGetICVS',
      userId: userId
    }
    const res: any = await MDandSafe.postMDS(config.MASTERDIR_URL, args)
    icvs = res.icvs
    if (!icvs) return null
    icvs.dh = now
    MDandSafe.icvsCache.set(userId, icvs)
    /* Test accès Safe
    const r: any = await this.doSafeOp(userId, '$Ping', {})
    Log.info(r.ping)
    */
    return [icvs.c, icvs.v, icvs.s]
  }

  static async doSafeOp (op: Operation, userId: string, opName: string, args: any) : Promise<Object> {
    const cvs = await MDandSafe.getCVS(userId)
    if (!cvs) return { status: 101 }
    const url = await getSafeUrl(op, cvs[2])
    args.opName = opName
    return await MDandSafe.postMDS(url, args)
  }

}
