import { Document } from '../src-fw/document'
import { Credential, InvitationA, InvObj, OrgA } from '../src-fw/documents'
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

type InvitValOM = { // arguments de validation d'un Credential Org.manager
  pubV: string // clé publique de vérification du credential
  name: string // nom / pseudo facultatif pour information à stocker en cond
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
    - docId: tiré de invit (depuis "accept")
    - nom: depuis demande invit "label"
  - d'un Credential sur cet auteur avec un pemv / time passé en argument invVal
  - optionnellement d'un Credential de Sponsor sur 'Auteur' avec un pemv / time passé en argument invVal
  */
  async validate_auteur (op: OperationWC, args: any) : Promise<number> {
    /*
    const iv = this.objectValue('invVal', true) as InvVal

    if (this.invit.etc.newA === 1) {
      // Création de Auteur sauf si existait déjà (retry)
      const a = await this.cache.getDoc('Auteur', { autid: this.invit.docId })
      if (!a)
        this.cache.newDoc('Auteur', { autid: this.invit.docId, nom: this.invit.label })
    
      // Enregistrement du credential d'accès à Auteur
      const obj = {
        id: Credential.getId(config.SVC, this.org, this.invit.role, this.invit.docId),
        userId: this.invit.userId,
        role: this.invit.role,
        org: this.org,
        docId: this.invit.docId,
        time: iv.time,
        pemv: iv.pemvA,
        limit: 0,
        cond: { p: 'A', name: this.invit.label }
      }
      // permet un retry : reset du time
      const c = await this.cache.getDoc('Credential', obj) as Credential
      if (c) {
        c.time = iv.time
        c._status = DocStatus.UPD
      } else this.cache.newDoc('Credential', obj) 
    }
    
    if (this.invit.etc.option > 1) {
      const docId = 'Auteur' + (this.invit.etc.option === 2 ? '' : ('/' + this.invit.etc.categ))
      const id = Credential.getId(config.SVC, this.org, 'Sponsor.', docId)
      const obj = {
        id,
        userId: this.invit.userId,
        role: 'Sponsor.',
        org: this.org,
        docId: docId,
        time: this.now,
        pemv: iv.pemvS,
        limit: 0,
        cond: { name: this.invit.label }
      }
      // permet un retry : reset du time
      const c = await this.cache.getDoc('Credential', obj) as Credential
      if (c) {
        c.time = iv.time
        c._status = DocStatus.UPD
      } else this.cache.newDoc('Credential', obj) 
    }
    */
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
