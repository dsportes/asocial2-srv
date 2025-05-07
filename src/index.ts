/* Pour appel en tant que gcloud function:
import functions from '@google-cloud/functions-framework'
const gcloudfunction = true
*/

// import { HttpFunction } from '@google-cloud/functions-framework'

const gcloudfunction = false

import { exit } from 'process' 
import { BaseConfig, checkConfig, getExpressApp, startSRV, testDb } from '../src-fw/index'

import express from 'express'
import { encryptedKeys } from './keys'
import { register } from './operations'
import { dbConnexion, storageFactory } from './appDbSt'
import { StGeneric } from '../src-dbst'

/* En test seulement: simulation du passage de la clé du serveur 
par variable d'environnement.
En prod: $env:SRVKEY = '...'
*/
import { env } from 'process' // Pour le test

const emulator = false
if (emulator) {
  env['STORAGE_EMULATOR_HOST'] = 'http://127.0.0.1:9199', // 'http://' est REQUIS
  env['FIRESTORE_EMULATOR_HOST'] = 'localhost:8085'
}

const config: BaseConfig = {
  PROD: env.NODE_ENV === 'production' ? true : false,
  GCLOUDLOGGING: gcloudfunction || env['GAE'] ? true : false,
  SRVKEY: env.SRVKEY || '1NjTfoejVNYqWuMKd3NpufaJDT1HQsnlBhRtF9orfug=',
  STORAGE_EMULATOR_HOST: env['STORAGE_EMULATOR_HOST'] || '',
  FIRESTORE_EMULATOR_HOST: env['FIRESTORE_EMULATOR_HOST'] || '',

  BUILD: 'v1.0',
  API: 1,
  APIVERSIONS: [1, 1],
  debugLevel: 2, // 0: aucun, 1: standard: 2: élevé
  adminAlerts: true, // false: simulation true: envoi de mail

  logsPath: './logs', // Test et serveur Node
  port: 8080,
  https: false,
  origins: new Set<string>(/*['http://localhost:8080']*/),

  site: 'A',
  database: gcloudfunction ? null : 'sqla',
  storage: gcloudfunction ? null : 'fsa',
  // Uitlisé seulement par les storage: File-System et GC en mode EMULATOR
  srvUrl: 'http://localhost:8080', // '' si défaut 'http://localhost:8080'

  dbOptions: {
    sqla: { path: 'sqlite/testa.db3', cryptIds: false, credentials: 'sqlite' },
    sqlb: { path: 'sqlite/testb.db3', cryptIds: true, credentials: 'sqlite' }
  },
  
  stOptions: {
    fsa: { bucket: 'filestorea', cryptIds: false, credentials: 'storageFS'}
  },

  keys: {}
}

register(config)
checkConfig(encryptedKeys)
const storage: StGeneric = config.storage ? storageFactory(config.storage, config.site) : null

let app = express.application

try {
  app = getExpressApp(dbConnexion, storage)
  if (!gcloudfunction) {
    // Lancement d'un serveur (AppEngine ou local)
    if (config.debugLevel === 2) {
      testDb(dbConnexion, storage)
      .then(() => {
        try {
          startSRV(config, app)
        } catch (e) {
          console.error('SRV error: ' + e.message + '\n' + e.stack)
          exit()  
        }
      }).catch((m) => {
        console.error(m)
        exit()  
      })
    } else try {
        startSRV(config, app)
      } catch (e) {
        console.error('SRV error: ' + e.message + '\n' + e.stack)
        exit()  
      }
  }
} catch (e) {
  console.error('SRV error: ' + e.message + '\n' + e.stack)
  exit()
}

// export const asocialGCF: HttpFunction = app
