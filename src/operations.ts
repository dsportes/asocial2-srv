// import { BaseConfig } from '../src-fw/index'
import { Operation } from '../src-fw/operation'
import { InvitValidateA } from '../src-fw/operations'
import { Crypt, toPem } from '../src-fw/crypt'
import { config } from '../src-fw/config'
// import { DocStatus } from '../src-fw/document'
import { Credential } from '../src-fw/documents'
import { DocStatus } from '../src-fw/document'

export function register () {
  return Operation.nbOf()
}

type InvVal = {
  pemvA: string, // pemV pour le credential d'accès à l'auteur
  pemvS: string, // pemV pour le credential Sponsor (s'il y a lieu)
  time: number // time de l'application pour ces deux credentials
}

/* InvitValidate (réelle) marque le status d'une invitation en status 4 (acceptée). 
Le demandeur doit être l'utilisateur.
Le traitement conduit à une importante logique spécifique:
- création éventuelle d'un ou plusieurs documents "de position" (compte, abonné, employé ...)
- enregistrement d'un ou plusieurs credentials.
Tout ceci s'effectue depuis les données role / docId / cond / etc du document invitation.
Côté application, les credentials sont à enregistrer en Safe et des subscriptions
sont à gérer sur le / les documents de "position".
*/
class InvitValidate extends InvitValidateA {
  constructor () { super() }

  /* _accept: Accept // NON nul si "accept" {
    role: string // rôle du credential associé (et classe du document associé).
    docId: string // `docId` du credential associé (et du document associé le cas échéant).
    cond: any // données à faire figurer en `cond` du credential.
    etc: any // autres données nécessaires pour créer le document associé. 
      // U n'a pas à connaître ni interpréter `etc` (_opaque_ pour lui)
      // ne sert qu'à l'opération de création de l'objet / enregistrement du credential.
  }
  */

  init () {
    super.init()
  }

  /* Enregistrement:
    - d'un document 'Auteur' 
      - docId: tiré de invit (depuis "accept")
      - nom: depuis demande invit "label"
    - d'un Credential sur cet auteur avec un pemv / time passé en argument invVal
    - optionnellement d'un Credential de Sponsor sur 'Auteur' avec un pemv / time passé en argument invVal
  */
  async doIt_auteur () {
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
  }

  async doIt() {
    switch (this.invit.major) {
      case 'Auteur' : { await this.doIt_auteur(); break }
    }
  }

  /* async phase2 () {
    let s = 0
    this.requireAuth()
    // const sp = this.authRecord.userId
    this.invit = await this.cache.getDoc('Invitation', { invitId: this._invitId}) as Invitation
    if (!this.invit) s = 1
    else {
      if (this.invit.userId !== this.authRecord.userId) s = 2
      else if (this.invit.status !== 2) s = 3
      else {
        // Do the job: logique spécifique de l'application
        await this.doIt()
        this.invit.status = 4
        this.invit._status = DocStatus.UPD
      }
    }
    this.setRes('status', s)
  }
  */
}
Operation.register('InvitValidate', () => { return new InvitValidate()})
