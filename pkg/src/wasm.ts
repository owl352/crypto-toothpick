import * as protocol from '../binaries/wasm.js'
import { hashesProvider } from './hashes/provider.js'

hashesProvider.setHashes(protocol)

export * from './hashes/hashes.js'

export * from './hashes/types.js'
