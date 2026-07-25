import { env, exit } from 'process' 
import webpush from 'web-push'
// Pour appel en tant que gcloud function
// import { HttpFunction } from '@google-cloud/functions-framework'

// gcp = true SI hosté par Google: AppEngine ou gcloud run
const gcp = false 

// Admins du service pour l'opérateur
const ADMINUSERS = new Set(['VpOZWh0Zeh20Tk5C1BNi'])
// Admins du Safe: vide si le Safe généric n'est pas déployé ici
const MASTERDIRADMINUSERS = new Set(['VpOZWh0Zeh20Tk5C1BNi'])

const SRVKEY = env.SRVKEY || '2_b7DjJjC4x_oaYs2Z6J2_I6igIoLmuhsuv6nBRE3QE'

import { encryptedKeys } from './keys'
let keys : any
// Chargement des "keys" cryptées dans config.keys
try {
  const key = Buffer.from(keyFromB64(SRVKEY))
  const bin = Buffer.from(encryptedKeys, 'base64')
  keys = JSON.parse(Crypt.syncDecrypt(key, bin).toString('utf-8'))
} catch (e) {
  console.error('encryptedkeys : failed to decrypt', e.toString())
  exit()
}


import { BaseConfig, setConfig, config } from '../src-fw/config'

setConfig({
  SVC: 'AS2',
  ADMINUSERS,
  MASTERDIRADMINUSERS,
  MASTERDIR_URL: 'http://localhost:8080/master',
  STDSAFE_URL: 'http://localhost:8080/safe',

  PROD: env.NODE_ENV === 'production' ? true : false,
  GCLOUDLOGGING: gcp ? true : false,

  SRVKEY: SRVKEY,
  keys: keys,
  STORAGE_EMULATOR_HOST: env['STORAGE_EMULATOR_HOST'] || '',
  FIRESTORE_EMULATOR_HOST: env['FIRESTORE_EMULATOR_HOST'] || '',

  BUILD: 'v1.0',
  API: 1,
  APIVERSIONS: [1, 1],
  debugLevel: 2, // 0: aucun, 1: standard: 2: élevé
  adminAlerts: false, // false: simulation true: envoi de mail

  logsPath: './logs', // Test et serveur Node
  port: env['PORT'] || 8080,
  https: false,
  origins: new Set<string>(),

  databases: new Map<string, DbConnector>(),
  storages: new Map<string, IStGeneric>(),
  safeDB: null,
  masterDB: null,
  svcDB: null,
  dbConnectors: {
    sqlite: AppSQLiteConnector,
    firestore: AppFirestoreConnector,
  },
  directoryDB: null,
  SUBSMAXLIFEINMINUTES: [3 * 24 * 60, 2 * 24 * 60],
  FORMMAXLIFE: 10 * 86400, // 10 jours
  STATUSLAZYNESS: 3 * 60 // 3 minutes de prise en compte des changements de status
  } as BaseConfig
)

webpush.setVapidDetails('https://example.com/', config.keys['vapid_public_key'], config.keys['vapid_private_key'])

import { Log } from '../src-fw/log'
new Log(config.PROD, config.GCLOUDLOGGING, config.logsPath)

import { schemaExcFW } from '../src-fw/schema'
import { schemaExcAS2 } from '../src-as2/schema'

let exc = schemaExcFW()
if (!exc) exc = schemaExcAS2()
if (exc) {
  Log.error(exc.toString())
  exit()
}

import { keyFromB64 } from '../src-fw/b64'
import { Crypt } from '../src-fw/crypt'
import { getExpressApp, startSRV } from '../src-fw/index'
import { Tools } from '../src-fw/tools'
import { FilesystemStorage } from '../src-filesystem' // pas d'extension spécifique de App
// import { SQLiteConnector} from '../src-sqlite' // pas d'extension spécifique de App
import { DbConnector } from '../src-fw/dbConnector'
import { IStGeneric } from '../src-fw/iStGeneric'
import { AppSQLiteConnector } from './dbSqlite' // extension spécifique de App
import { AppFirestoreConnector } from './firestore' // extension spécifique de App

import { loadingDF } from '../src-fw/documents'
loadingDF()

import { loadingDA } from '../src-as2/documents'
loadingDA()

import { loadingOF } from '../src-fw/operations'
loadingOF()

import { loadingOA } from './operations'
loadingOA()

import { loadingOS } from '../src-fw/safeop'
loadingOS()

import { loadingOM } from '../src-fw/masterdir'
loadingOM()

const emulator = true
if (emulator) {
  env['STORAGE_EMULATOR_HOST'] = 'http://127.0.0.1:9199', // 'http://' est REQUIS
  env['FIRESTORE_EMULATOR_HOST'] = 'localhost:8085'
}

config.databases.set('sqlite_a', new AppSQLiteConnector(keys['sqlite_a'], keys['sites']['A']))
config.databases.set('sqlite_z', new AppSQLiteConnector(keys['sqlite_z'], keys['sites']['A']))
config.databases.set('firestore', new AppFirestoreConnector(keys['googleCloud'], keys['sites']['A']))

config.safeDB = config.databases.get('sqlite_z')
config.masterDB = config.databases.get('sqlite_z')
config.svcDB = config.databases.get('sqlite_a')

config.storages.set('storage_a', new FilesystemStorage('storage_a', keys))
// config.storages.set('storage_b', new FilesystemStorage(keys['storage_b']))

export const asocialgcf = getExpressApp()

if (process.argv.length > 2) {
  setTimeout(async () => {
    const [n, s] = await (new Tools()).run()
    if (!n) console.log(s); else console.error(s)
    exit()
  }, 50)
} else {
  // Commenter si appel en gcloud functions
  if (!gcp) startSRV(asocialgcf)
  .then(() => {
    console.log('Server started')
  })
  .catch(e => {
    console.error(e.toString())
    exit()
  })
}
// console.log('Fini')
