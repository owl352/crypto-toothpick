import { x11Hash, x11HashHex, X11_INPUT_LENGTH, X11_OUTPUT_LENGTH, toBytes, toHex } from 'crypto-toothpick'
import { hexToBytes, vectors } from './utils/vectors.js'

describe('x11Hash', function () {
  describe('known vectors', function () {
    test.each(vectors)('should hash header $header to $digest', function ({ header, digest }) {
      expect(x11HashHex(header)).toEqual(digest)
      expect(x11Hash(hexToBytes(header))).toEqual(hexToBytes(digest))
    })
  })

  describe('input forms', function () {
    test('should accept bytes and hex interchangeably', function () {
      const { header, digest } = vectors[0]

      expect(x11HashHex(hexToBytes(header))).toEqual(digest)
      expect(x11Hash(header)).toEqual(hexToBytes(digest))
    })

    test('should accept a Buffer', function () {
      const { header, digest } = vectors[0]

      expect(x11HashHex(Buffer.from(header, 'hex'))).toEqual(digest)
    })

    test('should be case insensitive for hex input', function () {
      const { header, digest } = vectors[0]

      expect(x11HashHex(header.toUpperCase())).toEqual(digest)
    })
  })

  describe('output', function () {
    test('should return a 32 byte digest', function () {
      const digest = x11Hash(vectors[0].header)

      expect(digest).toBeInstanceOf(Uint8Array)
      expect(digest.length).toEqual(X11_OUTPUT_LENGTH)
      expect(x11HashHex(vectors[0].header).length).toEqual(X11_OUTPUT_LENGTH * 2)
    })

    test('should be deterministic', function () {
      expect(x11Hash(vectors[0].header)).toEqual(x11Hash(vectors[0].header))
    })

    test('should give different digests for different headers', function () {
      expect(x11HashHex(vectors[1].header)).not.toEqual(x11HashHex(vectors[2].header))
    })
  })

  describe('input validation', function () {
    // The C implementation reads a fixed 80 bytes from the pointer it is
    // given, so anything else must be rejected before it gets there.
    test('should reject a short header', function () {
      expect(() => x11Hash(new Uint8Array(X11_INPUT_LENGTH - 1))).toThrow(/80 bytes/)
      expect(() => x11HashHex('00'.repeat(X11_INPUT_LENGTH - 1))).toThrow(/80 bytes/)
    })

    test('should reject a long header', function () {
      expect(() => x11Hash(new Uint8Array(X11_INPUT_LENGTH + 1))).toThrow(/80 bytes/)
      expect(() => x11HashHex('00'.repeat(X11_INPUT_LENGTH + 1))).toThrow(/80 bytes/)
    })

    test('should reject an empty header', function () {
      expect(() => x11Hash(new Uint8Array(0))).toThrow(/80 bytes/)
    })

    test('should accept an all-zero header of the right length', function () {
      expect(x11Hash(new Uint8Array(X11_INPUT_LENGTH)).length).toEqual(X11_OUTPUT_LENGTH)
    })

    test('should reject malformed hex', function () {
      expect(() => x11Hash('zz'.repeat(X11_INPUT_LENGTH))).toThrow(/hex/)
      expect(() => x11Hash('0'.repeat(X11_INPUT_LENGTH * 2 - 1))).toThrow(/hex/)
      expect(() => x11HashHex('zz'.repeat(X11_INPUT_LENGTH))).toThrow()
    })

    test('should reject a header that is neither bytes nor hex', function () {
      // @ts-expect-error deliberately wrong type
      expect(() => x11Hash(42)).toThrow(TypeError)
      // @ts-expect-error deliberately wrong type
      expect(() => x11HashHex(null)).toThrow(TypeError)
    })
  })

  describe('constants', function () {
    test('should expose the lengths the binding enforces', function () {
      expect(X11_INPUT_LENGTH).toEqual(80)
      expect(X11_OUTPUT_LENGTH).toEqual(32)
    })
  })

  describe('conversion helpers', function () {
    test('should round trip bytes and hex', function () {
      const { header } = vectors[0]

      expect(toHex(toBytes(header))).toEqual(header)
      expect(toBytes(toHex(hexToBytes(header)))).toEqual(hexToBytes(header))
    })
  })
})
