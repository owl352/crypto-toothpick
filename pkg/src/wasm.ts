import * as protocol from '../binaries/wasm.js'
import { hashesProvider } from './hashes/provider.js'

hashesProvider.setHashes(protocol)

export * from './hashes/hashes.js'

export * from './hashes/types.js'

// The constants come straight off the binding, so the values compiled into the
// Rust crate are the only ones that exist. They cannot be re-exported from
// `hashes.ts`: that module is a dependency of this one, so it is evaluated
// before the `setHashes` call above and the provider would still be empty.
export const {
  X11_INPUT_LENGTH,
  X11_OUTPUT_LENGTH,
  SIPHASH24_KEY_LENGTH,
  SIPHASH24_OUTPUT_LENGTH,
  BASIC_FILTER_P,
  CFILTER_HEADER_LENGTH,
  DGW_PAST_BLOCKS,
  DGW_TARGET_SPACING,
  DGW_POW_LIMIT
} = protocol

/** Range multiplier of the basic (type 0) compact filter, from BIP 158. */
export const BASIC_FILTER_M = BigInt(protocol.BASIC_FILTER_M)
