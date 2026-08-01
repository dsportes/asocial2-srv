import { encode, decode } from '@msgpack/msgpack'

import { $Document } from '../src-fw/document'
import { $Form, $FormObj, ADMIN$Status, $Credential, $Cred } from '../src-fw/documents'
import { Log } from '../src-fw/log'
import { Registry } from '../src-fw/registry'
import { Operation } from '../src-fw/operation'
import { filter } from '../src-fw/iDbGeneric'

let nd = 0

export function loadingDA () {
  Log.info('app operations loading: ' + nd)
}

/*
new FormType('membrecodir', 'k1', ['A'])
new FormType('membreredaction', 'k1', ['A'])
new FormType('auteur', 'k2', ['Readction/1'])
// Un Auteur peut aussi nommer un co-auteur
new FormType('coauteur', 'k2', ['Readction/1', 'Auteur/$1'])
*/

/* Méthodes à surcharger
  getDetail () { return [] }

  async validate (op: Operation, newDocs: $Document[]) : Promise<number> { 
    return await super.validate(op, newDocs)
  }
*/ 

class AS2$Status extends ADMIN$Status {
}
nd++; Registry.register(AS2$Status)

class AS2$Form extends $Form {
  constructor (obj) { super(obj) }
}
nd++; Registry.register(AS2$Form)

class AS2$Form_membrecodir extends AS2$Form {
  constructor (obj?: $FormObj) { super(obj) }

  getDetail () { return [] }
  
}
nd++; Registry.register(AS2$Form_membrecodir)

class AS2$Form_membreredaction extends AS2$Form {
  constructor (obj?: $FormObj) { super(obj) }
  getDetail () { return [] }
}
nd++; Registry.register(AS2$Form_membreredaction)

class AS2$Form_auteur extends AS2$Form {
  constructor (obj?: $FormObj) { super(obj) }
  getDetail () { return [] }

  async validate (op: Operation, newDocs: $Document[]) : Promise<number> { 
    const autid = await AS2$Auteur.autidDeNom(op, this.opts.auteur.nomAuteur)
    if (autid) return  101
    const doc = op.cache.newDoc('AS2$Auteur', this.opts.auteur ) as AS2$Auteur
    doc.embedCred(this.opts.credTemplates)
    newDocs.push(doc)
    return 0 
  }
}
nd++; Registry.register(AS2$Form_auteur)

class AS2$Form_coauteur extends AS2$Form {
  constructor (obj?: $FormObj) { super(obj) }
  getDetail () { return [] }
}
nd++; Registry.register(AS2$Form_coauteur)

export class AS2$Auteur extends $Document {
  static release = 0
  static userCredProps = new Set(['trig'])

  nomAuteur: string
  section: string

  static mutateCl (data: object, options?: Object) : [Object, boolean] {
    return [data, false]
  }

  compile () { return this }

  // Liste les credentials attribuable par un administrateur seulement
  static async autidDeNom (op: Operation, nom: string) : Promise<string> {
    const org = op.org
    let autid = ''
    if (nom.length) await op.db.selectDocs('AS2$Auteur', 'nom', filter.EQ, nom, '', 1, 
      (bin: Uint8Array) => {
        try {
          const c: any = decode(bin)
          autid = c.autid
        } catch(e) {
          Log.error(e)
        }    
      }) 
    return autid
  }
}
nd++; Registry.register(AS2$Auteur)
