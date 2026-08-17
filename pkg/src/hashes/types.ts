import type * as bindings from '../../binaries/bindingsTypes.js'

/**
 * The raw binding surface, as generated from the Rust crate. One of the three
 * entry points (`wasm`, `native`, `react-native`) hands an implementation of
 * this to the provider at import time.
 */
export type HashBindings = typeof bindings

/**
 * A byte string, either as raw bytes or as hex.
 */
export type BytesLike = Uint8Array | string

/**
 * An 80-byte block header, either as raw bytes or as hex.
 */
export type HeaderLike = BytesLike

/**
 * Golomb-Rice parameters of a compact filter. Both default to the basic
 * (type 0) filter's values from BIP 158: `p` 19, `m` 784931.
 */
export interface FilterParams {
  p?: number
  m?: bigint
}
