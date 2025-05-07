"use strict";
/* Pour appel en tant que gcloud function:
https://cloud.google.com/functions/docs/deploy
https://blog.stackademic.com/building-a-rest-api-with-cloud-functions-on-google-cloud-platform-using-javascript-ffc570469f75
const functions = require('@google-cloud/functions-framework')
import functions from '@google-cloud/functions-framework'
const gcloudfunction = true
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.myFunctionName = void 0;
const gcloudfunction = true;
const process_1 = require("process");
const index_1 = require("../src-fw/index");
const express_1 = __importDefault(require("express"));
const keys_1 = require("./keys");
const operations_1 = require("./operations");
const appDbSt_1 = require("./appDbSt");
/* En test seulement: simulation du passage de la clé du serveur
par variable d'environnement.
En prod: $env:SRVKEY = '...'
*/
const process_2 = require("process"); // Pour le test
const emulator = false;
if (emulator) {
    process_2.env['STORAGE_EMULATOR_HOST'] = 'http://127.0.0.1:9199', // 'http://' est REQUIS
        process_2.env['FIRESTORE_EMULATOR_HOST'] = 'localhost:8085';
}
const config = {
    PROD: process_2.env.NODE_ENV === 'production' ? true : false,
    GAE: process_2.env.GAE_INSTANCE || '',
    SRVKEY: process_2.env.SRVKEY || '1NjTfoejVNYqWuMKd3NpufaJDT1HQsnlBhRtF9orfug=',
    STORAGE_EMULATOR_HOST: process_2.env['STORAGE_EMULATOR_HOST'] || '',
    FIRESTORE_EMULATOR_HOST: process_2.env['FIRESTORE_EMULATOR_HOST'] || '',
    BUILD: 'v1.0',
    API: 1,
    APIVERSIONS: [1, 1],
    debugLevel: 2, // 0: aucun, 1: standard: 2: élevé
    adminAlerts: true, // false: simulation true: envoi de mail
    logsPath: './logs', // Test et serveur Node
    port: 8080,
    https: false,
    origins: new Set( /*['http://localhost:8080']*/),
    site: 'A',
    database: null, // 'sqla',
    storage: null, // 'fsa',
    // Uitlisé seulement par les storage: File-System et GC en mode EMULATOR
    srvUrl: 'http://localhost:8080', // '' si défaut 'http://localhost:8080'
    dbOptions: {
        sqla: { path: 'sqlite/testa.db3', cryptIds: false, credentials: 'sqlite' },
        sqlb: { path: 'sqlite/testb.db3', cryptIds: true, credentials: 'sqlite' }
    },
    stOptions: {
        fsa: { bucket: 'filestorea', cryptIds: false, credentials: 'storageFS' }
    },
    keys: {}
};
(0, operations_1.register)(config);
(0, index_1.checkConfig)(keys_1.encryptedKeys);
const storage = config.storage ? (0, appDbSt_1.storageFactory)(config.storage, config.site) : null;
let app = express_1.default.application;
try {
    app = (0, index_1.getExpressApp)(appDbSt_1.dbConnexion, storage);
    if (!gcloudfunction) {
        // Lancement d'un serveur (AppEngine ou local)
        if (config.debugLevel === 2) {
            (0, index_1.testDb)(appDbSt_1.dbConnexion, storage)
                .then(() => {
                try {
                    (0, index_1.startSRV)(config, app);
                }
                catch (e) {
                    console.error('SRV error: ' + e.message + '\n' + e.stack);
                    (0, process_1.exit)();
                }
            }).catch((m) => {
                console.error(m);
                (0, process_1.exit)();
            });
        }
        else
            try {
                (0, index_1.startSRV)(config, app);
            }
            catch (e) {
                console.error('SRV error: ' + e.message + '\n' + e.stack);
                (0, process_1.exit)();
            }
    }
}
catch (e) {
    console.error('SRV error: ' + e.message + '\n' + e.stack);
    (0, process_1.exit)();
}
const myFunctionName = (request, response) => {
    response.status(200).send('Hello World!');
};
exports.myFunctionName = myFunctionName;
