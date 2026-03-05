import { Document } from '../src-fw/document'
import { Task, Subs, SubsItem, Credential } from '../src-fw/documents'

class Hdr extends Document {
  static release = 0
  static mutateCl (data: object, options?: Object) : [Object, boolean] {
    return [data, false]
  }

}

class Org extends Document {
  static release = 0

  static mutateCl (data: object, options?: Object) : [Object, boolean] {
    return [data, false]
  }

  compile () { return this }

}

export const documentClasses = {
  Task: Task, 
  Subs: Subs, 
  SubsItem: SubsItem,
  Hdr: Hdr,
  Org: Org,
  Credential: Credential
}
