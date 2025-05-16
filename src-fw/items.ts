export interface itemc {
  id: string,
  value: string,
  nbl: number
}

export class Item {
  id: string
  value: string
  listeners: Set<string>

  constructor (id: string, value: string, token: string) {
    this.id = id; this.value = value; this.listeners = new Set([token])
  }

  static map = new Map<string, Item>()

  static getAll (token: string) {
    let l: itemc[] = []
    Item.map.forEach((x: Item) => {
      if (x.listeners.has(token)) 
        l.push({ id: x.id, value: x.value, nbl: x.listeners.size})
    })
    return l
  }

  // set item et écoute - si value est vide, conserve la valeur qui existait
  static setAndListen (id: string, value: string, token: string) {
    let x = Item.map.get(id)
    if (x) {
      // update Item
      if (value) x.value = value
      x.listeners.add(token)
      this.map.set(id, x)
      // publish
      for(const tk of x.listeners) x.publishSet(tk)
    } else {
      // new Item
      x = new Item(id, value, token)
      this.map.set(id, x)
      x.publishSet(token)
    }
  }

  static deleteItem (id: string) {
    let x = Item.map.get(id)
    if (x) for(const tk of x.listeners) x.publishDel(tk)
  }

  static stopListen (id: string, token: string) {
    let x = Item.map.get(id)
    if (x) {
      if (!x.listeners.has(token)) return
      if (x.listeners.size <= 1) Item.map.delete(x.id)
      else {
        x.listeners.delete(token)
        for(const tk of x.listeners) x.publishSet(tk)
      }
    }
  }

  publishDel (token: string) {
    // TODO
  }

  publishSet (token: string) {
    // TODO
  }

}