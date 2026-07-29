import { env, exit } from 'process' 
import { config } from '../src/config'
import { Log } from '../src-fw/log'

// gcp = true SI hosté par Google: AppEngine ou gcloud run
const gcp = false

import { FilesystemStorage } from '../src-filesystem' // pas d'extension spécifique de App
import { DbConnector } from '../src-fw/dbConnector'
import { IStGeneric } from '../src-fw/iStGeneric'
import { AppSQLiteConnector } from './dbSqlite' // extension spécifique de App
import { AppFirestoreConnector } from './firestore' // extension spécifique de App

config.dbConnectors = {
  sqlite: AppSQLiteConnector,
  firestore: AppFirestoreConnector
}

config.databases = new Map<string, DbConnector>([
  ['masterDB', new AppSQLiteConnector(config.keys['sqlite_z'], config.keys['sites']['A'])],
  ['safeDB', new AppSQLiteConnector(config.keys['sqlite_z'], config.keys['sites']['A'])],
  ['svcDB', new AppSQLiteConnector(config.keys['sqlite_a'], config.keys['sites']['A'])],
  // ['org1_DB', new AppSQLiteConnector(config.keys['sqlite_b'], config.keys['sites']['A'])],
  // ['svcDB', new AppFirestoreConnector(config.keys['googleCloud'], config.keys['sites']['A'])],
])

config.storages = new Map<string, IStGeneric>([
  ['svcST', new FilesystemStorage(config.keys['storage_a'])],
  // ['org1_ST', new FilesystemStorage(config.keys['storage_b'])]
])

import { schemaExcFW } from '../src-fw/schema'
import { schemaExcAS2 } from '../src-as2/schema'

let exc = schemaExcFW()
if (!exc) exc = schemaExcAS2()
if (exc) {
  Log.error(exc.toString())
  exit()
}

import { getExpressApp, startSRV } from '../src-fw/index'
import { Tools } from '../src-fw/tools'

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

Log.info('Configuration completed')

export const asocialgcf = getExpressApp()

if (process.argv.length > 2) {
  setTimeout(async () => {
    const [n, s] = await (new Tools()).run()
    if (!n) Log.info('' + s); else Log.error('' + s)
    exit()
  }, 50)
} else {
  // Commenter si appel en gcloud functions
  if (!gcp) startSRV(asocialgcf)
  .then(() => {
    Log.info('Server started')
  })
  .catch(e => {
    Log.error(e.toString())
    exit()
  })
}

