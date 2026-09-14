import { hashesProvider } from '../provider.js';
import { toUint32Array } from '../utils.js';
/**
 * The nBits every block of a range is expected to carry under DarkGravityWave
 * v3, given the `contextBlocks` entries that precede it.
 *
 * `times` and `nbits` run **oldest first** over one contiguous run of headers
 * and must be the same length. The leading `contextBlocks` entries only seed
 * the averaging window and get no answer of their own, so the result holds
 * `times.length - contextBlocks` values, lining up with the headers from
 * `contextBlocks` onward.
 *
 * ```js
 * // headers[0..23] are the 24 already-validated blocks before the batch
 * const expected = dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS)
 *
 * for (let at = 0; at < expected.length; at++) {
 *   if (nbits[DGW_PAST_BLOCKS + at] !== expected[at]) throw new Error('bad nBits')
 * }
 * ```
 *
 * Batched over the header batch rather than called per block, a whole mainnet
 * sync is ~1150 calls instead of 2.3M — which is what keeps it worth crossing
 * the boundary for on the WebAssembly surface as well as the native one.
 *
 * All of it is u256 integer arithmetic, so both surfaces agree by construction.
 * Two things stay with the caller on purpose: the **era dispatch** (call this
 * only where v3 governs, not KGW or the interval retarget), and the
 * **comparison** against what a header really carries — mainnet at or below
 * height 68589 compares difficulty as a float, which must not cross the
 * boundary.
 *
 * @param times each header's `nTime`, oldest first
 * @param nbits each header's `nBits`, oldest first and the same length
 * @param contextBlocks how many leading entries are already-validated context
 *   rather than blocks to answer for. At least `params.pastBlocks`
 *   (`DGW_PAST_BLOCKS` by default); more is fine and simply starts the answers
 *   later, never changing what any of them is.
 * @param params chain parameters, defaulting to Dash's
 * @returns the expected `nBits`, one per header after the context
 * @throws if the inputs differ in length, or the context is too short to seed
 *   the window, or a header carries an nBits no valid target could encode
 */
export function dgwNextBitsRange(times, nbits, contextBlocks, params = {}) {
    return hashesProvider.hashes.dgwNextBitsRange(toUint32Array(times), toUint32Array(nbits), contextBlocks, params.powLimit, params.targetSpacing, params.pastBlocks);
}
