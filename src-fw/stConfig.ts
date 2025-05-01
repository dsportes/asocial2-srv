import { AppExc } from './exception'
import { getOptions } from './stProvider'
import { fsConnexion } from './storageFS'

export async function stConnexion (code: string, site: string) {
  const options = getOptions(code, site)
  if (code.startsWith('fs'))
    return new fsConnexion(options)
  throw new AppExc(8003, 'storage code not implemented', null, [code])
}
