import { writeFile, readFile } from 'node:fs/promises'
import { existsSync, unlinkSync, rmSync, readdirSync, mkdirSync } from 'node:fs'
import path from 'path'

import { AppExc, Log, Operation } from '../src-fw/index'

import { StGeneric, StConnector, StorageGeneric } from '../src-dbst/stConnector'

/*********************************************************************/
export class FsConnector extends StConnector {
  public rootpath: string

  constructor (code: string, bucket: string, cryptIds: boolean, credentials: string) {
    super(code, bucket, cryptIds, credentials)
    this.rootpath = path.resolve(this.bucket)
    if (!existsSync(this.rootpath))
      throw new AppExc(1030, 'fs storage path not found', null, [this.rootpath])
    this.srvUrl = Operation.config.srvUrl
    this.factory = Storage.newStorage
    Log.info('Storage FS - path:[' + this.rootpath) + ']'
  }
}
class Storage extends StorageGeneric implements StGeneric {
  public static newStorage (options: FsConnector, key: Buffer) {
    return new Storage(options, key)
  }

  private rootpath: string
  
  constructor (options: FsConnector, key: Buffer) {
    super(options, key)
    this.rootpath = options.rootpath
  }

  async ping () : Promise<[number, string]> {
    try {
      const txt = new Date().toISOString()
      const data = Buffer.from(txt)
      const p = path.resolve(this.rootpath, 'ping.txt')
      await writeFile(p, data)
      return [0, 'File-System ping OK: ' + txt]
    } catch (e) {
      return [1, 'File-System ping KO: ' +e.toString]
    }
  }

  getUrl (id1: string, id2: string, id3: string) { 
    return this.storageUrlGenerique(id1, id2, id3) 
  }

  putUrl (id1: string, id2: string, id3: string) {
    return this.storageUrlGenerique(id1, id2, id3) 
  }

  async getFile (id1: string, id2: string, id3:string) : Promise<Buffer>{
    try {
      const p = path.resolve(this.rootpath, id1, this.cryptId(id2), this.cryptId(id3))
      return await readFile(p)
    } catch (err) {
      Log.error(err.toString())
      return null
    }
  }

  async putFile (id1: string, id2: string, id3:string, data: Buffer) : Promise<void> {
    try {
      const dir = path.resolve(this.rootpath, id1, this.cryptId(id2))
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const p = path.resolve(dir, this.cryptId(id3))
      await writeFile(p, Buffer.from(data))
    } catch (err) {
      Log.error(err.toString())
      throw err
    }
  }

  async delFiles (id1: string, id2: string, lidf: string[]) : Promise<void> {
    if (!lidf || !lidf.length) return
    try {
      const dir = path.resolve(this.rootpath, id1, this.cryptId(id2))
      if (existsSync(dir)) {
        for (let i = 0; i < lidf.length; i++) {
          const idf = this.cryptId(lidf[i])
          const p = path.resolve(dir, idf)
          try {
            unlinkSync(p)
          } catch (e) { /* rien*/ }
        }
      }
    } catch (err) {
      Log.error(err.toString())
      throw err
    }
  }

  async delId (id1: string, id2: string) : Promise<void> {
    try {
      const dir = path.resolve(this.rootpath, id1, this.cryptId(id2))
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true })
      }
    } catch (err) {
      Log.error(err.toString())
      throw err
    }
  }

  async delOrg (id1: string) : Promise<void>  {
    try {
      const dir = path.resolve(this.rootpath, id1)
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true })
      }
    } catch (err) {
      Log.error(err.toString())
      throw err
    }
  }

  async listFiles (id1: string, id2: string) : Promise<string[]> {
    try {
      const lst = []
      const dir = path.resolve(this.rootpath, id1, this.cryptId(id2))
      if (existsSync(dir)) {
        const files = readdirSync(dir)
        if (files && files.length) files.forEach(name => { 
          const dname = this.decryptId(name)
          lst.push(dname) 
        })
      }
      return lst
    } catch (err) {
      Log.error(err.toString())
      throw err
    }
  }

  async listIds (id1: string) : Promise<string[]> {
    try {
      const lst = []
      const dir = path.resolve(this.rootpath, id1)
      if (existsSync(dir)) {
        const files = readdirSync(dir)
        if (files && files.length) files.forEach(name => { 
          const dname = this.decryptId(name)
          lst.push(dname) 
        })
      }
      return lst
    } catch (err) {
      Log.error(err.toString())
      throw err
    }
  }

}
