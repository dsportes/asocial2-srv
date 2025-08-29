import { env, exit } from 'process' 
// Pour appel en tant que gcloud function
// import { HttpFunction } from '@google-cloud/functions-framework'

// Si hosté par Google: AppEngine ou gcloud run
const gcp = false 

import { encryptedKeys } from './keys'
import { Util } from '../src-fw/util'
import { Crypt } from '../src-fw/crypt'
import { BaseConfig, init, getExpressApp, startSRV } from '../src-fw/index'
import { Log } from '../src-fw/log'
import { docSchema } from './docschema'
import { factory } from './factories'
import { documentClasses } from './documents'
import { register } from './operations'
import { Tools } from '../src-fw/tools'

import { FilesystemStorage } from '../src-filesystem' // pas d'extension spécifique de App

// import { SQLiteConnector} from '../src-sqlite' // pas d'extension spécifique de App
import { AppSQLiteConnector } from './dbSqlite' // extension spécifique de App
import { AppFirestoreConnector } from './firestore' // extension spécifique de App

const emulator = true
if (emulator) {
  env['STORAGE_EMULATOR_HOST'] = 'http://127.0.0.1:9199', // 'http://' est REQUIS
  env['FIRESTORE_EMULATOR_HOST'] = 'localhost:8085'
}

const SRVKEY = env.SRVKEY || '2_b7DjJjC4x_oaYs2Z6J2_I6igIoLmuhsuv6nBRE3QE'

let keys : any
// Chargement des "keys" cryptées dans config.keys
try {
  const key = Buffer.from(Util.b64ToU8(SRVKEY))
  const bin = Buffer.from(encryptedKeys, 'base64')
  keys = JSON.parse(Crypt.syncDecrypt(key, bin).toString('utf-8'))
} catch (e) {
  console.error('encryptedkeys : failed to decrypt', e.toString())
  exit()
}

const config: BaseConfig = {
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
  adminAlerts: true, // false: simulation true: envoi de mail

  logsPath: './logs', // Test et serveur Node
  port: env['PORT'] || 8080,
  https: false,
  origins: new Set<string>(/*['http://localhost:8080']*/),

  // Informatif ET uitlisé par storage: File-System et GC en mode EMULATOR
  srvUrl: 'http://localhost:8080',

  databases: null,
  storages: null,
  docSchema: null,
  factory: factory,
  documentClasses: documentClasses 
}

init(config)

config.databases = [
  ['sqlite_a', new AppSQLiteConnector(keys['sqlite_a'], keys['sites']['A']),],
  ['firestore', new AppFirestoreConnector(keys['googleCloud'], keys['sites']['A']),],
]

config.storages = [
  ['storage_a', new FilesystemStorage(keys['storage_a'])],
  // ['storage_b', new FilesystemStorage(keys['storage_b'])],
]

config.docSchema = docSchema

if (docSchema.errors) {
  console.error(docSchema.errors.join('\n'))
  exit()
}

const nbOp = register()
if (config.debugLevel > 0)
  Log.debug(nbOp + ' App operations registered')

export const asocialgcf = getExpressApp()

if (process.argv.length > 2) {
  setTimeout(async () => {
    const [n, s] = await (new Tools(config)).run()
    if (!n) console.log(s); else console.error(s)
    exit()
  }, 50)
} else {
  // Commenter si appel en gloud functions
  if (!gcp) startSRV(asocialgcf)
  .then(() => {
    console.log('Server started')
  })
  .catch(e => {
    console.error(e.toString())
    exit()
  })
}
