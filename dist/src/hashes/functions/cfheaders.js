import { hashesProvider } from '../provider.js';
import { concatBytes, toBytes } from '../utils.js';
/**
 * Walks a run of compact filter hashes into the filter headers they chain to
 * (BIP 157), starting from `prev`.
 *
 * Every header is `sha256d(filterHash || previousHeader)`, so each one is the
 * input to the next and the walk cannot be split into independent pieces the
 * way a batch of hashes can. Doing it here costs one crossing per chunk of
 * blocks instead of one per block, which is where a `getcfheaders` reply of a
 * thousand hashes otherwise spends most of its time.
 *
 * The headers come back as one flat buffer, `CFILTER_HEADER_LENGTH` bytes each,
 * in the order the hashes were given:
 *
 * ```js
 * const headers = cfilterHeaderChain(prevHeader, filterHashes)
 * const last = headers.subarray(headers.length - CFILTER_HEADER_LENGTH)
 * ```
 *
 * @param prev the filter header of the block before the first hash, in
 *   internal (wire) byte order — not the reversed form explorers display
 * @param filterHashes the filter hashes, either already joined into one buffer
 *   or as a list this joins for you
 * @returns the chained headers, `CFILTER_HEADER_LENGTH` bytes each
 * @throws if `prev` is not `CFILTER_HEADER_LENGTH` bytes, or the hashes are not
 *   a whole number of them
 */
export function cfilterHeaderChain(prev, filterHashes) {
    return hashesProvider.hashes.cfilterHeaderChain(toBytes(prev), Array.isArray(filterHashes) ? concatBytes(filterHashes) : toBytes(filterHashes));
}
/**
 * Does this filter hash and chain onto `prev` to give `expected`?
 *
 * Both digests and the comparison happen inside the one call a filter already
 * costs at the boundary, so checking a `cfilter` against the header chain is
 * free beyond the hashing itself.
 *
 * This one is called per filter rather than per chunk, so it pays the boundary
 * every block: worth about 1.4x over `node:crypto` on the native path, and a
 * large loss on the WebAssembly one, where a crossing costs ~7.8 µs per byte
 * argument. Code that may be running on the wasm fallback should check a chunk
 * with {@link cfilterHeaderChain} instead of calling this per block.
 *
 * @param filter the `cfilter` payload, exactly as it arrived on the wire
 * @param prev the previous block's filter header, in internal byte order
 * @param expected the filter header this block should produce
 */
export function cfilterVerify(filter, prev, expected) {
    return hashesProvider.hashes.cfilterVerify(toBytes(filter), toBytes(prev), toBytes(expected));
}
