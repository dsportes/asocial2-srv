import { encode, decode } from '@msgpack/msgpack'

import { Operation } from '../src-fw/operation'
import { Registry } from '../src-fw/config'
import { AppExc } from '../src-fw/log'
import { $Document, DocStatus } from '../src-fw/document'
import { Auteur } from '../src/documents'
import { Crypt } from '../src-fw/crypt'
import { filter } from '../src-fw/iDbGeneric'

export function loadingOA () {
  console.log('app operations loading: ', Registry.sizeOp())
}

/* Retourne une clé publique de cryptage de configuation */
class AutidDeNom extends Operation {
  _nom: string
  init () {
    super.init()
    this._nom = this.stringValue('nom', true)
  }
  async phase2 () {
    const autid = await Auteur.autidDeNom(this, this._nom)
    this.setRes('autid', autid)
  }
}
Registry.registerOp(AutidDeNom)

/* Retourne un Auteur depuis son id */
class AuteurDeId extends Operation {
  _autid: string
  _autPk: string
  src: Object
  init () {
    super.init()
    this._autid = this.stringValue('autid', false)
    this._autPk = this.stringValue('autPk', false)
    this.src = this._autid ?  { autid: this._autid } :  { pk: this._autPk }
  }
  async phase2 () {
    const aut = await this.cache.getDoc('Auteur', this.src)
    this.setRes('auteur', aut || null)
  }
}
Registry.registerOp(AuteurDeId)
