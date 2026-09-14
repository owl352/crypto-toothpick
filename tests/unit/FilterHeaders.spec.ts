import {
  cfilterHeaderChain,
  cfilterVerify,
  CFILTER_HEADER_LENGTH,
  toBytes,
  toHex
} from 'crypto-toothpick'
import {
  GENESIS_FILTER,
  GENESIS_FILTER_HASH,
  GENESIS_HEADER,
  ZERO_HEADER,
  chainReference,
  sampleFilterHashes
} from './utils/cfheaderVectors.js'

function headersOf (chained: Uint8Array): Uint8Array[] {
  const headers: Uint8Array[] = []

  for (let at = 0; at < chained.length; at += CFILTER_HEADER_LENGTH) {
    headers.push(chained.subarray(at, at + CFILTER_HEADER_LENGTH))
  }

  return headers
}

describe('compact filter headers (BIP 157)', function () {
  describe('cfilterHeaderChain', function () {
    test('should chain the BIP 158 genesis header', function () {
      expect(toHex(cfilterHeaderChain(ZERO_HEADER, GENESIS_FILTER_HASH))).toEqual(GENESIS_HEADER)
    })

    test('should return one header per hash', function () {
      const hashes = sampleFilterHashes(7)

      expect(cfilterHeaderChain(ZERO_HEADER, hashes).length)
        .toEqual(hashes.length * CFILTER_HEADER_LENGTH)
    })

    test('should agree with a chain walked one step at a time', function () {
      const prev = toBytes(GENESIS_HEADER)
      const hashes = sampleFilterHashes(1000)

      expect(headersOf(cfilterHeaderChain(prev, hashes)).map(toHex))
        .toEqual(chainReference(prev, hashes).map(toHex))
    })

    test('should chain each header off the one before, not off prev', function () {
      const hashes = sampleFilterHashes(3)
      const headers = headersOf(cfilterHeaderChain(ZERO_HEADER, hashes))

      expect(toHex(headers[1]))
        .toEqual(toHex(chainReference(headers[0], [hashes[1]])[0]))
    })

    test('should pick up where an earlier chunk left off', function () {
      const prev = toBytes(GENESIS_HEADER)
      const hashes = sampleFilterHashes(10)

      const whole = cfilterHeaderChain(prev, hashes)
      const first = cfilterHeaderChain(prev, hashes.slice(0, 4))
      const rest = cfilterHeaderChain(first.subarray(first.length - CFILTER_HEADER_LENGTH), hashes.slice(4))

      expect(toHex(whole)).toEqual(toHex(first) + toHex(rest))
    })

    test('should accept the hashes already joined into one buffer', function () {
      const hashes = sampleFilterHashes(4)
      const joined = new Uint8Array(hashes.length * CFILTER_HEADER_LENGTH)

      hashes.forEach((hash, at) => joined.set(hash, at * CFILTER_HEADER_LENGTH))

      expect(toHex(cfilterHeaderChain(ZERO_HEADER, joined)))
        .toEqual(toHex(cfilterHeaderChain(ZERO_HEADER, hashes)))
    })

    test('should accept bytes as readily as hex', function () {
      expect(toHex(cfilterHeaderChain(toBytes(ZERO_HEADER), [toBytes(GENESIS_FILTER_HASH)])))
        .toEqual(GENESIS_HEADER)
    })

    test('should chain nothing onto no hashes', function () {
      expect(cfilterHeaderChain(ZERO_HEADER, []).length).toEqual(0)
      expect(cfilterHeaderChain(ZERO_HEADER, '').length).toEqual(0)
    })

    test('should hand back a buffer that owns its bytes', function () {
      const headers = cfilterHeaderChain(ZERO_HEADER, sampleFilterHashes(2))

      expect(headers.byteOffset).toEqual(0)
      expect(headers.buffer.byteLength).toEqual(headers.length)
    })

    test('should reject a previous header of the wrong length', function () {
      expect(() => cfilterHeaderChain('0011', GENESIS_FILTER_HASH)).toThrow(/32 bytes/)
    })

    test('should reject a run that is not whole filter hashes', function () {
      expect(() => cfilterHeaderChain(ZERO_HEADER, GENESIS_FILTER_HASH + '00'))
        .toThrow(/whole number of 32-byte entries/)
    })
  })

  describe('cfilterVerify', function () {
    test('should accept a filter that chains to its header', function () {
      expect(cfilterVerify(GENESIS_FILTER, ZERO_HEADER, GENESIS_HEADER)).toEqual(true)
    })

    test('should reject a tampered filter', function () {
      expect(cfilterVerify('019dfca9', ZERO_HEADER, GENESIS_HEADER)).toEqual(false)
    })

    test('should reject the right filter chained off the wrong header', function () {
      expect(cfilterVerify(GENESIS_FILTER, GENESIS_HEADER, GENESIS_HEADER)).toEqual(false)
    })

    test('should agree with cfilterHeaderChain over the filter hash', function () {
      const expected = cfilterHeaderChain(ZERO_HEADER, GENESIS_FILTER_HASH)

      expect(cfilterVerify(GENESIS_FILTER, ZERO_HEADER, expected)).toEqual(true)
    })

    test('should accept bytes as readily as hex', function () {
      expect(cfilterVerify(toBytes(GENESIS_FILTER), toBytes(ZERO_HEADER), toBytes(GENESIS_HEADER)))
        .toEqual(true)
    })

    test('should reject a header of the wrong length', function () {
      expect(() => cfilterVerify(GENESIS_FILTER, '0011', GENESIS_HEADER)).toThrow(/32 bytes/)
      expect(() => cfilterVerify(GENESIS_FILTER, ZERO_HEADER, '0011')).toThrow(/32 bytes/)
    })
  })
})
