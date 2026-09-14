/**
 * Bytes of input the X11 chain consumes: a Dash block header.
 *
 * The C implementation reads exactly this many bytes from the pointer it is
 * given, so anything shorter or longer is rejected before it gets there.
 */
export const X11_INPUT_LENGTH = 80

/**
 * Bytes of digest the X11 chain produces.
 */
export const X11_OUTPUT_LENGTH = 32

/**
 * Bytes of key SipHash-2-4 takes: two 64-bit halves, little-endian — `k0`
 * first, then `k1`.
 */
export const SIPHASH24_KEY_LENGTH = 16

/**
 * Bytes of digest SipHash-2-4 produces.
 */
export const SIPHASH24_OUTPUT_LENGTH = 8

/**
 * Golomb-Rice parameter of the basic (type 0) compact filter, from BIP 158.
 */
export const BASIC_FILTER_P = 19

/**
 * Range multiplier of the basic (type 0) compact filter, from BIP 158.
 */
export const BASIC_FILTER_M = 784931n

/**
 * Bytes in a compact filter hash, and in a compact filter header. Both are a
 * double-SHA-256 digest, so both are 32.
 */
export const CFILTER_HEADER_LENGTH = 32
