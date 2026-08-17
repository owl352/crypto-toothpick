import { BytesLike } from '../types.js';
/**
 * SipHash-2-4 under a 16-byte key, as Bitcoin and Dash use it (BIP 158 filter
 * matching, BIP 152 short ids).
 *
 * @param key 16-byte key as bytes or hex: `k0` little-endian, then `k1`
 * @param data the message, of any length, as bytes or hex
 * @returns the 8-byte digest: the 64-bit result in little-endian order
 * @throws if the key is not exactly `SIPHASH24_KEY_LENGTH` bytes
 */
export declare function siphash24(key: BytesLike, data: BytesLike): Uint8Array;
/**
 * Same as {@link siphash24}, returning the digest as a hex string.
 */
export declare function siphash24Hex(key: BytesLike, data: BytesLike): string;
/**
 * Same as {@link siphash24}, keyed by the two 64-bit halves and returning the
 * digest as a 64-bit value — the shape BIP 158 filter matching works in, and a
 * drop-in for a `(k0, k1, data) => bigint` hook.
 *
 * @throws if either half does not fit in an unsigned 64-bit integer
 */
export declare function siphash24WithKeys(k0: bigint, k1: bigint, data: BytesLike): bigint;
/**
 * Hashes many messages under one key in a single call.
 *
 * Every crossing of the Node-API boundary costs around 200ns of call setup,
 * which for short messages is more than the hashing itself — hash a few hundred
 * BIP 158 filter items one call at a time and that fixed cost is the whole
 * bill. Batching pays it once: about 76ns per item instead of 262ns.
 *
 * @returns one 64-bit digest per item, in the order the items were given
 */
export declare function siphash24Many(k0: bigint, k1: bigint, items: BytesLike[]): BigUint64Array;
