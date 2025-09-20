import { ImpactedSub, Operation } from './operation'

export type notif = {
  // TODO
}

export class Notification {

  static async updates ( op: Operation ) : Promise<notif[]> {
    const allIs : Map<string, ImpactedSub> = op.impactedSubs.all
    const ntf : notif[] = []
    // TODO
    return ntf
  }
}