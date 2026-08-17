import * as x11 from 'crypto-toothpick/wasm'
import { x11Hash, x11HashHex, siphash24, siphash24Hex } from 'crypto-toothpick/wasm'
import { hexToBytes, vectors } from './utils/vectors.js'
import { SIPHASH_KEY } from './utils/siphashVectors.js'

describe('crypto-toothpick (WebAssembly)', function () {
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

  // A large input makes the Rust allocator grow the wasm memory, which
  // replaces the buffer under every JS-side view of it. Runtimes that do not
  // rebuild those views fail here with "detached ArrayBuffer".
  test('should hash data large enough to grow the wasm memory', function () {
    expect(Buffer.from(siphash24(SIPHASH_KEY, new Uint8Array(100000))).toString('hex'))
      .toEqual('16602972ea46fc10')

    expect(siphash24(SIPHASH_KEY, new Uint8Array(1024 * 1024)).length).toEqual(8)
  })

  test('should reject a header of the wrong length', function () {
    expect(() => x11Hash(new Uint8Array(64))).toThrow(/80 bytes/)
  })
})
