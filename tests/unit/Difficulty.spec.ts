import {
  dgwNextBitsRange,
  DGW_PAST_BLOCKS,
  DGW_TARGET_SPACING,
  DGW_POW_LIMIT
} from 'crypto-toothpick'
import {
  POW_LIMIT_BITS,
  getCompact,
  setCompact,
  nextBits,
  nextBitsRange,
  sampleChain
} from './utils/dgwVectors.js'

describe('DarkGravityWave v3', function () {
  describe('against a BigInt reference', function () {
    test('should match over a long run of headers', function () {
      const { times, nbits } = sampleChain(500)

      expect(Array.from(dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS)))
        .toEqual(nextBitsRange(times, nbits, DGW_PAST_BLOCKS))
    })

    test('should match with more context than the window needs', function () {
      const { times, nbits } = sampleChain(200)

      expect(Array.from(dgwNextBitsRange(times, nbits, 100)))
        .toEqual(nextBitsRange(times, nbits, 100))
    })

    test('should match block for block on a batch-sized range', function () {
      const { times, nbits } = sampleChain(DGW_PAST_BLOCKS + 2000)
      const expected = dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS)

      expect(expected.length).toEqual(2000)
      expect(expected[0]).toEqual(nextBits(times, nbits, DGW_PAST_BLOCKS - 1))
      expect(expected[1999]).toEqual(nextBits(times, nbits, DGW_PAST_BLOCKS + 1998))
    })
  })

  describe('the rule itself', function () {
    function flat (bits: number, spacing: number, count = DGW_PAST_BLOCKS): {
      times: number[]
      nbits: number[]
    } {
      return {
        times: Array.from({ length: count }, (_u, at) => 1_500_000_000 + at * spacing),
        nbits: Array.from({ length: count }, () => bits)
      }
    }

    test('should tighten slightly on a chain running exactly on time', function () {
      const { times, nbits } = flat(DGW_POW_LIMIT, DGW_TARGET_SPACING)
      const [next] = dgwNextBitsRange(
        [...times, times[23] + DGW_TARGET_SPACING],
        [...nbits, DGW_POW_LIMIT],
        DGW_PAST_BLOCKS
      )

      // 23 intervals measured across a 24-block window, so on-time reads fast
      expect(setCompact(next)).toBeLessThan(setCompact(DGW_POW_LIMIT))
      expect(next).toEqual(nextBits([...times, 0], [...nbits, 0], DGW_PAST_BLOCKS - 1))
    })

    test('should never go easier than the pow limit', function () {
      const { times, nbits } = flat(DGW_POW_LIMIT, DGW_TARGET_SPACING * 100)
      const [next] = dgwNextBitsRange(
        [...times, 0],
        [...nbits, DGW_POW_LIMIT],
        DGW_PAST_BLOCKS
      )

      expect(next).toEqual(DGW_POW_LIMIT)
    })

    test('should clamp a span that collapses to nothing', function () {
      const easier = getCompact(setCompact(DGW_POW_LIMIT) / 8n)
      const { times, nbits } = flat(easier, 0)
      const [next] = dgwNextBitsRange([...times, 0], [...nbits, easier], DGW_PAST_BLOCKS)

      // the lower clamp is a third of the target span, so the target thirds —
      // compared as nBits, since the compact encoding keeps only three
      // mantissa bytes
      expect(next).toEqual(getCompact(setCompact(easier) / 3n))
    })

    test('should absorb timestamps that go backwards', function () {
      const easier = getCompact(setCompact(DGW_POW_LIMIT) / 8n)
      const { times, nbits } = flat(easier, DGW_TARGET_SPACING)
      const backwards = [...times].reverse()
      const [next] = dgwNextBitsRange([...backwards, 0], [...nbits, easier], DGW_PAST_BLOCKS)

      expect(next).toEqual(getCompact(setCompact(easier) / 3n))
    })
  })

  describe('shape', function () {
    test('should answer one entry per header after the context', function () {
      const { times, nbits } = sampleChain(DGW_PAST_BLOCKS + 17)

      expect(dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS).length).toEqual(17)
    })

    test('should answer nothing when the range is empty', function () {
      const { times, nbits } = sampleChain(DGW_PAST_BLOCKS)

      expect(dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS).length).toEqual(0)
    })

    // Checked structurally rather than with `toBeInstanceOf`: jest runs the
    // suite in its own realm, so a typed array built by the binding fails an
    // identity check against the sandbox's constructor even though plain Node
    // reports it as a Uint32Array.
    test('should return a Uint32Array that owns its values', function () {
      const { times, nbits } = sampleChain(DGW_PAST_BLOCKS + 4)
      const expected = dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS)

      expect(ArrayBuffer.isView(expected)).toEqual(true)
      expect(expected.constructor.name).toEqual('Uint32Array')
      expect(expected.BYTES_PER_ELEMENT).toEqual(4)
      expect(expected.byteOffset).toEqual(0)
      expect(expected.buffer.byteLength).toEqual(expected.length * 4)
    })

    test('should accept typed arrays as readily as plain ones', function () {
      const { times, nbits } = sampleChain(DGW_PAST_BLOCKS + 8)

      expect(dgwNextBitsRange(Uint32Array.from(times), Uint32Array.from(nbits), DGW_PAST_BLOCKS))
        .toEqual(dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS))
    })
  })

  describe('parameters', function () {
    test('should take the mainnet defaults explicitly', function () {
      const { times, nbits } = sampleChain(DGW_PAST_BLOCKS + 10)

      expect(dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS, {
        powLimit: DGW_POW_LIMIT,
        targetSpacing: DGW_TARGET_SPACING
      })).toEqual(dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS))
    })

    test('should honour a different spacing', function () {
      const { times, nbits } = sampleChain(DGW_PAST_BLOCKS + 10)

      expect(dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS, { targetSpacing: 600 }))
        .not.toEqual(dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS))
    })

    test('should expose the mainnet constants', function () {
      expect(DGW_PAST_BLOCKS).toEqual(24)
      expect(DGW_TARGET_SPACING).toEqual(150)
      expect(DGW_POW_LIMIT).toEqual(POW_LIMIT_BITS)
    })
  })

  describe('a custom window', function () {
    test('should match the reference for any window size', function () {
      const { times, nbits } = sampleChain(200)

      for (const pastBlocks of [1, 2, 5, 24, 50]) {
        expect(Array.from(dgwNextBitsRange(times, nbits, 100, { pastBlocks })))
          .toEqual(nextBitsRange(times, nbits, 100, pastBlocks))
      }
    })

    test('should give a different answer than the default window', function () {
      const { times, nbits } = sampleChain(100)

      expect(dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS, { pastBlocks: 6 }))
        .not.toEqual(dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS))
    })

    test('should default to the Dash window when not given one', function () {
      const { times, nbits } = sampleChain(60)

      expect(dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS, { pastBlocks: DGW_PAST_BLOCKS }))
        .toEqual(dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS))
    })

    test('should reject a window of nothing', function () {
      const { times, nbits } = sampleChain(60)

      expect(() => dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS, { pastBlocks: 0 }))
        .toThrow(/past blocks must be at least 1/)
    })

    test('should reject a window wider than the context it was given', function () {
      const { times, nbits } = sampleChain(60)

      expect(() => dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS, { pastBlocks: 25 }))
        .toThrow(/context blocks must be at least 25 entries, got 24/)
    })
  })

  describe('input validation', function () {
    test('should reject inputs of different lengths', function () {
      const { times, nbits } = sampleChain(DGW_PAST_BLOCKS + 5)

      expect(() => dgwNextBitsRange(times.slice(0, -1), nbits, DGW_PAST_BLOCKS))
        .toThrow(/same length/)
    })

    test('should reject a context too short to seed the window', function () {
      const { times, nbits } = sampleChain(DGW_PAST_BLOCKS + 5)

      expect(() => dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS - 1))
        .toThrow(/context blocks must be at least 24 entries/)
    })

    test('should let extra context move where the answers start, not what they are', function () {
      const { times, nbits } = sampleChain(120)
      const whole = Array.from(dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS))
      const later = Array.from(dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS + 30))

      expect(later).toEqual(whole.slice(30))
    })

    test('should reject an nBits no valid target could encode', function () {
      const { times, nbits } = sampleChain(DGW_PAST_BLOCKS + 5)

      // zero, negative, and overflowing: the three CheckProofOfWork rejects
      for (const bad of [0, 0x04923456, 0x23123456]) {
        const broken = [...nbits]

        broken[0] = bad

        expect(() => dgwNextBitsRange(times, broken, DGW_PAST_BLOCKS))
          .toThrow(/not a valid target/)
      }
    })
  })
})
