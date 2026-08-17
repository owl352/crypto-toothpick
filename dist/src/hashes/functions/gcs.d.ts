import { BytesLike, FilterParams } from '../types.js';
/**
 * Does this block's compact filter contain any of these items?
 *
 * One call answers the whole per-block question a wallet asks while syncing:
 * the Golomb-Rice set is decoded, every item is hashed under the filter key and
 * mapped into the filter's range, and the two sorted streams are merged —
 * without crossing back into JS.
 *
 * Syncing a range of blocks against a fixed set of watched items? Build a
 * {@link FilterMatcher} instead, so the items are carried across the boundary
 * once rather than once per block.
 *
 * @param filter the `cfilter` payload: varint count, then the coded set
 * @param blockHash the 32-byte hash in internal (wire) byte order — not the
 *   reversed form block explorers display
 * @param items the watched scripts or outpoints
 * @param params Golomb-Rice parameters, defaulting to the basic filter's
 */
export declare function gcsMatchAny(filter: BytesLike, blockHash: BytesLike, items: BytesLike[], params?: FilterParams): boolean;
/**
 * Same as {@link gcsMatchAny}, keyed directly by the two 64-bit halves rather
 * than by the block hash they are derived from.
 */
export declare function gcsMatchAnyWithKeys(filter: BytesLike, k0: bigint, k1: bigint, items: BytesLike[], params?: FilterParams): boolean;
