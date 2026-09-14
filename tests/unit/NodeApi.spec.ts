import * as x11 from 'crypto-toothpick/native'
import {
  x11Hash,
  x11HashHex,
  x11HashMany,
  siphash24Hex,
  cfilterHeaderChain,
  cfilterVerify,
  toBytes,
  toHex
} from 'crypto-toothpick/native'
import { hexToBytes, vectors } from './utils/vectors.js'
import {
  GENESIS_FILTER,
  GENESIS_HEADER,
  ZERO_HEADER,
  chainReference,
  sampleFilterHashes
} from './utils/cfheaderVectors.js'

describe('crypto-toothpick (Node-API)', function () {
  it("module shouldn't be undefined or empty", () => {
    expect(x11).toBeDefined()
  })

  test('should hash via the module object', function () {
    expect(x11.x11HashHex(vectors[0].header)).toEqual(vectors[0].digest)
  })

  test.each(vectors)('should hash header $header to $digest', function ({ header, digest }) {
    expect(x11HashHex(header)).toEqual(digest)
    expect(x11Hash(hexToBytes(header))).toEqual(hexToBytes(digest))
  })

  test('should hash with siphash24', function () {
    expect(siphash24Hex('000102030405060708090a0b0c0d0e0f', '')).toEqual('310e0edd47db6f72')
  })

  test('should reject a header of the wrong length', function () {
    expect(() => x11Hash(new Uint8Array(64))).toThrow(/80 bytes/)
  })

  // WebAssembly.spec.ts runs the same expectation against the other surface, and
  // both are checked against a chain walked with Node's own SHA-256 — so the
  // two surfaces agreeing byte for byte is a test, not a convention.
  test('should chain compact filter headers', function () {
    const prev = toBytes(GENESIS_HEADER)
    const hashes = sampleFilterHashes(64)

    expect(toHex(cfilterHeaderChain(prev, hashes)))
      .toEqual(chainReference(prev, hashes).map(toHex).join(''))
  })

  test('should verify a compact filter against its header', function () {
    expect(cfilterVerify(GENESIS_FILTER, ZERO_HEADER, GENESIS_HEADER)).toEqual(true)
    expect(cfilterVerify('019dfca9', ZERO_HEADER, GENESIS_HEADER)).toEqual(false)
  })

  test('should hash a run of headers in one call', function () {
    const headers = vectors.map(({ header }) => header)
    const many = x11HashMany(headers)

    expect(many.length).toEqual(headers.length * 32)
    expect(toHex(many)).toEqual(vectors.map(({ digest }) => digest).join(''))
  })
})
