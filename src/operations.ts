import { encode, decode } from '@msgpack/msgpack'

import { Operation } from '../src-fw/operation'
import { Registry } from '../src-fw/config'
import { AppExc } from '../src-fw/log'
import { $Document, DocStatus } from '../src-fw/document'
import { Auteur } from '../src-as2/documents'
import { Crypt } from '../src-fw/crypt'
import { filter } from '../src-fw/iDbGeneric'
import { DocType } from '../src-fw/doctypes'

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
    this.requireAuth()
    const pk = DocType.getPk('Auteur', this.src)
    this.getCred('Auteur', pk)
    const aut = await this.cache.getDoc('Auteur', this.src)
    this.setRes('auteur', aut || null)
  }
}
Registry.registerOp(AuteurDeId)

/* Met à jour le nom et la section d'un auteur */
class MajAuteur extends Operation {
  _autid: string
  _nomAuteur: string
  _section: string
  init () {
    super.init()
    this._autid = this.stringValue('autid', true)
    this._nomAuteur = this.stringValue('nomAuteur', false)
    this._section = this.stringValue('section', false)
  }
  async phase2 () {
    this.requireAuth()
    const pk = DocType.getPk('Auteur', { autid: this._autid })
    this.getCred('Auteur', pk)
    const aut = await this.cache.getDoc('Auteur', { autid: this._autid }) as Auteur
    if (!aut) { this.setRes('status', 1); return }
    let m = false
    if (this._nomAuteur && this._nomAuteur !== aut.nomAuteur) {
      m = true
      aut.nomAuteur = this._nomAuteur
    }
    if (this._section && this._section !== aut.section) {
      m = true
      aut.section = this._section
    }
    if (m) aut._status = DocStatus.UPD
    this.setRes('maj', { nomAuteur: aut.nomAuteur, section: aut.section })
  }
}
Registry.registerOp(MajAuteur)
