import { AppExc, AbstractOperation } from './index'
import { config, Classes } from './config'
import { Crypt, keyFromB64 } from './crypt'
import { Util } from './util'
import { Safe, Auth, Alias } from './iDbGeneric'
import { encode, decode } from '@msgpack/msgpack'

export function loadingOS () {
  console.log('safe operations loading: ', Classes.sizeOp())
}

type Device = {
  devName: string
  Va: string
  cy: string
  sign: string
  nbe: number
}

/* Appel direct d'une opération: 
  const result = await SafeOperation.doOp(opName, args)
*/
export class SafeOperation implements AbstractOperation {
  opName: string
  result: any
  args: any 
  db: any
  now: number
  // org: string
  
  /* Fixe LA valeur de la propriété 'prop' du résultat (et la retourne)*/
  setRes(prop: string, val: any) { this.result[prop] = val; return val }

  delRes(prop: string) { delete this.result[prop] }

  /* Depuis l'intérieur d'une opération, soumet une opération (opName, args) de safe
  au safe 'safeStore'
  static async postToSafe (op: AbstractOperation, opName: string, args: Object, safeStore?: string)
   : Promise<Object> {
    let u = config.MASTERDIR
    if (safeStore) {
      const x = await SafeCache.get(op, safeTable.SVCOPS, 'SAFE') as Object
      u = x ? x[safeStore] : null
    }
    if (!u)
      throw new AppExc(3005, 'postToSafe error', null, [op.opName, safeStore])
    const url = u + '/safe/' + opName
    const body = new Uint8Array(encode(args))
    try {
      const response = await fetch(url , {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',  // sent request
          'Accept':       'application/octet-stream'   // expected data sent back
        },
        body,
      })
      const buf = await response.bytes()
      const obj = decode(buf)
      if (response.status === 200) return obj
      throw new AppExc(3003, 'masterdir error', null, [op.opName, opName, '' + response.status])
    } catch(e) {
      if (e instanceof AppExc) throw e
      throw new AppExc(3003, 'masterdir error', null, [op.opName, opName, e.message])
    }
  }
  */

  static async doOp (opName: string, args: Object) : Promise<Object> {
    const op = Classes.newOp(opName)
    if (!op) throw new AppExc(1002, 'unknown operation', null, [opName])
    op.opName = opName
    op.now = Date.now()
    op.args = args
    op.result = {}
    try {
      await config.safeDB.getConnexion(op)
      await op.doTheJob()
      await op.db.disconnect()
      return op.result
    } catch (e: any) {
      await op.db.disconnect()
      throw(e)
    }
  }

  async cleanAndSave (safe: any, updated?: boolean) {
    let u = updated || false
    if (safe.invits) {
      const d = Math.floor(Date.now() / 86400000)
      let b = false
      for(const xid of Array.from(Object.keys(safe.invits))) {
        const x = safe.invits[xid]
        const d2 = Math.floor(x.time / 86400)
        if (d2 < (d - 7)) { delete(safe.invits[xid]); u = true }
        else b = true
      }
      if (!b) delete safe.invits
    }
    const d = new Date()
    const q = Util.quarter(d)
    if (safe.auth.llq < q) {
      safe.auth.llq = q
      u = true
    }
    if (u) {
      safe.auth.lm = d.getTime()
      await this.db.setSafe(safe)
    }
    this.setRes('safe', safe)
  }

  async getSafe (arg: Object): Promise<Safe> {
    const bin = await this.db.getSafe(arg['userId'])
    if (!bin) {
      this.setRes('status', 1)
      return null
    }
    const safe = decode(bin) as Safe
    if (arg['shK'] && safe.auth.hshK === Crypt.shaS(Util.b64ToU8(arg['shK'])))
      return safe
    else {
      this.setRes('status', 2)
      return null
    }
  }

  async doTheJob () : Promise<void> {  }
}

/*
export type SafeCodes = { // paramétres de l'opération $UpdCodesSafe
  id: string // identifiant aléatoire.
  hp0: string // index unique, `SH(p0)`.
  hr0: string // index unique, `SH(r0)`.
  hhp1: string // SHA de `SH(p1)`.
  hhr1: string // SHA de `SH(r1)`.
  Ka: string // clé `K` du safe cryptée par `SH(p0, p1)`.
  Kr: string //  clé `K` du safe cryptée par `SH(r0, r1)`.
}
*/

/* Creation d'un nouveau Safe.
Pas de status.
*/
class $CreateSafe extends SafeOperation {
  async doTheJob () : Promise<void> { 
    const safe = this.args['safe'] as Safe
    await this.db.newSafe(safe)
  }
}
Classes.registerOp($CreateSafe)

/* Restauration d'un Safe
class $RestoreSafe extends SafeOperation {

  async doTheJob () : Promise<void> { 
    const safe = this.args['safe'] as Safe
    this.cleanInvits(safe)
    const ret = await this.db.restoreSafe(safe)
    if (ret !== 0) await Util.sleep(3000)
    this.setRes('status', ret)
  }
}
Classes.registerOp($RestoreSafe)
*/

/* Login (ou refresh) - Retourne le Safe depuis son id + preuve 
args: userId + ...
- soit shK: Strong Hash de la clé K - pour mise à jour
- soit shp : Strong Hash de la phrase 1 ou 2  - login "fort"
Status: 1 2 3
*/
class $GetSafe extends SafeOperation {
  async doTheJob () : Promise<void> {
    const bin = await this.db.getBinSafe(this.args['userId'])
    if (!bin) {
      this.setRes('status', 1)
      await Util.sleep(3000)
      return
    } 
    const safe = decode(bin) as Safe
    let ok = false
    if (this.args['shK']) {
      if (Crypt.shaS(Util.b64ToU8(this.args['shK'])) === safe.auth.hshK) ok = true
      else return this.setRes('status', 2)
    }
    if (!ok && this.args['shp']) {
      const hshp = Crypt.shaS(Util.b64ToU8(this.args['shp']))
      if (hshp === safe.auth.hshp1 || hshp == safe.auth.hshp2) ok = true
    }
    if (!ok) return this.setRes('status', 3)
    this.setRes('status', 0)
    await this.cleanAndSave(safe)
  }
}
Classes.registerOp($GetSafe)

/* Mise à jour des alias d'un Safe. 
Args: userId, shK, 
- actual : alias actuel (n'est jamais null)
- future: futur alias (null quand validation)
Status: 1 2
*/
class $SetAliasSafe extends SafeOperation {
  async doTheJob () : Promise<void> { 
    const actual = this.args['actual'] as Alias
    const future = this.args['future'] as Alias
    const safe = await this.getSafe(this.args)
    if (!safe) return
    safe.auth.actual = actual
    safe.auth.future = future || null
    await this.cleanAndSave(safe, true)
  }
}
Classes.registerOp($SetAliasSafe)

/* Mise à jour des phrases secretes d'un Safe. p1 et p2 jamais null ensemble
Args: userId, shK, 
- hshp1: string // SHA raccourci du Strong Hash de la phrase 1 (en base 64).
- K1: string // clé K cryptée par le Strong Hash de la phrase 1.
- hshp2: string
- K2: string
Status: 1 2
*/
class $SetPhraseSafe extends SafeOperation {
  async doTheJob () : Promise<void> { 
    const hshp1 = this.args['hshp1'] as string
    const hshp2 = this.args['hshp2'] || '' as string
    const K1 = this.args['K1'] as string
    const K2 = this.args['K2'] || '' as string
    if (!hshp1 && !hshp2) 
      throw new AppExc(3006, 'missing p1 and p2', this)
    const safe = await this.getSafe(this.args)
    if (!safe) return
    let u = false
    if (hshp1 !== safe.auth.hshp1) {
      safe.auth.hshp1 = hshp1
      safe.auth.K1 = K1
      u = true
    }
    if (hshp2 !== safe.auth.hshp2) {
      safe.auth.hshp2 = hshp2
      safe.auth.K2 = K2
      u = true
    }
    await this.cleanAndSave(safe, u)
  }
}
Classes.registerOp($SetPhraseSafe)

/* Ouverture d'un Safe
- sh0: sh (binaire) de la partie pseudo
- sh1: sh (binaire) de la partie phrase
status 0: OK, 1:pseudo non reconnu
byP: quand status 0, true si accès "primaire" (sinon "secondaire")
safe: quand status 0, le safe

class $OpenSafeByPR extends SafeOperation {

  async doTheJob () : Promise<void> {
    let byP = false
    let status = 1
    const s0 = this.args['sh0']
    let [m, safe] = await this.db.getSafe(s0)
    if (!safe) {
      status = 3
      byP = false
      safe = null
    } else {
      const hh1 = Crypt.shaS(Util.b64ToU8(this.args['sh1']))
      if (m === 1 && safe.hhp1 === hh1) {
        byP = true
        status = 0
      } else if (m === 2 && safe.hhr1 === hh1) {
        byP = false
        status = 0
      } else {
        status = 3
        byP = false
        safe = null
      }
    }
    this.cleanInvits(safe)
    this.setRes('status', status)
    this.setRes('safe', safe)
    this.setRes('byP', byP)
    if (status !== 0) await Util.sleep(3000)
  }
}
Classes.registerOp($OpenSafeByPR)
*/

/* Ouverture d'un Safe
class $OpenSafeById extends SafeOperation {

  async doTheJob () : Promise<void> {
    const [m, safe] = await this.db.getSafe(this.args['userId'])
    const hhk = Crypt.shaS(Util.b64ToU8(this.args['shK']))
    if (safe && hhk === safe.hhk) {
      this.cleanInvits(safe)
      this.setRes('status', 0)
      this.setRes('safe', safe)
    } else {
      this.setRes('status', 1)
      await Util.sleep(3000)
    }
  }
}
Classes.registerOp($OpenSafeById)
*/

/* Ouverture d'un Safe par PIN
  - accède au _safe_ dont l'id est `userId`.
  - accède dans la section `devices` à l'entrée `devId` 
  ce qui lui donne les propriétés `Va cy sign nbe`. 
Status: 1 4 5 6
*/
class $OpenSafeByPin extends SafeOperation {
  async doTheJob () : Promise<void> {
    const userId: string = this.args['userId']
    const devId: string = this.args['devId']
    const pincx: string = this.args['pincx']

    const safe = await this.db.getSafe(userId)
    if (!safe) {
      this.setRes('status', 1)
      return
    }
    const dev = safe.devices ? safe.devices[devId] as Device : null
    if (!dev) {
      this.setRes('status', 4)
      return
    }
    // vérifie par `Va` que `sign` est bien la signature de pincx 
    const V = keyFromB64(dev.Va)
    // Rétablit la signature en EC - ce que ne fait pas la version PHP
    const s1 = Util.b64ToU8(dev.sign)
    const sign = Crypt.signFromAsn1(s1)
    const ok = await Crypt.verify(V, sign, Util.b64ToU8(pincx))
    
    if (!ok) {
      dev.nbe++
      if (dev.nbe > 2) {
        delete safe.devices[devId]
        this.setRes('status', 5)
      } else this.setRes('status', 6)
      if (Object.keys(safe.devices).length === 0)
        delete safe.devices
      await this.cleanAndSave(safe, true)
      return
    }

    if (dev.nbe) {
      dev.nbe = 0
      await this.cleanAndSave(safe, true)
    }
    this.setRes('status', 0)
    this.setRes('cy', dev.cy)
  }
}
Classes.registerOp($OpenSafeByPin)

/* Changement du contact
type SetContact = {
  userId: string
  contact: string
  hct: string
  shK: string
}
class $SetContact extends SafeOperation {

  async doTheJob () : Promise<void> {
    const sc = this.args['setcontact'] as SetContact
    const safe = await this.getSafe(sc)
    if (!safe) return
    safe.contact = sc.contact
    safe.hct = sc.hct
    this.cleanInvits(safe)
    await this.db.updHctSafe(safe)
    this.setRes('status', 0)
    this.setRes('safe', safe)
  }
}
Classes.registerOp($SetContact)
*/

type SetAdmins = {
  userId: string
  shK: string
  admins: string
}
/* Enregistrement de la liste admins.
Status: 1 2
*/
class $SetAdmins extends SafeOperation {
  async doTheJob () : Promise<void> {
    const sa = this.args['setadmins'] as SetAdmins
    const safe = await this.getSafe(sa)
    if (!safe) return
    let u = false
    if (safe.auth.admins !== sa.admins) {
      safe.auth.admins = sa.admins
      u = true
    }
    await this.cleanAndSave(safe, u)
    this.setRes('status', 0)
  }
}
Classes.registerOp($SetAdmins)

type TrustDev = {
  userId: string
  shK: string
  devId: string
  devName: string
  Va: string
  cy: string
  sign: string
  pseudo: string
}

/* Trust d'un device (certification) 
Status: 1 2
*/
class $TrustDevice extends SafeOperation {
  async doTheJob () : Promise<void> {
    const td = this.args['trustDev'] as TrustDev
    const safe = await this.getSafe(td)
    if (!safe) return

    safe.auth.pseudo = td.pseudo || ''

    const d: Device = {
      devName: td.devName,
      Va: td.Va,
      cy: td.cy,
      sign: td.sign,
      nbe: 0
    }
    if (!safe.devices) safe.devices = {}
    safe.devices[td.devId] = d
    await this.cleanAndSave(safe, true)
    this.setRes('status', 0)
  }
}
Classes.registerOp($TrustDevice)

type UntrustDev = {
  userId: string
  shK: string
  devIds: string[]
}
/* Untrust d'une liste de devices 
Status: 1 2
*/
class $UntrustDevices extends SafeOperation {
  async doTheJob () : Promise<void> {
    const td = this.args['untrustDev'] as UntrustDev
    const safe = await this.getSafe(td)
    if (!safe) return
    let u = false
    if (safe.devices) {
      for (const id of td.devIds) { delete safe.devices[id]; u = true }
      if (Object.keys(safe.devices).length === 0) delete safe.devices
    }
    await this.cleanAndSave(safe, true)
    this.setRes('status', 0)
  }
}
Classes.registerOp($UntrustDevices)

/* Creds ***************************************************************/
type SetCred = {
  userId: string
  shK: string 
  credid: string // id du credential
  comment: string // comment crypté par K et en base 64
  cred?: string // CredSafe sérialisé, crypté par K et en base64 (pour création)
}
/* Enregistrement d'un credential
Status: 1 2
*/
class $CreateCred extends SafeOperation {
  async doTheJob () : Promise<void> {
    const sc = this.args['setCred'] as SetCred
    const safe = await this.getSafe(sc)
    if (!safe) return

    if (!safe.creds) safe.creds = {}
    const x = [sc.comment, sc.cred]
    safe.creds[sc.credid] = x

    await this.cleanAndSave(safe, true)
    this.setRes('status', 0)
  }
}
Classes.registerOp($CreateCred)

/* Maj du commentaire d'un credential
Status: 1 2
*/
class $UpdateCredComment extends SafeOperation {
  async doTheJob () : Promise<void> {
    const sc = this.args['setCred'] as SetCred
    const safe = await this.getSafe(sc)
    if (!safe) return
    let u = false
    if (safe.creds) {
      const x = safe.creds[sc.credid]
      if (x) {
        x[0] = sc.comment
        safe.creds[sc.credid] = x
        u = true
      }
    }
    await this.cleanAndSave(safe, u)
    this.setRes('status', 0)
  }
}
Classes.registerOp($UpdateCredComment)

type RevokeCreds = {
  userId: string
  shK: string
  ids: string[] 
}
/* Auto révocation d'un credential.
Status: 1 2
*/
class $AutoRevokeCreds extends SafeOperation {
  async doTheJob () : Promise<void> {
    const rc = this.args['revokeCreds'] as RevokeCreds
    const safe = await this.getSafe(rc)
    if (!safe) return
    let u = false
    if (safe.creds) {
      for(const id of rc.ids) { delete safe.creds[id]; u = true }
      if (Object.keys(safe.creds).length === 0) delete safe.creds
    }
    await this.cleanAndSave(safe, u)
    this.setRes('status', 0)
  }
}
Classes.registerOp($AutoRevokeCreds)

/* Profiles *****************************************************/
type SetProfiles = {
  userId: string
  shK: string
  app: string
  profiles: Object | null // clé: profId, valeur: Objet Profile sérialisé crypté
  delprofs: string[] // liste des profIds à supprimer
}
/* Déclaration de profils et suppressions de profils
Status: 1 2
*/
class $UpdateProfiles extends SafeOperation {
  async doTheJob () : Promise<void> {
    const sp = this.args['setProfiles'] as SetProfiles
    const safe = await this.getSafe(sp)
    if (!safe) return
    let u = false

    if (!safe.profiles) safe.profiles = {}
    let appp = safe.profiles[sp.app]
    if (!appp) { appp = {}; safe.profiles[sp.app] = appp }
    for(const profId in sp.profiles) { appp[profId] = sp.profiles[profId]; u = true }
    for(const profId of sp.delprofs) { delete appp[profId]; u = true }
    if (Object.keys(safe.profiles[sp.app]).length === 0) delete safe.profiles[sp.app]
    if (Object.keys(safe.profiles).length === 0) delete safe.profiles
    await this.cleanAndSave(safe, u)
    this.setRes('status', 0)
  }
}
Classes.registerOp($UpdateProfiles)

type SetAboutProfile = {
  userId: string
  shK: string
  app: string
  profId: string
  about: string
}
/* Maj de l'about d'un profil
Status: 1 2
*/
class $SetAboutProfile extends SafeOperation {
  async doTheJob () : Promise<void> {
    const ab = this.args['aboutProfile'] as SetAboutProfile
    const safe = await this.getSafe(ab)
    if (!safe) return
    let u = false
    if (safe.profiles && safe.profiles[ab.app] && safe.profiles[ab.app][ab.profId]) {
      const prf = decode(Util.b64ToU8(safe.profiles[ab.app][ab.profId]))
      prf['about'] = ab.about
      safe.profiles[ab.app][ab.profId] = Util.u8ToB64(encode(prf))
      u = true
    }
    await this.cleanAndSave(safe, u)
    this.setRes('status', 0)
  }
}
Classes.registerOp($SetAboutProfile)

/* Prefs ***************************************************************/
type UpdatePrefs = {
  userId: string
  shK: string
  app: string   
  prefs: Object // clé: crId, valeur: Objet Credential sérialisé crypté
  delprefs: string[] // liste des crIds à supprimer
}
/* Eneristrement / suppression de préférences
Status: 1 2
*/
class $UpdatePrefs extends SafeOperation {
  async doTheJob () : Promise<void> {
    const up = this.args['updatePrefs'] as UpdatePrefs
    const safe = await this.getSafe(up)
    if (!safe) return
    let u = false

    if (!safe.prefs) safe.prefs = {}
    let appp = safe.prefs[up.app]
    if (!appp) { appp = {}; safe.prefs[up.app] = appp }
    for(const code in up.prefs) { appp[code] = up.prefs[code]; u = true }
    for(const code of up.delprefs) { delete appp[code]; u = true }
    if (Object.keys(safe.prefs[up.app]).length === 0) delete safe.prefs[up.app]
    if (Object.keys(safe.prefs).length === 0) delete safe.prefs

    await this.cleanAndSave(safe, u)
    this.setRes('status', 0)
  }
}
Classes.registerOp($UpdatePrefs)
/*****************************************************************************/

type AddInvit = {
  userId: string
  invitId: string
  status: number
  time: number
  invit: string // Objet invit sérialisé crypté en base64
  shK?: string // Cas d'une création pour U par U
  pubC?: string // Cas d'une création pour U par X
                // invit est à décrypter par le couple U/X (et non keyK)
}
/* Enregistrement d'une invitation
Status: 1 2
*/
class $AddInvit extends SafeOperation {
  async doTheJob () : Promise<void> {
    const inv = this.args['addInvit'] as AddInvit
    const safe = await this.db.getSafe(inv.userId)
    if (!safe) {
      this.setRes('status', 1)
      return
    }
    if (inv.shK && safe.auth.hshK !== Crypt.shaS(Util.b64ToU8(inv.shK))) {
      this.setRes('status', 2)
      return
    }

    if (!safe.invits) safe.invits = {}

    const x = { status: inv.status, time: inv.time, invit: inv.invit }
    if (inv.pubC) x['pubC'] = inv.pubC
    safe.invits[inv.invitId] = x
    this.cleanAndSave(safe, true)
    this.setRes('status', 0)
    // le safe n'est pas retourné dans la cas d'une création par X
    if (inv.pubC) this.delRes('safe')
  }
}
Classes.registerOp($AddInvit)

export type StatusInvit = {
  targetId: string
  invitId: string
  status: number
}
/* Maj du status d'une invitation
Status: 1 2
*/
class $StatusInvit extends SafeOperation {
  async doTheJob () : Promise<void> {
    const st = this.args['statusInvit'] as StatusInvit
    const safe = await this.db.getSafe(st.targetId)
    if (!safe || !safe.invits) {
      this.setRes('status', 1)
      return
    }
    const inv = safe.invits[st.invitId]
    if (inv) {
      inv.status = st.status
      await this.cleanAndSave(safe)
      this.delRes('safe')
      this.setRes('status', 0)
    } else this.setRes('status', 7)
  }
}
Classes.registerOp($StatusInvit)

/*
type TransmitCred = {
  targetId: string // id ou p0 ou r0 du destinataire du credential
  credid: string // id du credential
  crpub: string // [cryptedCred, pubc] encodé et en base64
    // pubC: string // clé publique (PEM) de cryptage de l'émetteur
    // cryptedCred: string // Objet Credential sérialisé crypté pour le destinataire
}

class $TransmitCred extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const tc = this.args['transmitCred'] as TransmitCred
    const [m, safe] = await this.db.getSafe(tc.targetId)

    if (!safe) {
      this.setRes('status', 1)
      return
    }
    this.cleanInvits(safe)

    if (!safe.creds) safe.creds = {}

    safe.creds['$' + tc.credid] = tc.crpub
    if (Object.keys(safe.creds).length === 0)
      delete safe.creds

    await this.db.updSafe(safe)
    this.setRes('status', 0)
  }
}
Classes.registerOp($TransmitCred', () => { return new $TransmitCred()})
*/


/* Status de création d'un safe - Permet de savoir dans quelles conditions le safe pourrait être "recréé".
- id, hp0, hr0 : id et accès externe 
Retour : { lm, xp, xr }
- lm : last modifidication time du safe d' id donnée. -1 si ce safe n'existe pas.
- xp : true si aucun safe n'a hp0 comme cl& externe OU si le safe d'id existe et a 
hp0 comme clé p0
- xr : idem pour hr0

class $StatusSafe extends SafeOperation {

  async doTheJob () : Promise<void> {
    const id = this.args['id']
    const hp0 = this.args['hp0']
    const hr0 = this.args['hr0']
    const ret = await this.db.statusSafe(id, hp0, hr0)
    this.setRes('statusSafe', ret)
  }
}
Classes.registerOp($StatusSafe)
*/

/* Obtention des clés publiques d'un safe donné par:
- son id, son pseudo principal ou secondaire
- res.crypt: clé de cryptage
- res.verif: clé de vérification

class $GetPublicKeys extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const id = this.args['id']
    const [m, safe] = await this.db.getSafe(id)
    this.setRes('userId', safe.id)
    this.setRes('crypt', safe ? safe.C : null)
    this.setRes('verify', safe ? safe.V : null)
  }
}
Classes.registerOp($GetPublicKeys', () => { return new $GetPublicKeys()})
*/

/* Obtention des clés publiques et id d'un safe donné par:
- son id, son pseudo principal ou secondaire, son contact

class $GetUserICVO extends SafeOperation {

  async doTheJob () : Promise<void> {
    const id = this.args['id']
    const [m, safe] = await this.db.getSafe(id)
    this.setRes('icvo', {i: safe.id, c: safe.C, v: safe.V, o: '' })
  }
}
Classes.registerOp($GetUserICVO)
*/


/* Suppression d'un safe -
Args: userId, shK
Status: 1 2
*/
class $DelSafe extends SafeOperation {
  async doTheJob () : Promise<void> {
    const userId = this.args['userId']
    const safe = await this.getSafe(this.args)
    if (!safe) return
    await this.db.delSafe(userId)
    this.setRes('status', 0)
  }
}
Classes.registerOp($DelSafe)

/* Ping */
class $Ping extends SafeOperation {
  async doTheJob () : Promise<void> {
    this.setRes('ping', true)
  }
}
Classes.registerOp($Ping)
