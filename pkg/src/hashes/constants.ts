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
