import { env, exit } from 'process' 
import webpush from 'web-push'
import { keyFromB64 } from '../src-fw/b64'
import { Crypt } from '../src-fw/crypt'
import { encryptedKeys } from './keys'

// gcp = true SI hosté par Google: AppEngine ou gcloud run
const gcp = false 

// Admins du service pour l'opérateur
const ADMINUSERS = new Set(['VpOZWh0Zeh20Tk5C1BNi'])
// Admins du Safe: vide si le Safe généric n'est pas déployé ici
const MASTERDIRADMINUSERS = new Set(['VpOZWh0Zeh20Tk5C1BNi'])

const SRVKEY = env.SRVKEY || '2_b7DjJjC4x_oaYs2Z6J2_I6igIoLmuhsuv6nBRE3QE'

import { BaseConfig } from '../src-fw/baseConfig'
export const config = {
  SVC: 'AS2',
  ADMINUSERS,
  MASTERDIRADMINUSERS,
  MASTERDIR_URL: 'http://localhost:8080/master',
  STDSAFE_URL: 'http://localhost:8080/safe',

  PROD: env.NODE_ENV === 'production' ? true : false,
  GCLOUDLOGGING: gcp ? true : false,

  SRVKEY: SRVKEY,
  keys: null,
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
  databases: null,
  storages: null,

  dbConnectors: { /*
    sqlite: AppSQLiteConnector,
    firestore: AppFirestoreConnector,
    */
  },

  SUBSMAXLIFEINMINUTES: [3 * 24 * 60, 2 * 24 * 60],
  FORMMAXLIFE: 10 * 86400, // 10 jours
  STATUSLAZYNESS: 3 * 60 // 3 minutes de prise en compte des changements de status
} as BaseConfig

// Chargement des "keys" cryptées dans config.keys
try {
  const key = Buffer.from(keyFromB64(SRVKEY))
  const bin = Buffer.from(encryptedKeys, 'base64')
  config.keys = JSON.parse(Crypt.syncDecrypt(key, bin).toString('utf-8'))
} catch (e) {
  console.error('encryptedkeys : failed to decrypt', e.toString())
  exit()
}

import { Log } from '../src-fw/log'
new Log(config.PROD, config.GCLOUDLOGGING, config.logsPath)

webpush.setVapidDetails('https://example.com/', config.keys['vapid_public_key'], config.keys['vapid_private_key'])

Log.info('Configuration pre-loaded')
