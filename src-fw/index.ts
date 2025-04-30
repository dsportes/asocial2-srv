import express from 'express'
import cors from 'cors'
import http from 'http'
import https from 'https'
import path from 'path'
import { exit, env } from 'process'
import { existsSync, readFileSync } from 'node:fs'
import crypto from 'crypto'

import { json64 } from './keys'
import { Operation, newOperation, getFile, putFile } from './operation'
import { amj, sleep, getHP } from './util'
import { AppExc } from './exception'
import { encode, decode } from '@msgpack/msgpack'

import { nbOp } from './operations'

import { config } from '../src-app/app'
config.PROD = env.NODE_ENV === 'production' ? true : false
config.GAE = env.GAE_INSTANCE || ''

for (const n in config.env) env[n] = config.env[n]

import { logDebug, logInfo, logError } from './log'

function getSalt () {
  const s = new Uint8Array(16)
  for (let j = 0; j < 16; j++) s[j] = j + 47
  return Buffer.from(s)
}

function decrypt (key: Buffer, bin: Buffer) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, getSalt())
  const b1 = decipher.update(bin)
  const b2 = decipher.final()
  return Buffer.concat([b1, b2])
}

function loadKeys () {
  try {
    const keyB64 = env.SRVKEY
    if (keyB64) {
      const key = Buffer.from(keyB64, 'base64')
      const bin = Buffer.from(json64, 'base64')
      const x = decrypt(key, bin).toString('utf-8')
      config.keys = JSON.parse(x)
    } else {
      logError('env.SRVKeY NOT FOUND')
      exit()
    }
  } catch (e) {
    logError('./keys.bin or ./keys.json is NOT readable / decipherable: ' + e.toString())
    exit()
  }
}

try {

  loadKeys()

  logInfo('nbOp=' + nbOp)

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
      const bytes = await getFile(req.params.arg)
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
        await putFile(req.params.arg, bytes)
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
        await doOp(req, res, body)
      })
    } else
      await doOp(req, res, req['rawBody'])
  })

  const port = env.PORT || config.port
  let server

  if (config.https) {
    let p = path.resolve('./cert/fullchain.pem')
    const cert = existsSync(p) ? readFileSync(p) : ''
    if (!cert) {
      logError(p + ' NOT FOUND')
      exit()
    }
    p = path.resolve('./cert/privkey.pem')
    const key = existsSync(p) ? readFileSync(p) : ''
    if (!key ) {
      logError(p + ' NOT FOUND')
      exit()
    }
    server = https.createServer({key, cert}, app).listen(port, () => {
      logInfo('HTTPS listen [' + config.port + ']')
    })
  } else {
    server = http.createServer(app).listen(port, () => {
      logInfo('HTTP listen [' + port + ']')
    })
  }

  if (server)
    server.on('error', (e) => { // les erreurs de création du server ne sont pas des exceptions
      logError('HTTP/S error: ' + e.message + '\n' + e.stack)
      exit()
    })
} catch(e) { // exception générale. Ne devrait jamais être levée
  logError('MAIN error: ' + e.message + '\n' + e.stack)
  exit()
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
  throw new AppExc(null, 1001, 'origin not authorized', [origin])
}

let today = 0
let todayEpoch = 0

async function doOp (req: express.Request, res: express.Response, body: Buffer) {
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
    
    op = newOperation (opName)
    if (!op) throw new AppExc(op, 1002, 'unknown operation', [opName])
    op.today = today
    op.args = decode(body)
    op.params = {}

    if (op.args.APIVERSION && (op.args.APIVERSION < config.APIVERSIONS[0] || op.args.APIVERSION > config.APIVERSIONS[1]))
      throw new AppExc(op, 1003, 'unsupported API', [config.APIVERSIONS[0], config.APIVERSIONS[1], op.args.APIVERSION, config.BUILD])

    op.init()
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
      const e2 = new AppExc(op, 1999, 'unexpected exception', [e.message], e.stack || '')
      b = e2.serial()
      st = 401
    }
    res.status(st).type('application/octet-stream').send(b)
  }
}
