import {
  gcsMatchAny,
  gcsMatchAnyWithKeys,
  FilterMatcher,
  BASIC_FILTER_P,
  BASIC_FILTER_M,
  toBytes
} from 'crypto-toothpick'

// A basic (type 0) filter over 64 known items, built with the reference
// Golomb-Rice encoding under the block hash below.
const blockHash = '00070e151c232a31383f464d545b626970777e858c939aa1a8afb6bdc4cbd2d9'
const filter =
  '40627329d7b9c449238341e4668ab0091e45cf6a6aaee4100bd9aa35784f22e0846ade98b8890dbd7249' +
  '348d713bc26ef8459de992f294a3e032d14f55232a2ce035c7e6f6ae5454990efe40bb8e2576c605409f' +
  'd4a7457ec59da498b835e024104d17882e236d9bda44c2b925c5147b3d71cee6794c1668dfd9755951f7' +
  'e9016b92613de136e1fc12d7a791ba7411b8a932b8258f600d88579498489524d34b55a256a09006a59b6398'

const member = '550102030405060708090a0b0c0d0e0f101112131415'
const memberLast = '55a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6'
const stranger = 'aa0102030405'

const keyBytes = toBytes(blockHash)
const view = new DataView(keyBytes.buffer, keyBytes.byteOffset, keyBytes.byteLength)
const k0 = view.getBigUint64(0, true)
const k1 = view.getBigUint64(8, true)

describe('compact filter matching', function () {
  describe('gcsMatchAny', function () {
    test('should match an item the filter contains', function () {
      expect(gcsMatchAny(filter, blockHash, [member])).toEqual(true)
      expect(gcsMatchAny(filter, blockHash, [memberLast])).toEqual(true)
    })

    test('should not match an item the filter does not contain', function () {
      expect(gcsMatchAny(filter, blockHash, [stranger])).toEqual(false)
    })

    test('should match if any one of many items is present', function () {
      expect(gcsMatchAny(filter, blockHash, [stranger, 'aa09', member])).toEqual(true)
      expect(gcsMatchAny(filter, blockHash, [stranger, 'aa09', 'aa0a'])).toEqual(false)
    })

    test('should not match an empty query', function () {
      expect(gcsMatchAny(filter, blockHash, [])).toEqual(false)
    })

    test('should accept bytes as readily as hex', function () {
      expect(gcsMatchAny(toBytes(filter), toBytes(blockHash), [toBytes(member)])).toEqual(true)
    })

    test('should give the same answer keyed by the halves directly', function () {
      expect(gcsMatchAnyWithKeys(filter, k0, k1, [member])).toEqual(true)
      expect(gcsMatchAnyWithKeys(filter, k0, k1, [stranger])).toEqual(false)
    })

    test('should accept the basic filter parameters explicitly', function () {
      expect(gcsMatchAny(filter, blockHash, [member], { p: BASIC_FILTER_P, m: BASIC_FILTER_M }))
        .toEqual(true)
    })

    test('should reject a block hash of the wrong length', function () {
      expect(() => gcsMatchAny(filter, '0011', [member])).toThrow(/32 bytes/)
    })

    test('should reject a malformed filter', function () {
      expect(() => gcsMatchAny('', blockHash, [member])).toThrow(/filter/)
      // claims five entries, carries no payload
      expect(() => gcsMatchAny('05', blockHash, [member])).toThrow(/filter/)
    })

    test('should reject golomb parameters out of range', function () {
      expect(() => gcsMatchAny(filter, blockHash, [member], { p: 0 })).toThrow(/golomb/)
      expect(() => gcsMatchAny(filter, blockHash, [member], { p: 64 })).toThrow(/golomb/)
    })
  })

  describe('FilterMatcher', function () {
    test('should answer the same as gcsMatchAny', function () {
      const matcher = new FilterMatcher([stranger, member])

      expect(matcher.matchBlock(filter, blockHash)).toEqual(true)
      expect(matcher.matchBlock(filter, blockHash))
        .toEqual(gcsMatchAny(filter, blockHash, [stranger, member]))
    })

    test('should miss when it watches nothing the block touches', function () {
      expect(new FilterMatcher([stranger]).matchBlock(filter, blockHash)).toEqual(false)
      expect(new FilterMatcher([]).matchBlock(filter, blockHash)).toEqual(false)
    })

    test('should report how many items it watches', function () {
      expect(new FilterMatcher([stranger, member, memberLast]).size).toEqual(3)
      expect(new FilterMatcher([]).size).toEqual(0)
    })

    test('should be reusable across blocks', function () {
      const matcher = new FilterMatcher([member])

      for (let i = 0; i < 5; i++) {
        expect(matcher.matchBlock(filter, blockHash)).toEqual(true)
      }
    })

    test('should match keyed by the halves directly', function () {
      expect(new FilterMatcher([member]).matchBlockWithKeys(filter, k0, k1)).toEqual(true)
      expect(new FilterMatcher([stranger]).matchBlockWithKeys(filter, k0, k1)).toEqual(false)
    })

    test('should reject a block hash of the wrong length', function () {
      expect(() => new FilterMatcher([member]).matchBlock(filter, '0011')).toThrow(/32 bytes/)
    })

    describe('matchBlockMany', function () {
      // the same block repeated is enough to check the plumbing: every entry
      // has to come back with the answer matchBlock gives for it
      const run = [filter, filter, filter]
      const hashes = [blockHash, blockHash, blockHash]

      test('should agree with the blocks matched one at a time', function () {
        const matcher = new FilterMatcher([member])

        expect(Array.from(matcher.matchBlockMany(run, hashes)))
          .toEqual(run.map((f, at) => (matcher.matchBlock(f, hashes[at]) ? 1 : 0)))
      })

      test('should answer one byte per block', function () {
        const matcher = new FilterMatcher([member])

        expect(matcher.matchBlockMany(run, hashes).length).toEqual(3)
        expect(Array.from(matcher.matchBlockMany(run, hashes))).toEqual([1, 1, 1])
      })

      test('should miss where nothing is watched', function () {
        expect(Array.from(new FilterMatcher([stranger]).matchBlockMany(run, hashes)))
          .toEqual([0, 0, 0])
      })

      test('should handle filters of differing lengths in one run', function () {
        const matcher = new FilterMatcher([member])
        // an empty filter claims no entries, so it can never match
        const mixed = [filter, '00', filter]

        expect(Array.from(matcher.matchBlockMany(mixed, hashes))).toEqual([1, 0, 1])
      })

      test('should answer nothing for an empty run', function () {
        expect(new FilterMatcher([member]).matchBlockMany([], []).length).toEqual(0)
      })

      test('should accept the hashes already joined into one buffer', function () {
        const matcher = new FilterMatcher([member])
        const joined = new Uint8Array(3 * 32)

        hashes.forEach((h, at) => joined.set(toBytes(h), at * 32))

        expect(Array.from(matcher.matchBlockMany(run, joined))).toEqual([1, 1, 1])
      })

      test('should reject a run whose hashes do not line up', function () {
        expect(() => new FilterMatcher([member]).matchBlockMany(run, hashes.slice(0, 2)))
          .toThrow(/one entry more than there are block hashes/)
      })

      test('should reject hashes that are not whole block hashes', function () {
        expect(() => new FilterMatcher([member]).matchBlockMany(run, ['0011']))
          .toThrow(/whole number of 32-byte entries/)
      })
    })
  })
})
