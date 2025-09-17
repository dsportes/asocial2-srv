import { Document, DocData } from '../src-fw/document'

class Hdr extends Document {
  static release = 1
  static mutateCl (data: object, options?: Object) : [Object, boolean] {
    return [data, false]
  }

}

class Org extends Document {
  static release = 1

  static mutateCl (data: object, options?: Object) : [Object, boolean] {
    return [data, false]
  }

  compile () { return this }

}

class Task extends Document {
  static release = 1

}

export const documentClasses = {
  Hdr: Hdr,
  Org: Org,
  Task: Task
}
