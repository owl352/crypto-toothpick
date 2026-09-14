import * as x11 from 'crypto-toothpick/wasm'
import {
  x11Hash,
  x11HashHex,
  x11HashMany,
  dgwNextBitsRange,
  FilterMatcher,
  siphash24,
  siphash24Hex,
  cfilterHeaderChain,
  cfilterVerify,
  toBytes,
  toHex
} from 'crypto-toothpick/wasm'
import { hexToBytes, vectors } from './utils/vectors.js'
import { SIPHASH_KEY } from './utils/siphashVectors.js'
import {
  GENESIS_FILTER,
  GENESIS_HEADER,
  ZERO_HEADER,
  chainReference,
  sampleFilterHashes
} from './utils/cfheaderVectors.js'
import { nextBitsRange, sampleChain } from './utils/dgwVectors.js'

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

  // The two calls below run at the sizes the batched API was actually reshaped
  // for — a `getcfheaders` reply is 1000 hashes and a `headers` batch is 2000 —
  // which is where the allocator reliably calls `memory.grow`. That growth
  // replaces the buffer under emnapi's cached HEAP_DATA_VIEW, and a runtime
  // that does not rebuild it fails here with "detached ArrayBuffer" rather than
  // returning a wrong answer. @emnapi/core rebuilds correctly from 1.11; the
  // package pins at or above that, and these are what hold the pin honest.
  test('should chain a full getcfheaders chunk across a memory grow', function () {
    const prev = toBytes(GENESIS_HEADER)
    const hashes = sampleFilterHashes(1000)
    const chained = cfilterHeaderChain(prev, hashes)

    expect(chained.length).toEqual(1000 * 32)
    expect(toHex(chained)).toEqual(chainReference(prev, hashes).map(toHex).join(''))
  })

  test('should hash a full header batch across a memory grow', function () {
    const { header, digest } = vectors[0]
    const one = toBytes(header)
    const batch = new Uint8Array(2000 * 80)

    for (let at = 0; at < 2000; at++) batch.set(one, at * 80)

    const digests = x11HashMany(batch)

    expect(digests.length).toEqual(2000 * 32)
    // spot-check both ends rather than build a 2000-entry expectation
    expect(toHex(digests.subarray(0, 32))).toEqual(digest)
    expect(toHex(digests.subarray(1999 * 32))).toEqual(digest)
  })

  test('should reject a header of the wrong length', function () {
    expect(() => x11Hash(new Uint8Array(64))).toThrow(/80 bytes/)
  })

  // NodeApi.spec.ts runs the same expectation against the other surface, and
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

  // Checked against the BigInt reference on both surfaces, so the u256
  // arithmetic agreeing across them is a test rather than a convention.
  test('should retarget a range of headers', function () {
    const { times, nbits } = sampleChain(224)

    expect(Array.from(dgwNextBitsRange(times, nbits, 24)))
      .toEqual(nextBitsRange(times, nbits, 24))
  })

  test('should match a run of blocks against their filters', function () {
    const hash = new Uint8Array(32).fill(0x11)
    const matcher = new FilterMatcher([new Uint8Array([0x55, 1, 2])])
    // an empty filter claims no entries, so every answer here is a miss —
    // what is under test is that the run comes back one byte per block
    const hits = matcher.matchBlockMany(['00', '00', '00'], [hash, hash, hash])

    expect(hits.length).toEqual(3)
    expect(Array.from(hits)).toEqual([0, 0, 0])
  })
})
