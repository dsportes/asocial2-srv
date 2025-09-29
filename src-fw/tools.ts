import { config } from './config'
import { AppExc } from './index'
import { Log } from './log'
import { Operation } from './operation'
import { testECDH, testSH } from './crypt'
import { DocType } from '../src-fw/doctypes'

import { parseArgs } from 'node:util'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'readline'
import path from 'path'
import { readFileSync, writeFileSync } from 'node:fs'
import { decode } from '@msgpack/msgpack'

// import { SQLiteConnector } from '../src-sqlite'
// import { FirestoreConnector } from '../src-firestore'

/***************************************************************** */

export class Tools {
  static prompt (q) {
    return new Promise((resolve) => {
      const opt = { input: stdin, output: stdout }
      const readline = createInterface(opt)
      readline.question(q, rep => {
        readline.close()
        resolve(rep)
      })
    })
  }

  args: any
  tool: string
  simu: boolean

  constructor () {
    this.args = parseArgs({
      allowPositionals: true,
      options: {
        in: { type: 'string' },
        out: { type: 'string' },
        simulation: { type: 'boolean', short: 's'}
      }
    })
    this.tool = this.args.positionals[0]
    this.simu = this.args.values.simulation
  }

  log (l: string) { stdout.write(l + '\n') }

  async run () {
    try {
      this.log('======================================================')
      // this.cfg = {}
      switch (this.tool) {
        case 'srvStatus' : {
          await this.srvStatus()
          break
        }
        case 'test1' : {
          await this.test1()
          break
        }
        case 'schemaSqlite' : {
          await this.schemaSqlite()
          break
        }
        case 'schemaFirestore' : {
          await this.schemaFirestore()
          break
        }
        case 'schemaPG' : {
          await this.schemaPG()
          break
        }
        /*
        case 'export-db' : {
          await this.setCfgDb('in')
          await this.setCfgDb('out')
          await this.exportDb()
          break
        }
        case 'export-st' : {
          await this.setCfgSt('in')
          await this.setCfgSt('out')
          await this.exportSt()
          break
        }
        case 'purge-db' : {
          await this.setCfgDb('in')
          await this.purgeDb()
          break
        }
        case 'purge-st' : {
          await this.setCfgSt('in')
          await this.purgeSt()
          break
        }
        case 'vapid' : {
          await this.genVapidKeys()
          break
        }
        case 'data' : {
          await this.decodeData()
          break
        }
        */
        default : {
          throw 'Premier argument attendu: srvStatus test1 export-db export-st vapid. Trouvé [' + this.tool + ']'
        }
      }
      return [0, this.tool + ' OK']
    } catch (e) {
      if (typeof e === 'string') return [1, e]
      return [1, e.toString() + '\n' + e.stack]
    }
  }

  async srvStatus () : Promise<void> {
    const op = new Operation()
    op.opName = 'Fake'
    await config.databases[0][1].getConnexion(op)
    {
      const {st, at, txt} = await op.db.getSrvStatus()
      const atS = at ? new Date(at).toISOString() : '?'
      Log.info('st:' + st + ' at:' + atS + ' info:' + txt)
    }
    {
      const [status, msg] = await config.storages[0][1].ping()
      if (status === 0) Log.info(msg)
      else throw new AppExc(1013, 'PING Storage FAILED: ', null, [msg])
    }
  }

   async test1 () : Promise<void> {
    // await testECDH()
    await testSH()
  }

  async schemaFirestore () : Promise<void> {
    const cl = config.dbConnectors['firestore']
    if (cl) await cl.genSchema()
    else Log.error('Firestore connector undeclared')
  }

  async schemaSqlite () : Promise<void> {
    const cl = config.dbConnectors['sqlite']
    if (cl) await cl.genSchema()
    else Log.error('SQLite connector undeclared')
  }

  async schemaPG () : Promise<void> {
    const cl = config.dbConnectors['postgres']
    if (cl) await cl.genSchema()
    else Log.error('Postgres connector undeclared')
  }
}