import express from 'express'
import cors from 'cors'
import http from 'http'
import https from 'https'
import path from 'path'
import { existsSync, readFileSync } from 'node:fs'
import { encode, decode } from '@msgpack/msgpack'

import { Log } from './log'
import { config, Registry } from './config'
import { Util } from './util'
import { keyFromB64 } from './b64'

import { IStGeneric } from './iStGeneric'
import { IDbGeneric } from './iDbGeneric'
// import { StorageGeneric } from './storageGeneric'
import { Operation } from './operation'
import { SafeOperation } from './safeop'
import { MDOperation } from './masterdir'

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

export type TopicDef = {
  id: string,
  categ: string,
  key: string,
  subjects: string
  pubC: Uint8Array
  privD: Uint8Array
}

/* Configuration des organisations *****************************************
- depuis le SINGLETON 'orgs': { org1:[db1, st1], org2:[db1, st2], ...}
- une configuration courante 'current' : remplacement atomique (global)
- rechargement périodique
- évite les rechargements simultannés
*/
export class OrgsConfig {
  static current: OrgsConfig = null // configuration courante

  static updating: boolean = false // verrou de chargement en cours
  static lastLoading: number = 0 // date-heure de la configuartion courante

  orgs : Map<string, [string, string]> // Map par org => [db, storage]
  dbs : Map<string, Set<string>> // Map par db => Set des orgs
  storages : Map<string, Set<string>> // Map par storage => Set des orgs
  topics: Map<string, TopicDef>

  setOrgs (x: any) {
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

  setTopics (y: any, upd?: boolean) {
    if (!upd) this.topics = new Map<string, TopicDef>()
    /* JSON topics
    [
      { id: topic1, categ: c1, key: k12, subjects: ... },
      ...
    ] */
    for(const t of y) {
      const id = t['id']
      const categ = t['categ']
      if (!categ && upd) {
        this.topics.delete(id)
        continue
      }
      const key =  t['key']
      const k = config.keys['SVkeys'][key]
      if (!k)
        throw new AppExc(101, 'invalid_key_topic', null, [id, key])
      const subjects = t['subjects'] || null
      const pubC = keyFromB64(k.pub)
      const privD = keyFromB64(k.priv)
      const topic = { id, categ, key, subjects, pubC, privD }
      this.topics.set(id, topic)
    }
  }

  // Retourne le couple db, storage d'une organisation
  static getDbSt (org: string) : [string, string] {
    OrgsConfig.reload()
    const c = OrgsConfig.current
    return !c ? null : c.orgs.get(org)
  }

  // Rechargement périodique de la configuration des organisations
  static reload () {
    if (OrgsConfig.updating) return
    if (Date.now() - OrgsConfig.lastLoading < 300000) return
    OrgsConfig.updating = true
    setTimeout(async () => OrgsConfig.doReload(), 50)
  }

  // Sauvegarde la configuration d'une organisation
  static async save (op: AbstractOperation, org: string, db: string, st: string) {
    const val = await op.db.getSingleton('orgs') as string
    const x = val ? JSON.parse(val) : {}
    if (!db) delete(x[org])
    else x[org] = [db, st]
    const nval = JSON.stringify(x, null, '\t')
    await op.db.setSingleton('orgs', nval)
    const topics = OrgsConfig.current.topics
    const oc = new OrgsConfig()
    oc.setOrgs(x)
    oc.topics = topics
    OrgsConfig.current = oc
    OrgsConfig.updating = false
    OrgsConfig.lastLoading = Date.now()
  }

  /* Met à jour la configuration des topics
  en appliquant les directives du JSON transmis par l'application.
  */
  static async updTopics (op: AbstractOperation, json: string) {
    let y: TopicDef[]
    try { 
      y = JSON.parse(json)
    } catch (e) {
      throw new AppExc(101, 'invalid_json_topic_update', op, [e.toString()])
    }
    const oc = OrgsConfig.current
    oc.setTopics(y, true)
    OrgsConfig.lastLoading = Date.now()
    const a: TopicDef[] = []
    for(const [, t] of oc.topics) {
      const t2 = { ...t }
      delete t2.privD
      delete t2.pubC
      a.push(t2)
    }
    const nval = JSON.stringify(a, null, '\t')
    await op.db.setSingleton('topics', nval)
  }

  /* Rechargement de la configuration
  En cas d'échec, relance 1 minute plus tard
  Si 'init' est spécifié, pas de relance mais retourne false
  */
  static async doReload (init?: boolean) : Promise<boolean> {
    const op = new Operation()
    op.now = Date.now()
    try {
      const dbConnector = config.svcDB
      await dbConnector.getConnexion(op, '')
      const valx = await op.db.getSingleton('orgs') as string
      const x = JSON.parse(valx || '{}')
      const valy = await op.db.getSingleton('topics') as string
      const y = JSON.parse(valy || '[]')
      const oc = new OrgsConfig()
      oc.setOrgs(x)
      oc.setTopics(y)
      op.db.disconnect()
      OrgsConfig.current = oc
      OrgsConfig.updating = false
      OrgsConfig.lastLoading = Date.now()
      if (config.debugLevel > 0) Log.debug('Reloading orgs-topics config OK')
        return true
    } catch (e) {
      if (op && op.db) op.db.disconnect()
      Log.error('Reloading orgs-topics config KO: ' + e.toString())
      if (!init) setTimeout(OrgsConfig.doReload, 60000)
      return false
    }
  }

  static getTopics () : Array<TopicDef> {
    OrgsConfig.reload()
    const c = OrgsConfig.current
    if (!c) return []
    const a: TopicDef[] = []
    for(const [, t] of c.topics) {
      const t2 = { ...t }
      delete t2.privD
      a.push(t2)
    }
    return a
  }

  // Retourne le DbConnector à la base configurée pour l'organisation org
  static getDbConnector (org: string) : DbConnector | null {
    OrgsConfig.reload()
    const c = OrgsConfig.current
    if (!c) return null
    const e = c.orgs.get(org)
    if (!e || !e[0]) return null
    return config.databases.get(e[0]) || null
  }

  // Retourne le Storage configuré pour l'organisation org
  static getStorage (org: string) : IStGeneric | null {
    OrgsConfig.reload()
    const c = OrgsConfig.current
    if (!c) return null
    const e = c.orgs.get(org)
    if (!e || !e[1]) return null
    return config.storages.get(e[1]) || null
  }
}
/**********************************************************************/

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
        console.log('Sent : ', JSON.stringify(message))
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
  let args: Object, opName: string = '', org: string = ''
  try {
    args = decode(body)
    opName = args['opName']
    org = args['org']
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
  let args: Object, opName: string = ''
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
    if (!await OrgsConfig.doReload(true)) reject('Cannot get orgs config')

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
  const opName = args['opName']
  const org = args['org']

  const now = Date.now()
  const e = Math.floor(now / 86400000)
  if (e !== todayEpoch) { 
    todayEpoch = Math.floor(now / 86400000)
    today = Util.amj(now)
  }

  try {
    if (opName === 'yo'){
      await Util.sleep(1000)
      res.status(200).type('text/plain').send('yo ' + new Date().toISOString())
      return
    }
    
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
    op.org = org
    op.baseUrl = baseUrl

    OrgsConfig.reload()
    if (opName.endsWith('$')) {
      op.dbConnector = config.svcDB
    } else {
      op.storage = OrgsConfig.getStorage(org)
      op.dbConnector = OrgsConfig.getDbConnector(org)
    }
    if (!op.dbConnector) 
      throw new AppExc(103, 'unknown_organisation', null, [opName, op.org])

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

export async function adminAlert ( op: AbstractOperation, subject: string, text: string) {
  const org = op && op['org'] ? op['org'] : ''
  const al: admin_alerts  = config.keys['adminAlerts']
  if (al['adminAlerts'] === 0) return
  const s = (org ? 'org:' + org + ' - ' : '') 
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
