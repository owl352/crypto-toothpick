import * as x11 from 'crypto-toothpick/native'
import { x11Hash, x11HashHex, siphash24Hex } from 'crypto-toothpick/native'
import { hexToBytes, vectors } from './utils/vectors'

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
})
