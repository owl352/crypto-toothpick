import {
  x11Hash,
  x11HashHex,
  x11HashMany,
  X11_INPUT_LENGTH,
  X11_OUTPUT_LENGTH,
  toBytes,
  toHex
} from 'crypto-toothpick'
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

  describe('x11HashMany', function () {
    const headers = vectors.map(({ header }) => header)
    const digests = vectors.map(({ digest }) => digest)

    function digestsOf (many: Uint8Array): string[] {
      const out: string[] = []

      for (let at = 0; at < many.length; at += X11_OUTPUT_LENGTH) {
        out.push(toHex(many.subarray(at, at + X11_OUTPUT_LENGTH)))
      }

      return out
    }

    test('should hash a run of known headers', function () {
      expect(digestsOf(x11HashMany(headers))).toEqual(digests)
    })

    test('should agree with the headers hashed one at a time', function () {
      expect(digestsOf(x11HashMany(headers))).toEqual(headers.map(x11HashHex))
    })

    test('should return one digest per header', function () {
      expect(x11HashMany(headers).length).toEqual(headers.length * X11_OUTPUT_LENGTH)
    })

    test('should accept the headers already joined into one buffer', function () {
      const joined = new Uint8Array(headers.length * X11_INPUT_LENGTH)

      headers.forEach((header, at) => joined.set(toBytes(header), at * X11_INPUT_LENGTH))

      expect(toHex(x11HashMany(joined))).toEqual(toHex(x11HashMany(headers)))
    })

    test('should accept bytes as readily as hex', function () {
      expect(toHex(x11HashMany(headers.map(toBytes)))).toEqual(digests.join(''))
    })

    test('should hash a single header the same as x11Hash', function () {
      expect(toHex(x11HashMany([headers[0]]))).toEqual(digests[0])
    })

    test('should hash nothing into nothing', function () {
      expect(x11HashMany([]).length).toEqual(0)
      expect(x11HashMany('').length).toEqual(0)
    })

    test('should hand back a buffer that owns its bytes', function () {
      const many = x11HashMany(headers)

      expect(many.byteOffset).toEqual(0)
      expect(many.buffer.byteLength).toEqual(many.length)
    })

    // The C implementation reads a fixed 80 bytes per header, so a run with a
    // trailing remainder has to be rejected before it gets there.
    test('should reject a run that is not whole headers', function () {
      expect(() => x11HashMany('00'.repeat(X11_INPUT_LENGTH + 1)))
        .toThrow(/whole number of 80-byte entries/)
      expect(() => x11HashMany('00'.repeat(X11_INPUT_LENGTH * 2 - 1)))
        .toThrow(/whole number of 80-byte entries/)
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
