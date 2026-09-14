/**
 * DarkGravityWave v3 written again in `BigInt`, so the expectations it produces
 * share no arithmetic with the u256 code under test. This is the reference the
 * binding is checked against on both surfaces.
 */

export const PAST_BLOCKS = 24
export const TARGET_SPACING = 150
export const POW_LIMIT_BITS = 0x1e0fffff

/** `arith_uint256::SetCompact`, without the sign and overflow reporting. */
export function setCompact (compact: number): bigint {
  const size = compact >>> 24
  const word = BigInt(compact & 0x007fffff)

  return size <= 3
    ? word >> BigInt(8 * (3 - size))
    : word << BigInt(8 * (size - 3))
}

/** `arith_uint256::GetCompact`, never negative. */
export function getCompact (value: bigint): number {
  let size = Math.ceil((value === 0n ? 0 : value.toString(2).length) / 8)

  let compact = size <= 3
    ? Number(value << BigInt(8 * (3 - size)))
    : Number(value >> BigInt(8 * (size - 3)))

  // a mantissa that would read as negative moves down a byte
  if ((compact & 0x00800000) !== 0) {
    compact >>>= 8
    size++
  }

  return (compact | (size << 24)) >>> 0
}

/**
 * The nBits expected after the window ending at `last`.
 */
export function nextBits (
  times: ArrayLike<number>,
  nbits: ArrayLike<number>,
  last: number,
  pastBlocks: number = PAST_BLOCKS,
  powLimit: bigint = setCompact(POW_LIMIT_BITS),
  spacing: number = TARGET_SPACING
): number {
  const timespan = pastBlocks * spacing
  let average = 0n

  for (let count = 1; count <= pastBlocks; count++) {
    const target = setCompact(nbits[last + 1 - count])

    average = count === 1
      ? target
      : (average * BigInt(count) + target) / BigInt(count + 1)
  }

  // the walk covers pastBlocks - 1 intervals, not pastBlocks
  const oldest = last + 1 - pastBlocks
  let actual = times[last] - times[oldest]

  if (actual < timespan / 3) actual = timespan / 3
  if (actual > timespan * 3) actual = timespan * 3

  let next = (average * BigInt(actual)) / BigInt(timespan)

  if (next > powLimit) next = powLimit

  return getCompact(next)
}

/** Every expected nBits for the range after `context`. */
export function nextBitsRange (
  times: ArrayLike<number>,
  nbits: ArrayLike<number>,
  contextBlocks: number,
  pastBlocks: number = PAST_BLOCKS
): number[] {
  const out: number[] = []

  for (let at = contextBlocks; at < times.length; at++) {
    out.push(nextBits(times, nbits, at - 1, pastBlocks))
  }

  return out
}

/**
 * A deterministic run of headers: targets wandering around the pow limit, and
 * timestamps that mostly move forward but sometimes do not — chains really do
 * carry those, and the timespan clamp is what absorbs them.
 */
export function sampleChain (count: number): { times: number[], nbits: number[] } {
  let seed = 0x9e3779b9
  const random = (): number => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return seed >>> 0
  }

  const limit = setCompact(POW_LIMIT_BITS)
  const times: number[] = []
  const nbits: number[] = []

  let at = 1_500_000_000

  for (let block = 0; block < count; block++) {
    // divisors from 1 to 4096 walk the target over a wide range without ever
    // going easier than the limit
    nbits.push(getCompact(limit / BigInt(1 + (random() % 4096))))

    at += (random() % 400) - 40
    times.push(at)
  }

  return { times, nbits }
}
