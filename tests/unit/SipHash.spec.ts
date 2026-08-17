import {
  siphash24,
  siphash24Hex,
  siphash24WithKeys,
  SIPHASH24_KEY_LENGTH,
  SIPHASH24_OUTPUT_LENGTH,
  toBytes
} from 'crypto-toothpick'
import { SIPHASH_KEY, siphashMessage, siphashVectors } from './utils/siphashVectors'
import { hexToBytes } from './utils/vectors'

describe('siphash24', function () {
  describe('reference vectors', function () {
    test('should hash every message length in the reference table', function () {
      siphashVectors.forEach((digest, length) => {
        expect(siphash24Hex(SIPHASH_KEY, siphashMessage(length))).toEqual(digest)
        expect(siphash24(SIPHASH_KEY, siphashMessage(length))).toEqual(hexToBytes(digest))
      })
    })

    test('should agree between the key-bytes and the key-halves form', function () {
      const key = toBytes(SIPHASH_KEY)
      const view = new DataView(key.buffer, key.byteOffset, key.byteLength)
      const k0 = view.getBigUint64(0, true)
      const k1 = view.getBigUint64(8, true)

      siphashVectors.forEach((digest, length) => {
        const expected = new DataView(hexToBytes(digest).buffer).getBigUint64(0, true)

        expect(siphash24WithKeys(k0, k1, siphashMessage(length))).toEqual(expected)
      })
    })
  })

  describe('input forms', function () {
    test('should accept the key and the data as bytes or hex', function () {
      const digest = siphashVectors[8]

      expect(siphash24Hex(toBytes(SIPHASH_KEY), '0001020304050607')).toEqual(digest)
      expect(siphash24Hex(SIPHASH_KEY, siphashMessage(8))).toEqual(digest)
    })

    test('should accept a Buffer', function () {
      expect(siphash24Hex(Buffer.from(SIPHASH_KEY, 'hex'), Buffer.alloc(0)))
        .toEqual(siphashVectors[0])
    })

    test('should hash data of any length', function () {
      expect(siphash24(SIPHASH_KEY, new Uint8Array(0)).length).toEqual(SIPHASH24_OUTPUT_LENGTH)
      expect(siphash24(SIPHASH_KEY, new Uint8Array(10000)).length).toEqual(SIPHASH24_OUTPUT_LENGTH)
    })
  })

  describe('output', function () {
    test('should return an 8 byte digest', function () {
      const digest = siphash24(SIPHASH_KEY, siphashMessage(4))

      expect(digest).toBeInstanceOf(Uint8Array)
      expect(digest.length).toEqual(SIPHASH24_OUTPUT_LENGTH)
    })

    test('should depend on the key', function () {
      expect(siphash24Hex('00'.repeat(SIPHASH24_KEY_LENGTH), siphashMessage(8)))
        .not.toEqual(siphash24Hex(SIPHASH_KEY, siphashMessage(8)))
    })
  })

  describe('input validation', function () {
    test('should reject a key of the wrong length', function () {
      expect(() => siphash24(new Uint8Array(15), siphashMessage(8))).toThrow(/16 bytes/)
      expect(() => siphash24(new Uint8Array(17), siphashMessage(8))).toThrow(/16 bytes/)
      expect(() => siphash24Hex('00'.repeat(8), '')).toThrow(/16 bytes/)
    })

    test('should reject malformed hex', function () {
      expect(() => siphash24('zz'.repeat(SIPHASH24_KEY_LENGTH), '')).toThrow(/hex/)
      expect(() => siphash24Hex(SIPHASH_KEY, '0')).toThrow(/hex/)
    })

    test('should reject key halves outside the unsigned 64-bit range', function () {
      expect(() => siphash24WithKeys(-1n, 0n, siphashMessage(8))).toThrow(/u64/)
      expect(() => siphash24WithKeys(0n, 1n << 64n, siphashMessage(8))).toThrow(/u64/)
    })

    test('should accept the whole unsigned 64-bit range', function () {
      const max = (1n << 64n) - 1n

      expect(siphash24WithKeys(max, max, siphashMessage(8)))
        .toEqual(siphash24WithKeys(max, max, siphashMessage(8)))
    })
  })

  describe('constants', function () {
    test('should expose the lengths the binding enforces', function () {
      expect(SIPHASH24_KEY_LENGTH).toEqual(16)
      expect(SIPHASH24_OUTPUT_LENGTH).toEqual(8)
    })
  })
})
