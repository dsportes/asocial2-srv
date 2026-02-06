import { Operation } from './operation'
import { AppExc } from './index'
import { config } from './config'
import { Crypt, fromPem } from './crypt'
import { Util  } from './util'
import { Safe } from './iDbGeneric'
import { encode, decode } from '@msgpack/msgpack'

type Device = {
  devName: string | Uint8Array
  Va: string
  cy: string
  sign: Uint8Array
  nbe: number
}

/* Appel direct d'une opération: 
  const result = await SafeOperation.doOp(opName, args)
*/
export class SafeOperation extends Operation {
  static factories = new Map<string, Function>()

  static register (opName: string, factory: Function) {
    SafeOperation.factories.set(opName, factory)
  }

  static async doOp (opName: string, args: Object) : Promise<Object> {
    const f = SafeOperation.factories.get(opName)
    if (!f) throw new AppExc(1002, 'unknown operation', null, [opName])
    const op = f()
    op.opName = opName
    op.args = args
    op.result = { }
    try {
      await config.safeDB.getConnexion(op)
      await op.doTheJob()
      await op.db.disconnect()
      return op.result
    } catch (e) {
      await op.db.disconnect()
      throw(e)
    }
  }

  async getSafe (arg: Object): Promise<Safe> {
    const [m, safe] = await this.db.getSafe(arg['userId'])
    if (!safe) {
      this.setRes('status', 1)
      await Util.sleep(3000)
      return null
    }

    if (arg['shk'] && safe.hhk === Crypt.shaS(Util.b64ToU8(arg['shk'])))
      return safe

    let ok = false
    const sh1p = Util.b64ToU8(arg['sh1p'])
    const sh1r = Util.b64ToU8(arg['sh1r'])
    if (sh1p && safe.hhp1 === Crypt.shaS(sh1p)) ok = true
    else if (sh1r && safe.hhr1 === Crypt.shaS(sh1r)) ok = true
    if (ok) return safe
    
    this.setRes('status', 2)
    await Util.sleep(3000)
    return null
  }

  constructor () { super() }

  async doTheJob () : Promise<void> {  }

}

export type SafeCodes = { // paramétres de l'opération $UpdCodesSafe
  id: string // identifiant aléatoire.
  pseudo: string // pseudo / trigramme crypté par la clé K du _safe_.
  hp0: string // index unique, `SH(p0)`.
  hr0: string // index unique, `SH(r0)`.
  hhp1: string // SHA de `SH(p1)`.
  hhr1: string // SHA de `SH(r1)`.
  Ka: string // clé `K` du safe cryptée par `SH(p0, p1)`.
  Kr: string //  clé `K` du safe cryptée par `SH(r0, r1)`.
}
/*
export interface Safe extends SafeCodes { // paramétres de l'opération $CreateSafe
  hhk: string // SHA de `SH(K)`.
  C: string // clé publique de cryptage.
  DK: string // clé privée de décryptage, cryptée par la clé K
  S: string // clé publique de signature.
  VK: string // clé privée de vérification, cryptée par la clé K

  devices: Object
  creds: Object
  profiles: Object
  prefs: Object // pour chaque application, liste des préférences déclarées (ordonnée par date d'utilisation)
}
*/

/* Creation d'un nouveau Safe
*/
class $CreateSafe extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const safe = this.args['safe'] as Safe
    const ret = await this.db.newSafe(safe)
    if (ret !== 0) await Util.sleep(3000)
    this.setRes('status', ret)
  }
}
SafeOperation.register('$CreateSafe', () => { return new $CreateSafe()})

/* Restauration d'un Safe
*/
class $RestoreSafe extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const safe = this.args['safe'] as Safe
    const ret = await this.db.restoreSafe(safe)
    if (ret !== 0) await Util.sleep(3000)
    this.setRes('status', ret)
  }
}
SafeOperation.register('$RestoreSafe', () => { return new $RestoreSafe()})

/* Copie binaire du Safe args: userId shk
*/
class $GetBinSafe extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const [m, bin] = await this.db.getBinSafe(this.args['userId'])
    const hhk = Crypt.shaS(Util.b64ToU8(this.args['shk']))
    const safe = decode(bin) as Safe
    if (safe && hhk === safe.hhk) {
      this.setRes('status', 0)
      this.setRes('binsafe', bin)
    } else {
      this.setRes('status', 1)
      await Util.sleep(3000)
    }
  }
}
SafeOperation.register('$GetBinSafe', () => { return new $GetBinSafe()})

/* Mise à jour des codes d'accès d'un Safe
*/
class $UpdCodesSafe extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const safeNew = this.args['safeCodes'] as SafeCodes
    const [m, safe] = await this.db.getSafe(safeNew.id)
    if (!safe) {
      this.setRes('status', 1)
      await Util.sleep(3000)
      return
    }
    safe.pseudo = safeNew.pseudo
    safe.hp0 = safeNew.hp0
    safe.hr0 = safeNew.hr0
    safe.hhp1 = safeNew.hhp1
    safe.hhr1 = safeNew.hhr1
    safe.Ka = safeNew.Ka
    safe.Kr = safeNew.Kr
    const ret = await this.db.updPRSafe(safe)
    this.setRes('status', ret)
    if (ret !== 0) await Util.sleep(3000)
    else this.setRes('safe', safe)
  }
}
SafeOperation.register('$UpdCodesSafe', () => { return new $UpdCodesSafe()})

/* Ouverture d'un Safe
- sh0: sh (binaire) de la partie pseudo
- sh1: sh (binaire) de la partie phrase
status 0: OK, 1:pseudo non reconnu
byP: quand status 0, true si accès "primaire" (sinon "secondaire")
safe: quand status 0, le safe
*/
class $OpenSafeByPR extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    let byP = false
    let status = 1
    const s0 = this.args['sh0']
    const [m, safe] = await this.db.getSafe(s0)
    const hhp1 = Crypt.shaS(Util.b64ToU8(this.args['sh1']))
    if (safe && safe.hhp1 === hhp1) {
      byP = m === 1
      status = 0
    }
    this.setRes('status', status)
    this.setRes('safe', safe)
    this.setRes('byP', byP)
    if (status !== 0) await Util.sleep(3000)
  }
}
SafeOperation.register('$OpenSafeByPR', () => { return new $OpenSafeByPR()})

/* Ouverture d'un Safe
*/
class $OpenSafeById extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const [m, safe] = await this.db.getSafe(this.args['userId'])
    const hhk = Crypt.shaS(Util.b64ToU8(this.args['shk']))
    if (safe && hhk === safe.hhk) {
      this.setRes('status', 0)
      this.setRes('safe', safe)
    } else {
      this.setRes('status', 1)
      await Util.sleep(3000)
    }
  }
}
SafeOperation.register('$OpenSafeById', () => { return new $OpenSafeById()})

/* Ouverture d'un Safe
  - accède au _safe_ dont l'id est `userId`.
  - accède dans la section `devices` à l'entrée `devId` 
  ce qui lui donne les propriétés `Va cy sign nbe`. 
*/
class $OpenSafeByPin extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const userId: string = this.args['userId']
    const devId: string = this.args['devId']
    const pincx: string = this.args['pincx']

    const [m, safe] = await this.db.getSafe(userId)
    if (!safe) {
      this.setRes('status', 2)
      return
    }
    if (!safe.devices) safe.devices = {}
    const dev = safe.devices[devId]
    if (!dev) {
      this.setRes('status', 3)
      return
    }
    /* vérifie par `Va` que `sign` est bien la signature de pincx 
    */
    const V = fromPem(dev.Va, true)
    // Rétablit la signature en EC - ce que ne fait pas la version PHP
    const s1 = Util.b64ToU8(dev.sign)
    const sign = Crypt.signFromAsn1(s1)
    const ok = await Crypt.verify(V, sign, Util.b64ToU8(pincx))
    if (!ok) {
      dev.nbe++
      if (dev.nbe > 2) {
        delete safe.devices[devId]
        if (Object.keys(safe.devices).length === 0)
          delete safe.devices
        this.setRes('status', 5)
      } else this.setRes('status', 4)
      await this.db.updSafe(safe)
      return
    }
    if (dev.nbe) {
      dev.nbe = 0
      await this.db.updSafe(safe)
    }
    this.setRes('status', 0)
    this.setRes('cy', dev.cy)
  }
}
SafeOperation.register('$OpenSafeByPin', () => { return new $OpenSafeByPin()})

type TrustDev = {
  userId: string
  devId: string
  sh1p: Uint8Array
  sh1r: Uint8Array
  devName: Uint8Array
  Va: string
  cy: string
  sign: Uint8Array
}

type UntrustDev = {
  userId: string
  devIds: string[]
  sh1p: Uint8Array
  sh1r: Uint8Array
}

/* Trust d'un device
*/
class $TrustDevice extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const td = this.args['trustDev'] as TrustDev
    const safe = await this.getSafe(td)
    if (!safe) return

    const d: Device = {
      devName: td.devName,
      Va: td.Va,
      cy: td.cy,
      sign: td.sign,
      nbe: 0
    }
    if (!safe.devices) safe.devices = {}
    safe.devices[td.devId] = d
    await this.db.updSafe(safe)
    this.setRes('status', 0)
    this.setRes('safe', safe)
  }
}
SafeOperation.register('$TrustDevice', () => { return new $TrustDevice()})

/* Trust d'un device
*/
class $UntrustDevices extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const td = this.args['untrustDev']
    const safe = await this.getSafe(td)
    if (!safe) return

    if (safe.devices) for (const id of td.devIds)
      delete safe.devices[id]
    if (Object.keys(safe.devices).length === 0)
      delete safe.devices
    await this.db.updSafe(safe)
    this.setRes('status', 0)
    this.setRes('safe', safe)
  }
}
SafeOperation.register('$UntrustDevices', () => { return new $UntrustDevices()})

type SetAboutProfile = {
  app: string
  userId: string
  shk: Uint8Array
  profId: string
  about: Uint8Array
}

/* Sauvegarde de la maj de l'about du profil
ou crée un profil avec about et creds vide s'il n'existait pas */
class $SetAboutProfile extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const ab = this.args['aboutProfile'] as SetAboutProfile
    const safe = await this.getSafe(ab)
    if (!safe) return

    if (!safe.profiles) safe.profiles = {}
    let appe = safe.profiles[ab.app]
    if (!appe) { appe = {}; safe.profiles[ab.app] = appe }

    let prf = appe[ab.profId]
    if (!prf) { prf = { creds: [] } ; appe[ab.profId] = prf }
    prf.about = ab.about
    await this.db.updSafe(safe)
    this.setRes('status', 0)
    this.setRes('safe', safe)
  }
}
SafeOperation.register('$SetAboutProfile', () => { return new $SetAboutProfile()})

type UpdateCreds = {
  app: string
  userId: string
  shk: Uint8Array
  creds: Object // clé: credId, valeur: Objet Credential sérialisé crypté
  delcreds: string[] // liste des credIds à supprimer
  profiles: Object // clé: profId, valeur: Objet Profile sérialisé crypté
  delprofs: string[] // liste des profIds à supprimer
  nosafe: boolean // ne pas retourner le safe mis à jour
}

/* Sauvegarde de la maj de l'about du profil
ou crée un profil avec about et creds vide s'il n'existait pas */
class $UpdateCreds extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const uc = this.args['updateCreds'] as UpdateCreds
    const safe = await this.getSafe(uc)
    if (!safe) return

    if (!safe.profiles) safe.profiles = {}
    if (!safe.creds) safe.creds = {}

    let appp = safe.profiles[uc.app]
    if (!appp) { appp = {}; safe.profiles[uc.app] = appp }
    for(const profId in uc.profiles)
      appp[profId] = uc.profiles[profId]
    for(const profId of uc.delprofs)
      delete appp[profId]
    if (Object.keys(safe.profiles[uc.app]).length === 0)
      delete safe.profiles[uc.app]
    if (Object.keys(safe.profiles).length === 0)
      delete safe.profiles

    let appc = safe.creds[uc.app]
    if (!appc) { appc = {}; safe.creds[uc.app] = appc}
    for(const credId in uc.creds)
      appc[credId] = uc.creds[credId]
    for(const credId of uc.delcreds)
      delete appc[credId]
    if (Object.keys(safe.creds[uc.app]).length === 0) 
      delete safe.creds[uc.app]
    if (Object.keys(safe.creds).length === 0)
      delete safe.creds

    await this.db.updSafe(safe)
    this.setRes('status', 0)
    if (!uc.nosafe) this.setRes('safe', safe)
  }
}
SafeOperation.register('$UpdateCreds', () => { return new $UpdateCreds()})

type TransmitCred = {
  app: string
  targetId: string // id ou p0 ou r0 du destinataire du credential
  credId: string // id du credential
  crpub: string // [cryptedCred, pubc] encodé et en base64
    // pubC: string // clé publique (PEM) de cryptage de l'émetteur
    // cryptedCred: string // Objet Credential sérialisé crypté pour le destinataire
}
/* Tranmission d'un credentialpar user "émetteur" à un user "target
- target est donné par son id ou l'un de ses pseudos p0 ou r0
- la clé publique de cryptage de l'émetteur est donnée dans pubC
- l'objet credential a été sérialisé puis crypté par la clé AES obtenue depuis
la clé privée de l'émetteur et la clé publique du destinataire target
*/
class $TransmitCred extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const tc = this.args['transmitCred'] as TransmitCred
    const [m, safe] = await this.db.getSafe(tc.targetId)

    if (!safe) {
      this.setRes('status', 1)
      return
    }

    if (!safe.creds) safe.creds = {}

    let appc = safe.creds[tc.app]
    if (!appc) { appc = {}; safe.creds[tc.app] = appc}
    appc['$' + tc.credId] = tc.crpub
    if (Object.keys(safe.creds[tc.app]).length === 0) 
      delete safe.creds[tc.app]
    if (Object.keys(safe.creds).length === 0)
      delete safe.creds

    await this.db.updSafe(safe)
    this.setRes('status', 0)
  }
}
SafeOperation.register('$TransmitCred', () => { return new $TransmitCred()})

/* Status de création d'un safe - Permet de savoir dans quelles conditions le safe pourrait être "recréé".
- id, hp0, hr0 : id et accès externe 
Retour : { lm, xp, xr }
- lm : last modifidication time du safe d' id donnée. -1 si ce safe n'existe pas.
- xp : true si aucun safe n'a hp0 comme cl& externe OU si le safe d'id existe et a 
hp0 comme clé p0
- xr : idem pour hr0
*/
class $StatusSafe extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const id = this.args['id']
    const hp0 = this.args['hp0']
    const hr0 = this.args['hr0']
    const ret = await this.db.statusSafe(id, hp0, hr0)
    this.setRes('statusSafe', ret)
  }
}
SafeOperation.register('$StatusSafe', () => { return new $StatusSafe()})

/* Obtention des clés publique d'un safe donné par:
- son id, son pseudo principal ou secondaire
- res.crypt: clé de cryptage
- res.verif: clé de vérification
*/
class $GetPublicKeys extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const id = this.args['id']
    const [m, safe] = await this.db.getSafe(id)
    this.setRes('crypt', safe ? safe.C : null)
    this.setRes('verify', safe ? safe.V : null)
  }
}
SafeOperation.register('$GetPublicKeys', () => { return new $GetPublicKeys()})
