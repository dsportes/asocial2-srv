import { Document, DocStatus } from '../src-fw/document'
import {  OrgA, PropertyA, Credential, InvitationA, InvObj } from '../src-fw/documents'
import { OperationWC } from '../src-fw/index'
import { config, Classes } from '../src-fw/config'
import { AuthRecord } from '../src-fw/operation'

export function loadingDA () {
  console.log('app documents loading: ', Classes.sizeD())
}

class Hdr extends Document {
  static release = 0
  static mutateCl (data: object, options?: Object) : [Object, boolean] {
    return [data, false]
  }

}
Classes.registerD(Hdr)

class Org extends OrgA {
  static release = 0

  static mutateCl (data: object, options?: Object) : [Object, boolean] {
    return [data, false]
  }

  compile () { return this }

}
Classes.registerD(Org)

class Property extends PropertyA {
  static release = 0

  static mutateCl (data: object, options?: Object) : [Object, boolean] {
    return [data, false]
  }

  compile () { return this }

}
Classes.registerD(Property)

type InvitValOM = { // arguments de validation d'un Credential Org.manager
  pubV: string // clé publique de vérification du credential
  name: string // nom / pseudo facultatif pour information à stocker en cond
}

type InvValAuteur = {
  nom: string // nom d'auteur
  pemvA: string // pemV pour le credential d'accès à l'auteur
  pemvS: string // pemV pour le credential Sponsor (s'il y a lieu)
  credIdA: string
  credIdS: string
}

export class Invitation extends InvitationA {
  static release = 0

  /* Qui peut proposer une invitation ? Qui est un "sponsor" possible ?
  Logique applicative choisie ici:
  - un "manager" est toujours un sponsor valide.
  - un utilisateur qui a un credential Sponsor pour le "major" de l'invitation
    est un sponsor valide (quelque soit le "minor").
  - un utilisateur qui a un credential Sponsor pour le "major.minor" de l'invitation
    est un sponsor valide (à condition bien sur que l'invitation ait un minor).
  */
  static checkSponsor (authRecord: AuthRecord, inv: InvObj | InvitationA) : boolean {
    return InvitationA.checkSponsor(authRecord, inv)
  }

  async validate (op: OperationWC, args: any) : Promise<number> {
    switch (this.major) {
      case 'Org.manager' : { return await this.validate_orgManager(op, args); break }
      case 'Auteur' : { return await this.validate_auteur(op, args); break }
    }
  }

  /* etc:
      credId : généré par le sponsor (ici l'administrateur)
      name: nom saisi par l'adminsytrateur
    args: pubV
  */
  async validate_orgManager (op: OperationWC, args: InvitValOM) : Promise<number> {
    // Checking de etc et args
    if (!this.etc['credId']) return 1
    if (!args.pubV) return 2
    
    // Enregistrement du credential
    const obj = {
      credId: this.etc['credId'],
      role: 'Org.manager',
      docId: '',
      pubv: args.pubV,
      limit: 0,
      cond: { name: this.etc['name'] || '???'}
    }
    op.cache.newDoc('Credential', obj)
    return 0
  }

  /* Validation d'un document 'Auteur' 
    - docId: depuis etc
    - nom: depuis args
  - d'un Credential sur cet auteur avec un pemv passé en args
  - optionnellement d'un Credential de Sponsor sur 'Auteur' avec un pemv passé en args

    nom: string // nom d'auteur
    pemvA: string // pemV pour le credential d'accès à l'auteur
    pemvS: string // pemV pour le credential Sponsor (s'il y a lieu)
    credIdA: string
    credIdS: string
  */
  async validate_auteur (op: OperationWC, args: InvValAuteur) : Promise<number> {

    if (this.etc.newA === 1) {
      // Création de Auteur sauf si existait déjà (retry)
      const a = await op.cache.getDoc('Auteur', { autid: this.etc.docId })
      if (!a)
        op.cache.newDoc('Auteur', { autid: this.etc.docId, nom: args.nom })
    
      // Enregistrement du credential d'accès à Auteur
      const ca = new Credential()
      ca.credId = args.credIdA
      ca.role = 'Auteur.'
      ca.docId = this.etc.docId
      ca.pubv = args.pemvA
      ca.limit = 0
      ca.cond = { p: 'A', name: args.nom || '?' }
      const c = await op.cache.getDoc('Credential', ca) as Credential
      if (!c) 
        op.cache.newDoc('Credential', ca) 
    }
    
    if (this.etc.option > 1) {
      const docId = 'Auteur' + (this.etc.option === 2 ? '' : ('/' + this.etc.categ))
      const cs = new Credential()
      cs.credId = args.credIdS
      cs.role = 'Sponsor.'
      cs.docId = docId
      cs.pubv = args.pemvS
      cs.limit = 0
      cs.cond = { p: 'A', name: args.nom || '?' }
      const c = await op.cache.getDoc('Credential', cs) as Credential
      if (!c) 
        op.cache.newDoc('Credential', cs) 
    }
    
    return 0
  }
}
Classes.registerD(Invitation)

class Auteur extends Document {
  static release = 0

  static mutateCl (data: object, options?: Object) : [Object, boolean] {
    return [data, false]
  }

  compile () { return this }

}
Classes.registerD(Auteur)
