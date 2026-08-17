import { HashBindings } from './types.js'

class HashesProvider {
  private static instance?: HashesProvider
  private _hashes: HashBindings | null = null

  private constructor () {}

  static getInstance (): HashesProvider {
    if (HashesProvider.instance == null) {
      HashesProvider.instance = new HashesProvider()
    }
    return HashesProvider.instance
  }

  setHashes (hashes: HashBindings): void {
    this._hashes = hashes
  }

  get hashes (): HashBindings {
    if (this._hashes == null) {
      throw new Error('Hash bindings have not been set. Call setHashes() before using the SDK.')
    }
    return this._hashes
  }
}

export const hashesProvider = HashesProvider.getInstance()
