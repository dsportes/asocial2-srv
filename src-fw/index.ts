import express from 'express'
import cors from 'cors'
import http from 'http'
import https from 'https'
import path from 'path'
import { exit, env } from 'process'
import { existsSync, readFileSync } from 'node:fs'
import crypto from 'crypto'

import { json64 } from './keys'
// import { encode, decode } from '@msgpack/msgpack'

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
