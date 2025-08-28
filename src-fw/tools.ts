import { BaseConfig } from './index'
import { AppExc } from './index'
import { Log } from './log'
import { Operation } from './operation'
import { testECDH, testSH } from './crypt'

import { parseArgs } from 'node:util'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'readline'
import path from 'path'
import { readFileSync, writeFileSync } from 'node:fs'
import { decode } from '@msgpack/msgpack'

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

  config: BaseConfig
  args: any
  tool: string
  simu: boolean

  constructor (config: BaseConfig) {
    this.config = config
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
        case 'pings' : {
          await this.pings()
          break
        }
        case 'test1' : {
          await this.test1()
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
          throw 'Premier argument attendu: pings test1 export-db export-st vapid. Trouvé [' + this.tool + ']'
        }
      }
      return [0, this.tool + ' OK']
    } catch (e) {
      if (typeof e === 'string') return [1, e]
      return [1, e.toString() + '\n' + e.stack]
    }
  }


  async pings () : Promise<void> {
    const op = Operation.fake()
    await this.config.databases[0][1].getConnexion(op)
    {
      const [status, msg] = await op.db.ping()
      if (status === 0) Log.info(msg)
      else throw new AppExc(1012, 'PING SDatabase FAILED', null, [msg])
    }
    {
      const [status, msg] = await this.config.storages[0][1].ping()
      if (status === 0) Log.info(msg)
      else throw new AppExc(1013, 'PING Storage FAILED: ', null, [msg])
    }
  }

   async test1 () : Promise<void> {
    // await testECDH()
    await testSH()
  }

}