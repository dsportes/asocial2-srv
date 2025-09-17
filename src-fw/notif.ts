import { DocDescr, Operation } from './operation'

export type notif = {
  // TODO
}

export class Notification {

  static async updates ( op: Operation, updList: DocDescr[] ) : Promise<notif[]> {
    const ntf : notif[] = []
    // TODO
    return ntf
  }
}