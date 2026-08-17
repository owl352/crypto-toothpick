import { hashesProvider } from '../provider.js'
import { BytesLike } from '../types.js'
import { toBytes, toHex } from '../utils.js'

/**
 * SipHash-2-4 under a 16-byte key, as Bitcoin and Dash use it (BIP 158 filter
 * matching, BIP 152 short ids).
 *
 * @param key 16-byte key as bytes or hex: `k0` little-endian, then `k1`
 * @param data the message, of any length, as bytes or hex
 * @returns the 8-byte digest: the 64-bit result in little-endian order
 * @throws if the key is not exactly `SIPHASH24_KEY_LENGTH` bytes
 */
export function siphash24 (key: BytesLike, data: BytesLike): Uint8Array {
  return hashesProvider.hashes.siphash24(toBytes(key), toBytes(data))
}

/**
 * Same as {@link siphash24}, returning the digest as a hex string.
 */
export function siphash24Hex (key: BytesLike, data: BytesLike): string {
  return hashesProvider.hashes.siphash24Hex(toHex(key), toHex(data))
}

/**
 * Same as {@link siphash24}, keyed by the two 64-bit halves and returning the
 * digest as a 64-bit value — the shape BIP 158 filter matching works in, and a
 * drop-in for a `(k0, k1, data) => bigint` hook.
 *
 * @throws if either half does not fit in an unsigned 64-bit integer
 */
export function siphash24WithKeys (k0: bigint, k1: bigint, data: BytesLike): bigint {
  return BigInt(
    hashesProvider.hashes.siphash24WithKeys(k0.toString(), k1.toString(), toBytes(data))
  )
}
