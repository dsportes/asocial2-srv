//import { env } from 'process' // Pour le test
//env.SRVKEY = '1NjTfoejVNYqWuMKd3NpufaJDT1HQsnlBhRtF9orfug=' // Pour le test. 
//En prod: $env:SRVKEY = '...'

export const config = {
  BUILD: 'v1.0',
  API: 1,
  APIVERSIONS: [1, 1],
  logsPath: './logs',
  port: 8080,
  https: false,

  PROD: false,
  GAE: '',

  env: {
    STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199', // 'http://' est REQUIS
    FIRESTORE_EMULATOR_HOST: 'localhost:8085'
  },

  keys: {}

}
