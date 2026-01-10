import { Operation } from './operation'
import { AppExc } from './index'
import { config } from './config'
import { IDP0R0 } from './iDbGeneric'
import { Crypt } from './crypt'
import { Util } from './util'
// import { encode, decode } from '@msgpack/msgpack'

type Device = {
  devName: string | Uint8Array
  Va: Uint8Array
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
      await config.directoryDB.getConnexion(op)
      await op.doTheJob()
      await op.db.disconnect()
      return op.result
    } catch (e) {
      await op.db.disconnect()
      throw(e)
    }
  }

  constructor () { super() }

  async doTheJob () : Promise<void> {  }

  async getSafePR (sh0: Uint8Array, sh1: Uint8Array)
    : Promise<[status: number, safe: Safe, byP: boolean]> { 
    let byP = true
    const s0 = Util.u8ToB64(sh0, true)
    const hhp1 = Crypt.shaS(sh1)
    let safe: Safe = (await this.db.getSafe(s0, IDP0R0.P0)) as Safe
    if (!safe) {
      byP = false
      safe = (await this.db.getSafe(s0, IDP0R0.R0)) as Safe
      if (!safe) return [1, null, false]
    }
    if (safe.hhp1 !== hhp1) return [2, null, false]
    return [0, safe, byP]
  }

}

export type SafeCodes = { // paramétres de l'opération $UpdCodesSafe
  id: string // identifiant aléatoire.
  pseudo: Uint8Array // pseudo / trigramme crypté par la clé K du _safe_.
  hp0: string // index unique, `SH(p0)`.
  hr0: string // index unique, `SH(r0)`.
  hhp1: string // SHA de `SH(p1)`.
  hhr1: string // SHA de `SH(r1)`.
  Ka: Uint8Array // clé `K` du safe cryptée par `SH(p0, p1)`.
  Kr: Uint8Array //  clé `K` du safe cryptée par `SH(r0, r1)`.
}

export interface Safe extends SafeCodes { // paramétres de l'opération $CreateSafe
  hhk: string // SHA de `SH(K)`.
  C: Uint8Array // clé publique de cryptage.
  DK: Uint8Array // clé privée de décryptage, cryptée par la clé K
  S: Uint8Array // clé publique de signature.
  VK: Uint8Array // clé privée de vérification, cryptée par la clé K

  devices: Object
  creds: Object
  profiles: Object
  prefs: Object // pour chaque application, liste des préférences déclarées (ordonnée par date d'utilisation)
}

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

/* Mise à jour des codes d'accès d'un Safe
*/
class $UpdCodesSafe extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const safeNew = this.args['safeCodes'] as SafeCodes
    const safe: Safe = (await this.db.getSafe(safeNew.id)) as Safe
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
*/
class $OpenSafeByPR extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const [status, safe, byP] = await this.getSafePR(this.args['sh0'], this.args['sh1'])
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
    const safe = await this.db.getSafe(this.args['userId']) as Safe
    const hhk = Crypt.shaS(this.args['shk'])
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
    const pincx: Uint8Array = this.args['pincx']

    const safe = await this.db.getSafe(userId) as Safe
    if (!safe) {
      this.setRes('status', 2)
      return
    }
    const dev = safe.devices[devId]
    if (!dev) {
      this.setRes('status', 3)
      return
    }
    /* vérifie par `Va` que `sign` est bien la signature de pincx 
    */
    const ok = await Crypt.verify(dev.Va, dev.sign, pincx)
    if (!ok) {
      dev.nbe++
      if (dev.nbe > 2) {
        delete safe.devices[devId]
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

type ReloadSafe = {
  userId: string
  shk: Uint8Array
}

/* Sauvegarde de la maj de l'about du profil
ou crée un profil avec about et creds vide s'il n'existait pas */
class $ReloadSafe extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const ab = this.args['reloadSafe'] as SetAboutProfile
    const safe = await this.db.getSafe(ab.userId) as Safe
    if (!safe) {
      this.setRes('status', 1)
      await Util.sleep(3000)
      return
    }

    if (safe.hhk !== Crypt.shaS(ab.shk)) {
      this.setRes('status', 2)
      await Util.sleep(3000)
      return
    }
    this.setRes('status', 0)
    this.setRes('safe', safe)
  }
}
SafeOperation.register('$ReloadSafe', () => { return new $ReloadSafe()})

type TrustDev = {
  userId: string
  devId: string
  sh1p: Uint8Array
  sh1r: Uint8Array
  devName: Uint8Array
  Va: Uint8Array
  cy: string
  sign: Uint8Array
}

type UntrustDev = {
  userId: string
  devId: string
  sh1p: Uint8Array
  sh1r: Uint8Array
}

/* Trust d'un device
*/
class $TrustDevice extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const td = this.args['trustDev'] as TrustDev
    const safe = await this.db.getSafe(td.userId) as Safe
    if (!safe) {
      this.setRes('status', 1)
      await Util.sleep(3000)
      return
    }
    let ok = false
    if (td.sh1p && safe.hhp1 === Crypt.shaS(td.sh1p)) ok = true
    else if (td.sh1r && safe.hhr1 === Crypt.shaS(td.sh1r)) ok = true
    if (!ok) {
      this.setRes('status', 2)
      await Util.sleep(3000)
      return
    }

    const d: Device = {
      devName: td.devName,
      Va: td.Va,
      cy: td.cy,
      sign: td.sign,
      nbe: 0
    }
    safe.devices[td.devId] = d
    await this.db.updSafe(safe)
    this.setRes('status', 0)
    this.setRes('safe', safe)
  }
}
SafeOperation.register('$TrustDevice', () => { return new $TrustDevice()})

/* Trust d'un device
*/
class $UntrustDevice extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const td = this.args['untrustDev'] as UntrustDev
    const safe = await this.db.getSafe(td.userId) as Safe
    if (!safe) {
      this.setRes('status', 1)
      await Util.sleep(3000)
      return
    }
    let ok = false
    if (td.sh1p && safe.hhp1 === Crypt.shaS(td.sh1p)) ok = true
    else if (td.sh1r && safe.hhr1 === Crypt.shaS(td.sh1r)) ok = true
    if (!ok) {
      this.setRes('status', 2)
      await Util.sleep(3000)
      return
    }

    delete safe.devices[td.devId]
    await this.db.updSafe(safe)
    this.setRes('status', 0)
    this.setRes('safe', safe)
  }
}
SafeOperation.register('$UntrustDevice', () => { return new $UntrustDevice()})

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
    const safe = await this.db.getSafe(ab.userId) as Safe
    if (!safe) {
      this.setRes('status', 1)
      await Util.sleep(3000)
      return
    }

    if (safe.hhk !== Crypt.shaS(ab.shk)) {
      this.setRes('status', 2)
      await Util.sleep(3000)
      return
    }

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
