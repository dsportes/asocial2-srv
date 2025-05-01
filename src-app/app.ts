import { env } from 'process' // Pour le test
env.SRVKEY = '1NjTfoejVNYqWuMKd3NpufaJDT1HQsnlBhRtF9orfug=' // Pour le test. 
//En prod: $env:SRVKEY = '...'

export const config = {
  BUILD: 'v1.0',
  API: 1,
  APIVERSIONS: [1, 1],
  PROD: false,
  GAE: '',

  logsPath: './logs',
  port: 8080,
  https: false,
  origins: new Set<string>(/*['http://localhost:8080']*/),
  site: 'A',
  database: 'sqla',
  storage: 'fsa',

  debugLevel: 2, // 0: aucun, 1: standard: 2: élevé
  adminAlerts: true, // false: simulation true: envoi de mail

  dbOptions: {
    sqla: { path: 'sqlite/testa.db3', cryptIds: false },
    sqlb: { path: 'sqlite/testb.db3', cryptIds: true }
  },

  stOptions: {
    fsa: { path: 'storagea', cryptIds: false }
  },

  env: {
    STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199', // 'http://' est REQUIS
    FIRESTORE_EMULATOR_HOST: 'localhost:8085'
  },

  keys: {}

}
