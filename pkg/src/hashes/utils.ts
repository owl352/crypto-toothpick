import { BytesLike } from './types.js'

const HEX = /^[0-9a-fA-F]*$/

/**
 * Accepts a byte string as bytes or as hex, and returns it as bytes. Length is
 * not checked here — the binding is the single source of truth for that.
 */
export function toBytes (value: BytesLike): Uint8Array {
  if (value instanceof Uint8Array) {
    return value
  }

  if (typeof value !== 'string') {
    throw new TypeError('value must be a Uint8Array or a hex string')
  }

  if (value.length % 2 !== 0 || !HEX.test(value)) {
    throw new TypeError('value string must be valid hex')
  }

  const bytes = new Uint8Array(value.length / 2)

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(value.substring(i * 2, i * 2 + 2), 16)
  }

  return bytes
}

/**
 * Accepts a byte string as bytes or as hex, and returns it as a hex string.
 */
export function toHex (value: BytesLike): string {
  if (typeof value === 'string') {
    return value
  }

  if (!(value instanceof Uint8Array)) {
    throw new TypeError('value must be a Uint8Array or a hex string')
  }

  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Joins byte strings into one contiguous buffer. The bindings that batch take
 * a single `Uint8Array` rather than an array of them, so this is what a caller
 * holding a list of 32-byte hashes hands them.
 */
export function concatBytes (values: BytesLike[]): Uint8Array {
  const parts = values.map(toBytes)
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))

  let offset = 0

  for (const part of parts) {
    joined.set(part, offset)
    offset += part.length
  }

  return joined
}

/**
 * Accepts 32-bit values as a typed array or a plain array, and returns them as
 * a `Uint32Array`. Bindings that take a range of header fields want one
 * contiguous block rather than a JS array of numbers.
 */
export function toUint32Array (values: Uint32Array | number[]): Uint32Array {
  if (values instanceof Uint32Array) {
    return values
  }

  if (!Array.isArray(values)) {
    throw new TypeError('value must be a Uint32Array or an array of numbers')
  }

  return Uint32Array.from(values)
}
