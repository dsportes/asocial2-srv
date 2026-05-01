/* Implémentation de l'accès au Storage par File-System */

import { writeFile, readFile } from 'node:fs/promises'
import { existsSync, unlinkSync, rmSync, readdirSync, mkdirSync } from 'node:fs'
import path from 'path'

import { AppExc } from '../src-fw/index'
import { Log } from '../src-fw/log'

import { StorageGeneric } from '../src-fw/storageGeneric'
import { IStGeneric } from '../src-fw/iStGeneric'
import { Operation } from '../src-fw/operation'

/*********************************************************************/
export class FilesystemStorage extends StorageGeneric implements IStGeneric {
  public rootpath: string

  constructor (name, keys) {
    super(name, keys)
    this.rootpath = path.resolve(this.credentials['path'])
    if (!existsSync(this.rootpath))
      throw new AppExc(110, 'FilesystemStorage_path_not_found', null, [this.rootpath])
    Log.info('FilesystemStorage - path:[' + this.rootpath) + ']'
  }

  async ping (op: Operation) : Promise<[number, string]> {
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

  getUrl (op: Operation, id1: string, id2: string, id3: string) { 
    return op.baseUrl + '/file/' + this.name + '/' + this.encode3(id1, id2, id3)
  }

  putUrl (op: Operation, id1: string, id2: string, id3: string) {
    return op.baseUrl + '/file/'  + this.name + '/' + this.encode3(id1, id2, id3)
  }

  async getFile (op: Operation, id1: string, id2: string, id3:string) : Promise<Buffer>{
    try {
      const p = path.resolve(this.rootpath, id1, id2, id3)
      return await readFile(p)
    } catch (err) {
      Log.error(err.toString())
      return null
    }
  }

  async putFile (op: Operation, id1: string, id2: string, id3:string, data: Buffer) : Promise<void> {
    try {
      const dir = path.resolve(this.rootpath, id1, id2)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const p = path.resolve(dir, id3)
      await writeFile(p, Buffer.from(data))
    } catch (err) {
      Log.error(err.toString())
      throw err
    }
  }

  async delFiles (op: Operation, id1: string, id2: string, lidf: string[]) : Promise<void> {
    if (!lidf || !lidf.length) return
    try {
      const dir = path.resolve(this.rootpath, id1, id2)
      if (existsSync(dir)) {
        for (let i = 0; i < lidf.length; i++) {
          const idf = lidf[i]
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

  async delId (op: Operation, id1: string, id2: string) : Promise<void> {
    try {
      const dir = path.resolve(this.rootpath, id1, id2)
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true })
      }
    } catch (err) {
      Log.error(err.toString())
      throw err
    }
  }

  async delOrg (op: Operation, id1: string) : Promise<void>  {
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

  async listFiles (op: Operation, id1: string, id2: string) : Promise<string[]> {
    try {
      const lst = []
      const dir = path.resolve(this.rootpath, id1, id2)
      if (existsSync(dir)) {
        const files = readdirSync(dir)
        if (files && files.length) files.forEach(name => { 
          lst.push(name) 
        })
      }
      return lst
    } catch (err) {
      Log.error(err.toString())
      throw err
    }
  }

  async listIds (op: Operation, id1: string) : Promise<string[]> {
    try {
      const lst = []
      const dir = path.resolve(this.rootpath, id1)
      if (existsSync(dir)) {
        const files = readdirSync(dir)
        if (files && files.length) files.forEach(name => {
          lst.push(name) 
        })
      }
      return lst
    } catch (err) {
      Log.error(err.toString())
      throw err
    }
  }

}
