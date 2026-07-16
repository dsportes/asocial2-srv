import { encode, decode } from '@msgpack/msgpack'

import { $Document, DocStatus } from '../src-fw/document'
import { $Form, $FormObj, $Credential, $Cred } from '../src-fw/documents'
import { keyFromB64 } from '../src-fw/b64'
import { Registry } from '../src-fw/config'
import { Operation } from '../src-fw/operation'
import { filter } from '../src-fw/iDbGeneric'

export function loadingDA () {
  console.log('app documents loading: ', Registry.sizeD())
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

class $Form_membrecodir extends $Form {
  constructor (obj?: $FormObj) { super(obj) }

  getDetail () { return [] }
  
}
Registry.registerD($Form_membrecodir)

class $Form_membreredaction extends $Form {
  constructor (obj?: $FormObj) { super(obj) }
  getDetail () { return [] }
}
Registry.registerD($Form_membreredaction)

class $Form_auteur extends $Form {
  constructor (obj?: $FormObj) { super(obj) }
  getDetail () { return [] }

  async validate (op: Operation, newDocs: $Document[]) : Promise<number> { 
    const autid = await Auteur.autidDeNom(op, this.opts.auteur.nomAuteur)
    if (autid) return  101
    const doc = op.cache.newDoc('Auteur', this.opts.auteur ) as Auteur
    doc.embedCred(this.opts.credTemplates)
    newDocs.push(doc)
    return 0 
  }
}
Registry.registerD($Form_auteur)

class $Form_coauteur extends $Form {
  constructor (obj?: $FormObj) { super(obj) }
  getDetail () { return [] }
}
Registry.registerD($Form_coauteur)

export class Auteur extends $Document {
  static release = 0
  static userCredProps = new Set(['trig'])

  nom: string
  section: string

  static mutateCl (data: object, options?: Object) : [Object, boolean] {
    return [data, false]
  }

  compile () { return this }

  // Liste les credentials attribuable par un administrateur seulement
  static async autidDeNom (op: Operation, nom: string) : Promise<string> {
    const org = op.org
    let autid = ''
    if (nom.length) await op.db.selectDocs('Auteur', 'nom', filter.EQ, nom, '', 1, 
      (bin: Uint8Array) => {
        try {
          const c: any = decode(bin)
          autid = c.autid
        } catch(e) {
          console.log(e)
        }    
      }) 
    return autid
  }
}
Registry.registerD(Auteur)
