import { BytesLike } from './types.js';
/**
 * Accepts a byte string as bytes or as hex, and returns it as bytes. Length is
 * not checked here — the binding is the single source of truth for that.
 */
export declare function toBytes(value: BytesLike): Uint8Array;
/**
 * Accepts a byte string as bytes or as hex, and returns it as a hex string.
 */
export declare function toHex(value: BytesLike): string;
/**
 * Joins byte strings into one contiguous buffer. The bindings that batch take
 * a single `Uint8Array` rather than an array of them, so this is what a caller
 * holding a list of 32-byte hashes hands them.
 */
export declare function concatBytes(values: BytesLike[]): Uint8Array;
/**
 * Accepts 32-bit values as a typed array or a plain array, and returns them as
 * a `Uint32Array`. Bindings that take a range of header fields want one
 * contiguous block rather than a JS array of numbers.
 */
export declare function toUint32Array(values: Uint32Array | number[]): Uint32Array;
