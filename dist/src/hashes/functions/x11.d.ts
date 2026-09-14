import { HeaderLike } from '../types.js';
/**
 * Hashes an 80-byte block header with the X11 chain (Blake, BMW, Groestl,
 * Skein, JH, Keccak, Luffa, CubeHash, SHAvite-3, SIMD, ECHO).
 *
 * @param header block header as bytes or as a hex string
 * @returns the 32-byte digest, in internal (not display) byte order
 * @throws if the header is not exactly `X11_INPUT_LENGTH` bytes
 */
export declare function x11Hash(header: HeaderLike): Uint8Array;
/**
 * Same as {@link x11Hash}, returning the digest as a hex string.
 *
 * @param header block header as bytes or as a hex string
 * @returns the digest as 64 hex characters, in internal (not display) byte order
 * @throws if the header is not exactly `X11_INPUT_LENGTH` bytes
 */
export declare function x11HashHex(header: HeaderLike): string;
/**
 * Hashes a run of block headers in a single call, returning the digests as one
 * flat buffer, `X11_OUTPUT_LENGTH` bytes each, in the order the headers came in.
 *
 * Headers arrive from the network in batches of up to 2000, and hashing them
 * one at a time pays a crossing per header, in and out. Measured over 2000
 * headers that crossing is 0.69 µs of the 6.03 µs a native call costs, and
 * 14.4 µs of the 22.2 µs it costs through WebAssembly — so batching is worth
 * 1.13x on the native path and 2.8x on the wasm fallback.
 *
 * ```js
 * const digests = x11HashMany(headers)
 *
 * for (let at = 0; at < digests.length; at += X11_OUTPUT_LENGTH) {
 *   const digest = digests.subarray(at, at + X11_OUTPUT_LENGTH)
 * }
 * ```
 *
 * @param headers the 80-byte headers, either already joined into one buffer or
 *   as a list this joins for you
 * @returns the digests, `X11_OUTPUT_LENGTH` bytes each, in internal byte order
 * @throws if the run is not a whole number of `X11_INPUT_LENGTH`-byte headers
 */
export declare function x11HashMany(headers: HeaderLike | HeaderLike[]): Uint8Array;
