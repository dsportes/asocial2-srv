import { AppExc, AbstractOperation } from './index'
import { config, Registry } from './config'
import { Crypt } from './crypt'
import { keyFromB64, keyToB64 } from './b64'
import { Util } from './util'
import { Safe, Alias } from './iDbGeneric'
import { encode, decode } from '@msgpack/msgpack'

export function loadingOS () {
  console.log('safe operations loading: ', Registry.sizeOp())
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

  static async doOp (opName: string, args: Object) : Promise<Object> {
    const op = Registry.newOp(opName)
    if (!op) throw new AppExc(103, 'SafeOperation_unknown_operation', null, [opName])
    op.opName = opName
    op.now = Date.now()
    op.args = args
    op.result = {}
    try {
      await config.safeDB.getConnexion(op, '')
      await op.doTheJob()
      await op.db.disconnect()
      return op.result
    } catch (e: any) {
      await op.db.disconnect()
      throw(e)
    }
  }

  async save (safe: any, updated?: boolean) {
    let u = updated || false
    const d = new Date()
    const q = Util.quarter(d)
    if (safe.auth.llq < q) {
      safe.auth.llq = q
      u = true
    }
    if (u) {
      safe.auth.lm = d.getTime()
      await this.db.updSafe(safe)
    }
    this.setRes('safe', safe)
  }

  async getSafe (arg: Object): Promise<Safe> {
    const bin = await this.db.getBinSafe(arg['userId'])
    if (!bin) { 
      this.setRes('status', 1)
      return null
    }
    const safe = decode(bin) as Safe
    if (!arg['shK'] || safe.auth.hshK !== Crypt.shaS(keyFromB64(arg['shK']))) { 
      this.setRes('status', 2)
      return null
    }
    this.setRes('status', 0)
    this.setRes('safe', safe)
    return safe
  }

  async doTheJob () : Promise<void> {  }
}

/* Creation d'un nouveau Safe.
Pas de status (toujours 0)
*/
class $CreateSafe extends SafeOperation {
  async doTheJob () : Promise<void> { 
    const safe = this.args['safe'] as Safe
    await this.db.newSafe(safe)
    this.setRes('status', 0)
  }
}
Registry.registerOp($CreateSafe)

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
      return
    } 
    const safe = decode(bin) as Safe
    let ok = false
    if (this.args['shK']) {
      if (Crypt.shaS(keyFromB64(this.args['shK'])) === safe.auth.hshK) ok = true
      else return this.setRes('status', 2)
    }
    if (!ok && this.args['shp']) {
      const hshp = Crypt.shaS(keyFromB64(this.args['shp']))
      if (hshp === safe.auth.hshp1 || hshp == safe.auth.hshp2) ok = true
    }
    if (!ok) return this.setRes('status', 3)
    this.setRes('status', 0)
    await this.save(safe)
  }
}
Registry.registerOp($GetSafe)

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
    const nosafe = this.args['nosafe'] as boolean
    const safe = await this.getSafe(this.args)
    if (!safe) return
    safe.auth.actual = actual
    safe.auth.future = future || null
    await this.save(safe, true)
    if (nosafe) this.delRes('safe')
  }
}
Registry.registerOp($SetAliasSafe)

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
      throw new AppExc(103, 'missing_p1_and_p2', this)
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
    await this.save(safe, u)
    this.setRes('status', 0)
  }
}
Registry.registerOp($SetPhraseSafe)

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

    const bin = await this.db.getBinSafe(userId)
    if (!bin) {
      this.setRes('status', 1)
      return
    }
    const safe = decode(bin) as Safe
    const dev = safe.devices ? safe.devices[devId] as Device : null
    if (!dev) {
      this.setRes('status', 4)
      return
    }
    // vérifie par `Va` que `sign` est bien la signature de pincx 
    const V = keyFromB64(dev.Va)
    // Rétablit la signature en EC - ce que ne fait pas la version PHP
    const s1 = keyFromB64(dev.sign)
    const sign = Crypt.signFromAsn1(s1)
    const ok = await Crypt.verify(V, sign, keyFromB64(pincx))
    
    if (!ok) {
      dev.nbe++
      if (dev.nbe > 2) {
        delete safe.devices[devId]
        this.setRes('status', 5)
      } else this.setRes('status', 6)
      if (Object.keys(safe.devices).length === 0)
        delete safe.devices
      await this.save(safe, true)
      return
    }

    if (dev.nbe) {
      dev.nbe = 0
      await this.save(safe, true)
    }
    this.setRes('status', 0)
    this.setRes('cy', dev.cy)
  }
}
Registry.registerOp($OpenSafeByPin)

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
    await this.save(safe, u)
    this.setRes('status', 0)
  }
}
Registry.registerOp($SetAdmins)

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
    await this.save(safe, true)
    this.setRes('status', 0)
  }
}
Registry.registerOp($TrustDevice)

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
      for (const id of td.devIds) 
        if (safe.devices[id]) { delete safe.devices[id]; u = true }
      if (Object.keys(safe.devices).length === 0) delete safe.devices
    }
    await this.save(safe, true)
    this.setRes('status', 0)
  }
}
Registry.registerOp($UntrustDevices)

/* Creds ***************************************************************/
type SetCred = {
  userId: string
  shK: string 
  credId: string // id du credential
  nameK: string // name (correspondant à docId) crypté par K et en base 64
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
    const x = [sc.nameK, sc.cred]
    safe.creds[sc.credId] = x

    await this.save(safe, true)
    this.setRes('status', 0)
  }
}
Registry.registerOp($CreateCred)

/* Maj du commentaire d'un credential
Status: 1 2
*/
class $UpdateCredName extends SafeOperation {
  async doTheJob () : Promise<void> {
    const sc = this.args['setCred'] as SetCred
    const safe = await this.getSafe(sc)
    if (!safe) return
    let u = false
    if (safe.creds) {
      const x = safe.creds[sc.credId]
      if (x) {
        x[0] = sc.nameK
        safe.creds[sc.credId] = x
        u = true
      }
    }
    await this.save(safe, u)
    this.setRes('status', 0)
  }
}
Registry.registerOp($UpdateCredName)

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
    await this.save(safe, u)
    this.setRes('status', 0)
  }
}
Registry.registerOp($AutoRevokeCreds)

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
    await this.save(safe, u)
    this.setRes('status', 0)
  }
}
Registry.registerOp($UpdateProfiles)

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
      const prf = decode(keyFromB64(safe.profiles[ab.app][ab.profId]))
      prf['about'] = ab.about
      safe.profiles[ab.app][ab.profId] = keyToB64(Buffer.from(encode(prf)))
      u = true
    }
    await this.save(safe, u)
    this.setRes('status', 0)
  }
}
Registry.registerOp($SetAboutProfile)

/* Prefs ***************************************************************/
type UpdatePrefs = {
  userId: string
  shK: string
  app: string   
  prefs: Object // clé: crId, valeur: Objet Credential sérialisé crypté
  delprefs: string[] // liste des crIds à supprimer
}
/* Enregistrement / suppression de préférences
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

    await this.save(safe, u)
    this.setRes('status', 0)
  }
}
Registry.registerOp($UpdatePrefs)

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
Registry.registerOp($DelSafe)

/* Ping */
class $Ping extends SafeOperation {
  async doTheJob () : Promise<void> {
    this.setRes('ping', true)
  }
}
Registry.registerOp($Ping)
