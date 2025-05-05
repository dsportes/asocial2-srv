import express from 'express'
import cors from 'cors'
import http from 'http'
import https from 'https'
import path from 'path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { exit, env } from 'process'

import { crypt, pbkdf2 } from './util'

import { Log as MyLog  } from './log'
export const Log = MyLog

import { Operation, newOperation, fakeOperation } from './operation'
import { amj, sleep, getHP, decrypt } from './util'
import { AppExc } from './exception'
import { encode, decode } from '@msgpack/msgpack'

import { registerOpBase } from '../src-fw/operations'

import { dbConnexion } from '../src/appDbSt'
import { stConnexion } from './stConfig'
import { StGeneric } from '../src/appDbSt'

export interface BaseConfig {
  BUILD: string, // 'v1.0'
  API: number, // 1
  APIVERSIONS: number[], // [1, 1]
  PROD: boolean,

  GAE: string, // ''
  logsPath: string, // './logs'
  port: number, // 8080
  https: boolean,
  origins: Set<string>, // new Set<string>(['http://localhost:8080']),
  site: string, // 'A'
  database: string, // 'sqla'
  storage: string,  // 'fsa'
  // Uitlisé seulement par les storage: File-System et GC en mode EMULATOR
  srvUrl: string, // '' si défaut 'http://localhost:8080'

  debugLevel: number, // 0: aucun, 1: standard: 2: élevé
  adminAlerts: boolean, // false: simulation true: envoi de mail

  dbOptions: Object,
  /* {
    sqla: { path: 'sqlite/testa.db3', cryptIds: false, credentials: 'sqlite' },
    sqlb: { path: 'sqlite/testb.db3', cryptIds: true, credentials: 'sqlite' }
  } */
  
  stOptions: Object,
  /* {
    fsa: { bucket: 'filestorea', cryptIds: false, credentials: 'storageFS'}
  } */

  env: Object,
  /* {
    STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199', // 'http://' est REQUIS
    FIRESTORE_EMULATOR_HOST: 'localhost:8085'
  } */

  keys: Object
}

const PROD = env.NODE_ENV === 'production' ? true : false
const GAE = env.GAE_INSTANCE || ''

// @ts-ignore
export const config: BaseConfig = { PROD, GAE }

export async function startApp (appConfig: BaseConfig, encryptedKeys: string) : Promise<void> {
  return new Promise((resolve, reject) => {
    for(const e in appConfig) config[e] = appConfig[e]
    for(const e in appConfig['env']) env[e] = appConfig.env[e]

    new MyLog(PROD, GAE, config['logsPath'])

    // Chargement des "keys" cryptées dans 
    try {
      const keyB64 = env.SRVKEY
      if (keyB64) {
        const key = Buffer.from(keyB64, 'base64')
        const bin = Buffer.from(encryptedKeys, 'base64')
        const x = decrypt(key, bin).toString('utf-8')
        config['keys'] = JSON.parse(x)
      } else {
        const m = 'env.SRVKeY NOT FOUND'
        MyLog.error(m)
        reject(m)
      }
    } catch (e) {
      const m = './keys.bin or ./keys.json is NOT readable / decipherable: ' + e.toString()
      MyLog.error(m)
      reject()
    }

    registerOpBase()

    startSRV(reject)

    resolve()
  })
}

async function startSRV (reject: Function) {
try {

  if (!config.database) 
    throw new AppExc(1012, 'config.database not found', null)
  if (!config.dbOptions || !config.dbOptions[config.database])
    throw new AppExc(1013, 'config.dbOptions not found', null, [config.database])
  if (!config.site || !config.keys['sites'][config.site])
    throw new AppExc(1014, 'config.site not found or no key', null, [config.site || '?'])

  if (!config.storage) 
    throw new AppExc(1012, 'config.storage not found', null)
  const storage = stConnexion(config.storage, config.site)

  if (config.debugLevel === 2)
    await testDb(storage)

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
        await doOp(storage, req, res, body)
      })
    } else // Cloud functions
      await doOp(storage, req, res, req['rawBody'])
  })

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
      Log.info('HTTPS listen [' + config.port + ']')
    })
  } else {
    server = http.createServer(app).listen(port, async () => {
      Log.info('HTTP listen [' + port + ']')
    })
  }

  if (server)
    server.on('error', (e) => { // les erreurs de création du server ne sont pas des exceptions
      Log.error('HTTP/S error: ' + e.message + '\n' + e.stack)
      throw new AppExc(1016, 'HTTP/S error', null, [e.message])
    })
} catch(e) { // exception générale. Ne devrait jamais être levée
  Log.error('MAIN error: ' + e.message + '\n' + e.stack)
  reject('MAIN error: ' + e.message)
}
}

async function testDb (storage: StGeneric) {
  const op = fakeOperation()
  await dbConnexion(config.database, config.site, op)
  {
    const [status, msg] = await op.db.ping()
    if (status === 0) Log.info(msg)
    else throw new AppExc(1016, 'PING SDatabase FAILED', null, [msg])
  }
  {
    const [status, msg] = await storage.ping()
    if (status === 0) Log.info(msg)
    else throw new AppExc(1017, 'PING Storage FAILED', null, [msg])
  }
}

/****************************************************************/
function checkOrigin(req: express.Request) {
  const o = config.origins
  let origin = req.headers['origin']
  if (o.has(origin)) return true
  if (!origin || origin === 'null') {
    const referer = req.headers['referer']
    if (referer) origin = referer
  }
  if (o.has(origin)) return true
  if (!origin || origin === 'null') origin = req.headers['host']
  const [hn, po] = getHP(origin)
  if (o.has(hn) || o.has(hn + ':' + po)) return true
  throw new AppExc(1001, 'origin not authorized', null, [origin])
}

let today = 0
let todayEpoch = 0

async function doOp (storage, req: express.Request, res: express.Response, body: Buffer) {
  const now = Date.now()
  const e = Math.floor(now / 86400000)
  if (e !== todayEpoch) { 
    todayEpoch = Math.floor(now / 86400000)
    today = amj(now)
  }

  const opName = req.params.operation
  let op: Operation = null

  try {
    if (opName === 'yo'){
      await sleep(1000)
      res.status(200).type('text/plain').send('yo ' + new Date().toISOString())
      return
    }

    if (config.origins.size) checkOrigin(req)

    if (opName === 'yoyo'){
      await sleep(1000)
      res.status(200).type('text/plain').send('yoyo ' + new Date().toISOString())
      return
    }
    
    op = newOperation(opName)
    if (!op) throw new AppExc(1002, 'unknown operation', null, [opName])
    op.storage = storage
    op.today = today
    op.args = decode(body)
    op.params = {}

    if (op.args.APIVERSION && (op.args.APIVERSION < config.APIVERSIONS[0] || op.args.APIVERSION > config.APIVERSIONS[1]))
      throw new AppExc(1003, 'unsupported API', null, [config.APIVERSIONS[0], config.APIVERSIONS[1], op.args.APIVERSION, config.BUILD])

    op.init()

    await dbConnexion(config.database, config.site, op)

    await op.run()
    const b = encode(op.result || {})
    res.status(200).type('application/octet-stream').send(Buffer.from(b))
  } catch(exc) {
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
  const key = pbkdf2(pwd)
  console.log('key= ' + key.toString('base64'))
  const pjson = path.resolve('./keys.json')
  if (!existsSync(pjson)) {
    console.log('./keys.json NOT FOUND')
  } else {
    try {
      const buf = readFileSync(pjson)
      const b64 = crypt(key, buf).toString('base64')
      const pmjs = path.resolve('./src-fw/keys.ts')
      const x = 'export const json64 = \'' + b64 + '\'' + '\n'
      writeFileSync(pmjs, Buffer.from(x, 'utf8'))
      console.log('./src-fw/keys.js written')
    } catch (e) {
      console.log('Encryption failed. ' + e.message)
    }
  }
}
