import { hashesProvider } from '../provider.js'
import { HeaderLike } from '../types.js'
import { toBytes, toHex } from '../utils.js'

/**
 * Hashes an 80-byte block header with the X11 chain (Blake, BMW, Groestl,
 * Skein, JH, Keccak, Luffa, CubeHash, SHAvite-3, SIMD, ECHO).
 *
 * @param header block header as bytes or as a hex string
 * @returns the 32-byte digest, in internal (not display) byte order
 * @throws if the header is not exactly `X11_INPUT_LENGTH` bytes
 */
export function x11Hash (header: HeaderLike): Uint8Array {
  return hashesProvider.hashes.x11Hash(toBytes(header))
}

/**
 * Same as {@link x11Hash}, returning the digest as a hex string.
 *
 * @param header block header as bytes or as a hex string
 * @returns the digest as 64 hex characters, in internal (not display) byte order
 * @throws if the header is not exactly `X11_INPUT_LENGTH` bytes
 */
export function x11HashHex (header: HeaderLike): string {
  return hashesProvider.hashes.x11HashHex(toHex(header))
}
