import type { FilterMatcherNAPI } from '../../../binaries/bindingsTypes.js';
import { BytesLike, FilterParams } from '../types.js';
/**
 * A wallet's watched items, held on the Rust side for the length of a sync.
 *
 * The set does not change from block to block, but the filter key does, so
 * every block re-hashes it. What a block does not have to redo is carrying the
 * items across the boundary — for a wallet watching a thousand scripts that
 * copy is most of the per-block cost, and this pays it once.
 *
 * ```js
 * const matcher = new FilterMatcher(watchedScripts)
 * for (const { filter, blockHash } of filters) {
 *   if (matcher.matchBlock(filter, blockHash)) await downloadBlock(blockHash)
 * }
 * ```
 */
export declare class FilterMatcher {
    /** @private **/
    _rawMatcher: FilterMatcherNAPI;
    /**
     * @param items the watched scripts or outpoints, as bytes or hex
     * @param params Golomb-Rice parameters, defaulting to the basic filter's
     */
    constructor(items: BytesLike[], params?: FilterParams);
    /** How many items are being watched. */
    get size(): number;
    /**
     * Does this block's filter contain any watched item?
     *
     * @param filter the `cfilter` payload
     * @param blockHash the 32-byte hash in internal (wire) byte order
     */
    matchBlock(filter: BytesLike, blockHash: BytesLike): boolean;
    /**
     * Does each of these blocks' filters contain any watched item?
     *
     * One call for a whole run: the filters are joined end to end and their
     * offsets derived here, so the run crosses the boundary once instead of once
     * per block. The watched items are hashed per block either way — the filter
     * key changes with every block — so what this saves is the crossing, plus
     * the per-call copy of the watched set that {@link matchBlock} repeats.
     *
     * ```js
     * const hits = matcher.matchBlockMany(filters, blockHashes)
     *
     * for (let at = 0; at < hits.length; at++) {
     *   if (hits[at] !== 0) await downloadBlock(blockHashes[at])
     * }
     * ```
     *
     * Filters arrive one per network message, so using this means buffering a
     * run first, which delays when any single match becomes known. Reach for it
     * where the run is already in hand — a backfill, a rescan — and stay on
     * {@link matchBlock} when you are following the tip.
     *
     * @param filters each block's `cfilter` payload, in block order
     * @param blockHashes the 32-byte hashes in internal (wire) order, same order
     *   and same count as `filters`
     * @returns one byte per block, 1 where the filter matched
     * @throws if the two lists differ in length
     */
    matchBlockMany(filters: BytesLike[], blockHashes: BytesLike | BytesLike[]): Uint8Array;
    /**
     * Same, keyed directly by the two 64-bit halves.
     */
    matchBlockWithKeys(filter: BytesLike, k0: bigint, k1: bigint): boolean;
    static createFromRawInstance(rawInstance: FilterMatcherNAPI): FilterMatcher;
    getRawInstance(): FilterMatcherNAPI;
}
