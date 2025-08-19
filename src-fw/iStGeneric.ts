/* Interface d'accès générique au Storage */

export interface IStGeneric {
  decode3 (b64: string) : any

  ping () : Promise<[number, string]> 
  getUrl (id1: string, id2: string, id3: string): string
  putUrl (id1: string, id2: string, id3: string): string
  getFile (id1: string, id2: string, id3:string) : Promise<Buffer>
  putFile (id1: string, id2: string, id3:string, data: Buffer) : Promise<void>
  delFiles (id1: string, id2: string, lidf: string[]) : Promise<void>
  delId (id1: string, id2: string) : Promise<void>
  delOrg (id1: string) : Promise<void>
  listFiles (id1: string, id2: string) : Promise<string[]>
  listIds (id1: string) : Promise<string[]>
}
