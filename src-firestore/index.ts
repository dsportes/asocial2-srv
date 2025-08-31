
import { Firestore } from '@google-cloud/firestore'

import { DbConnector, DbConnexion } from '../src-fw/dbConnector'
import { IDbGeneric, comparator } from '../src-fw/iDbGeneric'
import { DocPattern } from '../src-fw/document'
import { AppExc } from '../src-fw/index'
import { Log } from '../src-fw/log'
import { Operation } from '../src-fw/operation'

export class FirestoreConnector extends DbConnector {
  public emulator: string
  public service_account: Object

  constructor (credentials: string, cryptKey: string) {
    super(credentials, cryptKey)
    this.service_account = credentials['service_account']
    this.emulator = Operation.config.FIRESTORE_EMULATOR_HOST
    Log.info('Firestore connector')
    this.factory = FirestoreConnexion.newConnexion
  }
}

export class FirestoreConnexion extends DbConnexion implements IDbGeneric {
  public static newConnexion (connector: FirestoreConnector, op: Operation, cryptKey?: string) {
    return new FirestoreConnexion(connector, op, cryptKey)
  }

  public fs : Firestore
  public service_account: Object
  
  constructor (connector: FirestoreConnector, op: Operation, cryptKey?: string) {
    super(connector, op, cryptKey)
    this.service_account = connector.service_account
  }

  async connect () {
    this.fs = new Firestore({ 
      projectId : this.service_account['project_id'],
      credentials: this.service_account
    })
  }

  // Méthode PUBLIQUE de déconnexion, impérative et sans exception
  async disconnect () {
    try { await this.fs.terminate() } catch (e2) { /* */ }
  }

  private trap (e: any) : [number, string] { // 1: busy, 2: autre
    if (e.constructor.name !== 'FirestoreError') throw e
    const s = (e.code || '???') + ' - ' + (e.message || '?')
    if (e.code && e.code === 'ABORTED') return [1, s]
    return [2, s]
  }

  async ping () : Promise<[number, string]> {
    try {
      let t = '?'
      const dr = this.fs.doc('Hdr/ping')
      const ds = await dr.get()
      if (ds.exists) t = ds.get('data')
      const d = new Date()
      const v = d.getTime()
      const data = d.toISOString()
      await dr.set({ id: 1, v, data })
      return [0, 'Firestore ping OK: ' + (t || '?') + ' <=> ' + data]
    } catch (e) {
      return this.trap(e)
    }
  }
  
  async doTransaction () : Promise<[number, string]> {
    try {
      await this.fs.runTransaction(async (transaction) => {
        this.transaction = transaction
        await this.op.transac()
      })
      this.transaction = null
      return [0, '']
    } catch (e) {
      this.transaction = null
      return this.trap(e)
    }
  }

  async getDoc (pattern: DocPattern, v?: number) : Promise<Uint8Array> { return null }
  async insertDoc (row: Object) {}
  async updateDoc (row: Object) {}
  async deleteDoc (pattern: DocPattern) {}
  async listDocs (pattern: DocPattern, v?: number, fn? : Function) { return [] }
  async listDocsSk (pattern: DocPattern, ik: number, v?: number, fn? : Function) { return [] }
  async listDocsIdx (pattern: DocPattern, ix: number, comp: comparator, v?: number, fn? : Function) { return [] }
  async getHdr (v? : number) { return null }
  async insertHdr (row: Object) {}
  async updateHdr (row: Object) {}
  async getOrg (org: string, v?: number) { return null }
  async insertOrg (row: Object) {}
  async updateOrg (row: Object) {}
  async listOrgs (v?: number, fn? : Function) { return [] }  
  async listOrgsIdx (ix: number, comp: comparator, val: any, v?: number, fn? : Function) { return []}
  async purgeAllDocs (pattern: DocPattern) {}
  async purgeOrg (org: string, z?: number) {}
  async purgeOrgs (org: string, z: number) {}
  async purgeDlvDocs (pattern: DocPattern, ix, comp: comparator) {}
  async setFTP (org: string, path: string, dp: number) {}
  async purgeFTP (org: string, path: string) {}
  async listFTP (dp : number, fn: Function) {}
  async purgeAllFTP (dp : number) {}
  async nextTask (time: string) { return null }

}
