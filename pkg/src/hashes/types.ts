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
 * A block header, either as raw bytes or as hex. Always `X11_INPUT_LENGTH`
 * bytes.
 */
export type HeaderLike = BytesLike

/**
 * Golomb-Rice parameters of a compact filter. Both default to the basic
 * (type 0) filter's values from BIP 158, exported as `BASIC_FILTER_P` and
 * `BASIC_FILTER_M`.
 */
export interface FilterParams {
  p?: number
  m?: bigint
}

/**
 * Chain parameters a DarkGravityWave retarget depends on, all defaulting to
 * Dash's.
 *
 * `powLimit` and `targetSpacing` differ between Dash's own networks — mainnet,
 * testnet, devnet, regtest — so a caller on any of them will set them.
 * `pastBlocks` does not: the averaging window is the same everywhere Dash runs,
 * and only a DGW-derived chain that chose a different one should override it.
 */
export interface DgwParams {
  /** Easiest target the chain retargets to, as compact nBits. Default `DGW_POW_LIMIT`. */
  powLimit?: number
  /** Seconds between blocks. Default `DGW_TARGET_SPACING`. */
  targetSpacing?: number
  /** Blocks the target is averaged over. Default `DGW_PAST_BLOCKS`. */
  pastBlocks?: number
}
