import express from 'express'
import cors from 'cors'
import http from 'http'
import https from 'https'
import path from 'path'
import { exit, env } from 'process'
import { existsSync, readFileSync } from 'node:fs'

import winston from 'winston'
import { LoggingWinston } from '@google-cloud/logging-winston'
// import { encode, decode } from '@msgpack/msgpack'

import { config } from '../src-app/app.js'
config.NODE_ENV = env.NODE_ENV
config.GAE = env.GAE_INSTANCE

function setLogger () {
  let lg
  if (config.GAE) {
    // Imports the Google Cloud client library for Winston
    const loggingWinston = new LoggingWinston()
    // Logs will be written to: "projects/YOUR_PROJECT_ID/logs/winston_log"
    lg = winston.createLogger({
      level: 'info',
      transports: [
        new winston.transports.Console(),
        // Add Cloud Logging
        loggingWinston,
      ],
    })
  } else {
    // const { format, transports } = require('winston')
    // const { combine, timestamp, label, printf } = format
    const fne = config.logsPath + '/error.log'
    const fnc = config.logsPath + '/combined.log'
    const myFormat = winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level}: ${message}`
    })
    lg = winston.createLogger({
      level: 'info',
      format: winston.format.combine(winston.format.timestamp(), myFormat),
      // defaultMeta: { service: 'user-service' },
      transports: [
        // - Write all logs with importance level of `error` or less to `error.log`
        // - Write all logs with importance level of `info` or less to `combined.log`
        new winston.transports.File({ filename: fne, level: 'error' }),
        new winston.transports.File({ filename: fnc }),
      ],
    })
    // If we're not in production then log to the `console
    if (config.NODE_ENV !== 'production')
      lg.add(new winston.transports.Console())
  }
  config.logger = lg
}

try {

  setLogger()

  const app = express()
  app.use(cors({}))

  // OPTIONS est toujours envoyé pour tester les appels cross origin
  app.use('/', (req, res, next) => {
    if (req.method === 'OPTIONS')res.send('')
    else next()
  })

  app.get('/robots.txt', (req, res) => {
    const rob = 'User-agent: *\nDisallow: /\n'
    res.send(rob)
  })

  app.get('/ping', (req, res) => {
    res.send(new Date().toISOString())
  })

  let server

  if (config.https) {
    let p = path.resolve('./cert/fullchain.pem')
    const cert = existsSync(p) ? readFileSync(p) : ''
    if (!cert) {
      config.logger.error(p + ' NOT FOUND')
      exit()
    }
    p = path.resolve('./cert/privkey.pem')
    const key = existsSync(p) ? readFileSync(p) : ''
    if (!key ) {
      config.logger.error(p + ' NOT FOUND')
      exit()
    }
    server = https.createServer({key, cert, app}).listen(config.port, () => {
      config.logger.info('HTTPS listen [' + config.port + ']')
    })
  } else {
    server = http.createServer(app).listen(config.port, () => {
      config.logger.info('HTTP listen [' + config.port + ']')
    })
  }

  if (server)
    server.on('error', (e) => { // les erreurs de création du server ne sont pas des exceptions
      config.logger.error('HTTP/S error: ' + e.message + '\n' + e.stack)
      exit()
    })
} catch(e) { // exception générale. Ne devrait jamais être levée
  config.logger.error('MAIN error: ' + e.message + '\n' + e.stack)
  exit()
}
