import { hashesProvider } from '../provider.js';
import { toBytes } from '../utils.js';
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
export class FilterMatcher {
    /** @private **/
    _rawMatcher;
    /**
     * @param items the watched scripts or outpoints, as bytes or hex
     * @param params Golomb-Rice parameters, defaulting to the basic filter's
     */
    constructor(items, params = {}) {
        this._rawMatcher = new hashesProvider.hashes.FilterMatcherNAPI(items.map(toBytes), params.p, params.m?.toString());
    }
    /** How many items are being watched. */
    get size() {
        return this._rawMatcher.size;
    }
    /**
     * Does this block's filter contain any watched item?
     *
     * @param filter the `cfilter` payload
     * @param blockHash the 32-byte hash in internal (wire) byte order
     */
    matchBlock(filter, blockHash) {
        return this._rawMatcher.matchBlock(toBytes(filter), toBytes(blockHash));
    }
    /**
     * Same, keyed directly by the two 64-bit halves.
     */
    matchBlockWithKeys(filter, k0, k1) {
        return this._rawMatcher.matchBlockWithKeys(toBytes(filter), k0.toString(), k1.toString());
    }
    static createFromRawInstance(rawInstance) {
        const instance = Object.create(FilterMatcher.prototype);
        instance._rawMatcher = rawInstance;
        return instance;
    }
    getRawInstance() {
        return this._rawMatcher;
    }
}
