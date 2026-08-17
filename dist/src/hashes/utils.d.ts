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
