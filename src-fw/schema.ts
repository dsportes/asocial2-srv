import{ Log } from '../src-fw/log'
import { DocDescriptor, FormType, idx, propType } from '../src-fw/docDescriptor'

let exc: Error | null = null

let svc = DocDescriptor.declareService('ADMIN')

try {
  const nd = DocDescriptor.size()
  const nf = FormType.size()

  new DocDescriptor(svc,
    { name: 'Status', sync: true }
  )
  
  new DocDescriptor(svc,
    { name: 'Task', sync: false, pk: ['process', 'target'] },
    null,
    new Map<string, idx>([
      ['startTime',  { type: propType.STRING, global: true }]
    ])
  )
  
  new DocDescriptor(svc,
    { name: 'Subs', pk: ['sessionId'] }
  )
  
  new DocDescriptor(svc,
    { name: 'SubsItem', pk: ['sessionId', 'def'] },
    null,
    new Map<string, idx>([
      ['def',  { type: propType.STRING }]
    ])
  )

  Log.info('FW document descriptors:' + (DocDescriptor.size() - nd) 
    + ' forms descriptors:' + (FormType.size() - nf))

} catch (e: any) {
  exc = e
}

export const schemaExcFW = () : Error | null => {
  if (exc)  Log.error('Schema Exception: ' + exc.toString())
  return exc
}
