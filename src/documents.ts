import { $Document, DocStatus } from '../src-fw/document'
import { $Form, $FormObj, C2c, $Credential, $Cred } from '../src-fw/documents'
import { keyFromB64 } from '../src-fw/b64'
import { Registry } from '../src-fw/config'
import { Operation } from '../src-fw/operation'

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
}
Registry.registerD($Form_auteur)

class $Form_coauteur extends $Form {
  constructor (obj?: $FormObj) { super(obj) }
  getDetail () { return [] }
}
Registry.registerD($Form_coauteur)

class Auteur extends $Document {
  static release = 0
  nom: string

  static mutateCl (data: object, options?: Object) : [Object, boolean] {
    return [data, false]
  }

  compile () { return this }

}
Registry.registerD(Auteur)
