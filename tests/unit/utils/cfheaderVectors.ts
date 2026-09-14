import { createHash } from 'node:crypto'

/**
 * BIP 158's testnet block 0: the basic filter, and the basic header it chains
 * to off an all-zero previous header.
 *
 * The BIP publishes that header as `21584579…b750`, in the reversed order
 * explorers display. Everything here — like every other byte string these
 * bindings take — is internal (wire) order, so it reads as the reverse of the
 * BIP's table.
 */
export const GENESIS_FILTER = '019dfca8'
export const GENESIS_FILTER_HASH =
  '4c8af7fa3ac4111dc5fd7581d176c02dbbfde83fd6f16496a576fbd6b20537c0'
export const GENESIS_HEADER =
  '50b781aed7b7129012a6d20e2d040027937f3affaee573779908ebb779455821'

export const ZERO_HEADER = '00'.repeat(32)

/**
 * Double SHA-256 via Node's own OpenSSL — an implementation with nothing in
 * common with the one under test, so the expectations it produces are a real
 * cross-check rather than a restatement.
 */
export function sha256d (data: Uint8Array): Uint8Array {
  return createHash('sha256').update(createHash('sha256').update(data).digest()).digest()
}

/**
 * The filter headers a run of hashes chains to, walked one at a time in plain
 * JS. This is what the binding is expected to reproduce in a single call.
 */
export function chainReference (prev: Uint8Array, filterHashes: Uint8Array[]): Uint8Array[] {
  const headers: Uint8Array[] = []

  let previous = prev

  for (const filterHash of filterHashes) {
    const pair = new Uint8Array(64)

    pair.set(filterHash, 0)
    pair.set(previous, 32)

    previous = sha256d(pair)
    headers.push(previous)
  }

  return headers
}

/**
 * A deterministic run of distinct 32-byte filter hashes, standing in for a
 * `getcfheaders` reply.
 */
export function sampleFilterHashes (count: number): Uint8Array[] {
  return Array.from({ length: count }, (_unused, index) => {
    const seed = new Uint8Array(4)

    new DataView(seed.buffer).setUint32(0, index, true)

    return sha256d(seed)
  })
}
