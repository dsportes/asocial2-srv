import { env, exit } from 'process' 
// Pour appel en tant que gcloud function
// import { HttpFunction } from '@google-cloud/functions-framework'
const HttpFunction = null

import { encryptedKeys } from './keys'

import { BaseConfig, init, getExpressApp, startSRV, Log } from '../src-fw/index'

import { register } from './operations'

import { FsConnector } from '../src-fs'
// import { SQLiteConnector} from '../src-sl'
import { AppSQLiteConnector } from './dbSqlite'

const emulator = false
if (emulator) {
  env['STORAGE_EMULATOR_HOST'] = 'http://127.0.0.1:9199', // 'http://' est REQUIS
  env['FIRESTORE_EMULATOR_HOST'] = 'localhost:8085'
}

// Si hosté par Google: AppEngine ou gcloud run
const gcp = HttpFunction || env['GAE_INSTANCE'] 

const config: BaseConfig = {
  PROD: env.NODE_ENV === 'production' ? true : false,
  GCLOUDLOGGING: gcp ? true : false,
  SRVKEY: env.SRVKEY || '1NjTfoejVNYqWuMKd3NpufaJDT1HQsnlBhRtF9orfug=',
  STORAGE_EMULATOR_HOST: env['STORAGE_EMULATOR_HOST'] || '',
  FIRESTORE_EMULATOR_HOST: env['FIRESTORE_EMULATOR_HOST'] || '',

  BUILD: 'v1.0',
  API: 1,
  APIVERSIONS: [1, 1],
  debugLevel: 2, // 0: aucun, 1: standard: 2: élevé
  adminAlerts: true, // false: simulation true: envoi de mail

  logsPath: './logs', // Test et serveur Node
  port: env['PORT'] ? parseInt(env['PORT']) : 8080,
  https: false,
  origins: new Set<string>(/*['http://localhost:8080']*/),

  site: 'A',
  database: gcp ? null : 'sqla',
  storage: gcp ? null : 'fsa',
  // Uitlisé seulement par les storage: File-System et GC en mode EMULATOR
  srvUrl: 'http://localhost:8080', // '' si défaut 'http://localhost:8080'

  keys: {}
}

init(config, encryptedKeys)
const nbOp = register()
if (config.debugLevel > 0)
  Log.debug(nbOp + ' App operations registered')

const x0 = new FsConnector('fsa', 'filestorea', true, 'storageFS')
const x1 = new AppSQLiteConnector('sqla', 'sqlite/testa.db3', false, 'sqlite')
// const x2 = new SQLiteConnector('sqlb', 'sqlite/testb.db3', false, 'sqlite')

export const asocialGCF = getExpressApp()

if (!gcp) startSRV()
.then(() => {
  console.log('Server started')
})
.catch(e => {
  console.error(e.toString())
  exit()
})

