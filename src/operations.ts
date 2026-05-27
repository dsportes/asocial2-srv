// import { Operation } from '../src-fw/operation'
import { Registry } from '../src-fw/config'

export function loadingOA () {
  console.log('app operations loading: ', Registry.sizeOp())
}
