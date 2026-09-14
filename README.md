# crypto-toothpick

JavaScript bindings for the hashes [Dash](https://dash.org) runs on: the
[X11 chain](https://docs.dash.org/en/latest/introduction/features.html#x11-hash-algorithm)
used for block headers, built on [rs-x11-hash](https://github.com/dashpay/rs-x11-hash),
and SipHash-2-4 for BIP 158 compact filters — plus the filter matching itself,
which is what a light wallet actually spends its sync in.

The package ships prebuilt Node-API binaries for eight targets and a WebAssembly
build that covers everything else — browsers, and any platform without a native
binary. Structure and build pipeline follow [pshenmic-dpp](https://github.com/owl352/pshenmic-dpp).

___
## How To Install

`npm install crypto-toothpick`

___
## Usage

```js
import { x11Hash, x11HashHex } from 'crypto-toothpick'

const header = '020000002cc0081be5039a54b686d24d5d8747ee9770d9973ec1ace02e5c05000000' +
  '0000008d7139724b11c52995db4370284c998b9114154b120ad3486f1a360a1d4253d310d40e55b8f70a1be8e32300'

x11HashHex(header)
// 'f29c0f286fd8071669286c6987eb941181134ff5f3978bf89f34070000000000'

x11Hash(Buffer.from(header, 'hex'))
// Uint8Array(32) [ 242, 156, 15, 40, ... ]
```

Both functions take the header as a `Uint8Array` (a `Buffer` works too) or as a
hex string, whichever you have; only the return type differs between them.

SipHash-2-4, the keyed PRF behind BIP 158 compact filters and BIP 152 short
ids, is exported alongside it:

```js
import { siphash24, siphash24Hex, siphash24WithKeys } from 'crypto-toothpick'

siphash24Hex('000102030405060708090a0b0c0d0e0f', '000102030405')
// 'cee3fe586e46c9cb'

// keyed by the two 64-bit halves, returning a 64-bit result: the shape BIP 158
// filter matching works in
siphash24WithKeys(0x0706050403020100n, 0x0f0e0d0c0b0a0908n, new Uint8Array([0, 1, 2]))
// 9612764727700323885n
```

### API

| Export | Signature | Notes |
| --- | --- | --- |
| `x11Hash` | `(header: Uint8Array \| string) => Uint8Array` | 32-byte digest |
| `x11HashHex` | `(header: Uint8Array \| string) => string` | same digest, 64 hex chars |
| `x11HashMany` | `(headers: (Uint8Array \| string)[] \| Uint8Array) => Uint8Array` | 32 bytes per header, concatenated — see below |
| `siphash24` | `(key: Uint8Array \| string, data: Uint8Array \| string) => Uint8Array` | 8-byte digest, the 64-bit result little-endian |
| `siphash24Hex` | `(key: Uint8Array \| string, data: Uint8Array \| string) => string` | same digest, 16 hex chars |
| `siphash24WithKeys` | `(k0: bigint, k1: bigint, data: Uint8Array \| string) => bigint` | keyed by the two 64-bit halves |
| `siphash24Many` | `(k0: bigint, k1: bigint, items: (Uint8Array \| string)[]) => BigUint64Array` | one call for many messages — see below |
| `X11_INPUT_LENGTH` | `80` | bytes of input X11 consumes |
| `X11_OUTPUT_LENGTH` | `32` | bytes of X11 digest |
| `SIPHASH24_KEY_LENGTH` | `16` | bytes of SipHash key: `k0` little-endian, then `k1` |
| `SIPHASH24_OUTPUT_LENGTH` | `8` | bytes of SipHash digest |
| `toBytes` / `toHex` | `(value: Uint8Array \| string) => Uint8Array \| string` | the conversion helpers used internally |

Unlike X11, SipHash takes data of any length; only its key is fixed, at 16
bytes. `siphash24WithKeys` drops straight into a
`(k0, k1, data) => bigint` hook such as `dash-core-p2p`'s `setCustomSipHash`.

### Batch the small ones

Crossing the Node-API boundary costs about 200ns of call setup, and hashing a
25-byte BIP 158 filter item is only ~30ns of that. Called once per item, this
binding is **no faster than a well-written 32-bit JS SipHash** — the boundary is
the whole cost. Measured on an M-series mac, per item, 25-byte items:

| | per item | vs JS |
| --- | --- | --- |
| JS, BigInt-based (e.g. `dash-core-p2p`) | ~2900 ns | — |
| JS, 32-bit halves | ~270-540 ns | 1.0x |
| `siphash24WithKeys`, one call per item | ~262 ns | ~1-2x |
| `siphash24Many`, one call for 1000 items | **~76 ns** | **~7x** |

So hash filter items in one `siphash24Many` call rather than in a loop. Per-call
is fine once the message is big enough to dwarf the setup: at 1KB the binding is
~14x a 32-bit JS implementation.

X11 is big enough that the Node-API boundary is a rounding error on it — but
only on the native path. Measured over 2000 headers:

| | native | WebAssembly |
| --- | --- | --- |
| `x11Hash`, one call per header | 6.03 µs | 22.25 µs |
| `x11HashMany`, one call for 2000 | **5.34 µs** | **7.84 µs** |
| speedup | 1.13x | **2.84x** |

The wasm crossing costs ~7 µs per byte array in each direction, so a per-header
call spends 14.4 of its 22.2 µs getting the header in and the digest back out —
more than twice what X11 itself costs. Over a 2.3M-header sync that is 33
seconds on the wasm fallback and 1.6 seconds natively, which is why
`x11HashMany` exists even though X11 looks far too expensive to care about a
boundary.

### The input is always 80 bytes

X11 as implemented in Dash is a block header hash: the C implementation reads
exactly 80 bytes from the pointer it is given and ignores the length of the
buffer. Passing anything shorter would read out of bounds, so both functions
reject any input that is not exactly `X11_INPUT_LENGTH` bytes:

```js
x11Hash(new Uint8Array(64))
// TypeError: x11 input (a block header) must be exactly 80 bytes, got 64
```

This is not a hash-anything API — for arbitrary-length input you want a
different algorithm.

The digest is returned in internal byte order, the order the algorithm produces.
Block explorers show block hashes reversed, so reverse the bytes yourself if you
are comparing against one.

___
## Compact filter matching (BIP 158)

Wallet sync asks one question per block: *does this block's filter touch
anything I watch?* Answering it in JS means decoding a Golomb-Rice set and
running SipHash over every watched item in BigInt arithmetic. `gcsMatchAny`
does the whole thing in Rust and returns a boolean:

```js
import { gcsMatchAny } from 'crypto-toothpick'

// blockHash is the 32 bytes in internal (wire) order, not the reversed
// form block explorers show
if (gcsMatchAny(cfilterPayload, blockHash, watchedScripts)) {
  await downloadBlock(blockHash)
}
```

Syncing a range of blocks against a set that does not change? Build a
`FilterMatcher` once and the watched items stop crossing the boundary per
block:

```js
import { FilterMatcher } from 'crypto-toothpick'

const matcher = new FilterMatcher(watchedScripts)

for (const { filter, blockHash } of filters) {
  if (matcher.matchBlock(filter, blockHash)) await downloadBlock(blockHash)
}
```

Both take Golomb-Rice parameters as an optional `{ p, m }`, defaulting to the
basic filter's `BASIC_FILTER_P` (19) and `BASIC_FILTER_M` (784931n).

### What it costs

Per block, on an M-series mac, against the same work done in JS with a
BigInt SipHash — N is the filter's item count, K the wallet's watched items:

| | N=500, K=50 | N=2500, K=200 | N=2500, K=1000 | N=8000, K=200 |
| --- | --- | --- | --- | --- |
| JS: decode + match | 553 µs | 815 µs | 3385 µs | 1246 µs |
| `gcsMatchAny` | 5.8 µs | 23.5 µs | 244 µs | 41.5 µs |
| `FilterMatcher` | **2.5 µs** | **11.0 µs** | **27.9 µs** | **29.1 µs** |
| speedup | 218x | 74x | 121x | 43x |

At 11 µs a block, a 1.9M-block chain scan spends ~21 seconds in filter
matching rather than ~26 minutes.

| Export | Signature |
| --- | --- |
| `gcsMatchAny` | `(filter, blockHash, items, params?) => boolean` |
| `gcsMatchAnyWithKeys` | `(filter, k0: bigint, k1: bigint, items, params?) => boolean` |
| `FilterMatcher` | `new (items, params?)`, `.matchBlock(filter, blockHash)`, `.matchBlockWithKeys(filter, k0, k1)`, `.matchBlockMany(filters, blockHashes)`, `.size` |

### Matching a run of blocks

Following the tip, one filter arrives per network message and `matchBlock` is
the right call. But where a run is already in hand — a rescan, a backfill,
catching up after downtime — `matchBlockMany` takes the whole run in one
crossing:

```js
const hits = matcher.matchBlockMany(filters, blockHashes)

for (let at = 0; at < hits.length; at++) {
  if (hits[at] !== 0) await downloadBlock(blockHashes[at])
}
```

It answers one byte per block, 1 for a match, in the order given. The filters
are joined and their offsets derived for you.

The work per block is identical either way — the filter key changes with every
block, so the watched set is re-hashed regardless. What batching removes is the
boundary, and that is worth almost nothing natively and a great deal on
WebAssembly. Per block, over a 2000-block run with 170-byte filters and 50
watched items:

| | native | WebAssembly |
| --- | --- | --- |
| `matchBlock`, one call per block | 5.52 µs | 22.68 µs |
| `matchBlockMany`, one call | **5.40 µs** | **5.74 µs** |
| speedup | 1.02x | **3.95x** |
| over 2.3M blocks | ~0.3 s | **~39 s** |

On the native path it is not worth restructuring for. On the wasm fallback it
collapses the per-block crossing that otherwise costs four times what the
matching itself does — and it brings the two surfaces to within 6% of each
other, where per-block they differ by 4x.

The cost is that you must buffer a run before you can use it, which delays when
any single match becomes known. That trade is why `matchBlock` stays.

___
## Compact filter headers (BIP 157)

A `cfheaders` reply is a thousand filter hashes that have to be walked into a
thousand filter headers, each one `sha256d(filterHash || previousHeader)` over
the one before it. Done in JS that is two `createHash` allocations per block,
and the allocations cost an order of magnitude more than the hashing does.

Because every header feeds the next, the walk cannot be split into independent
pieces the way a batch of hashes can — so `cfilterHeaderChain` takes the whole
run and does the chaining in Rust, one crossing per chunk instead of one per
block:

```js
import { cfilterHeaderChain, CFILTER_HEADER_LENGTH } from 'crypto-toothpick'

// prevHeader is the filter header of the block before the first hash, in
// internal (wire) byte order
const headers = cfilterHeaderChain(prevHeader, filterHashes)

// one header per hash, back to back; the last is the chain's new tip
const tip = headers.subarray(headers.length - CFILTER_HEADER_LENGTH)
```

`filterHashes` is either a list of 32-byte hashes or one buffer with them
already joined. The result is always one flat buffer,
`CFILTER_HEADER_LENGTH` (32) bytes per header, in the order the hashes came in
— returning a thousand `Uint8Array` objects would spend the batching it was
meant to win. Slice it with `subarray`, which is a view rather than a copy.

Checking a downloaded filter against that chain is `cfilterVerify`, which folds
both digests and the comparison into the one call the filter already costs:

```js
import { cfilterVerify } from 'crypto-toothpick'

if (!cfilterVerify(cfilterPayload, prevHeader, expectedHeader)) {
  throw new Error('peer served a filter that does not match the header chain')
}
```

Every byte string here is in internal (wire) order, like the block hashes the
rest of the module takes. The BIP's own test vectors print filter headers
reversed, the way explorers display them, so reverse them before comparing.

| Export | Signature |
| --- | --- |
| `cfilterHeaderChain` | `(prev, filterHashes) => Uint8Array` |
| `cfilterVerify` | `(filter, prev, expected) => boolean` |

### What it costs

Per block, on an M-series mac under Node 22, against the same work done in JS
with `node:crypto` — the chain measured over 1000-hash chunks, the filter a
365-byte `cfilter`:

| | JS (`node:crypto`) | native | WebAssembly |
| --- | --- | --- | --- |
| `cfilterHeaderChain` | 0.84 µs | **0.30 µs** | **0.36 µs** |
| `cfilterVerify` | 1.63 µs | **1.18 µs** | 21.4 µs |

The chain is the one that pays: batching a thousand hashes into one call
amortises the boundary to nothing, and it is ~2.5x faster than JS on both
surfaces. Over a 2.3M-block restore that is about 1.2 seconds.

`cfilterVerify` is called once per filter, so it pays the boundary once per
block and only wins on the native path, by about 1.4x. **On the WebAssembly
path it loses badly** — and not because of anything it does: every crossing
into the wasm module costs ~7.8 µs per `Uint8Array` argument, against ~0.2 µs
for the same argument through Node-API.

| binding (byte-array arguments) | native | WebAssembly |
| --- | --- | --- |
| `siphash24WithKeys` (1) | 0.19 µs | 7.8 µs |
| `FilterMatcher.matchBlock` (2) | 0.25 µs | 14.3 µs |
| `cfilterVerify` (3) | 0.70 µs | 21.5 µs |

That is the rule for the whole module, not just this pair: on WebAssembly only
batched entry points are worth crossing for. Code that runs on the wasm
fallback and checks filters one at a time is better off hashing them in JS —
or collecting a chunk and checking it with `cfilterHeaderChain`, which is what
the header walk does anyway.

___
## Difficulty (DarkGravityWave v3)

Every Dash block retargets, so validating a header batch means running
DarkGravityWave over each of its blocks: a weighted average of the previous 24
targets, a clamped timespan, and a ratio — all in 256-bit integer arithmetic
that JS can only do in `BigInt`.

`dgwNextBitsRange` does the whole batch in one call. Headers already arrive up
to 2000 at a time, so a full mainnet sync is ~1150 calls rather than 2.3M:

```js
import { dgwNextBitsRange, DGW_PAST_BLOCKS } from 'crypto-toothpick'

// oldest first; the first DGW_PAST_BLOCKS entries are the already-validated
// blocks before the batch, and seed the averaging window
const expected = dgwNextBitsRange(times, nbits, DGW_PAST_BLOCKS)

for (let at = 0; at < expected.length; at++) {
  if (nbits[DGW_PAST_BLOCKS + at] !== expected[at]) {
    throw new Error(`block ${at} carries the wrong nBits`)
  }
}
```

`times` and `nbits` are each header's `nTime` and `nBits`, oldest first, same
length, as `Uint32Array`s or plain arrays. The result holds
`times.length - contextBlocks` values, lining up with the headers from
`contextBlocks` onward.

`contextBlocks` is how many leading entries are already-validated context
rather than blocks you want answers for. It must be at least the averaging
window; more is fine and simply starts the answers later, without changing what
any of them is.

### Chain parameters

An optional fourth argument overrides what the rule assumes about the chain:

| | default | |
| --- | --- | --- |
| `powLimit` | `DGW_POW_LIMIT` (`0x1e0fffff`) | easiest target, as compact nBits |
| `targetSpacing` | `DGW_TARGET_SPACING` (150) | seconds between blocks |
| `pastBlocks` | `DGW_PAST_BLOCKS` (24) | blocks the target is averaged over |

```js
// a DGW-derived chain with a half-hour window and one-minute blocks
dgwNextBitsRange(times, nbits, 30, { pastBlocks: 30, targetSpacing: 60 })
```

The first two differ between Dash's own networks, so anything running against
testnet, devnet or regtest will set them. `pastBlocks` does not — the 24-block
window is the same everywhere Dash runs — so reach for it only on a chain that
inherited DarkGravityWave and picked a different one. Changing it changes
consensus.

Note that `pastBlocks` sets the whole window, not just the count: the target
timespan is `pastBlocks × targetSpacing`, so a wider window expects a
proportionally longer span.

### What stays in JS

Deliberately not in here, because it would be wrong to move:

- **The era dispatch.** Call this only where v3 governs. KGW's event horizon is
  `f64::powf`, and a one-ulp split between the native and WebAssembly builds
  would move where its walk stops — which is the DGW v1/v2 failure Dash still
  carries a permanent ±50% tolerance band for.
- **The accept test.** Mainnet at or below height 68589 compares difficulty as
  a float. Nothing consensus-facing crosses this boundary as a float, so the
  comparison stays with the caller; this function only says what the nBits
  should be.

Everything that does cross is u256 integer arithmetic, so the two surfaces
agree by construction — and the test suite checks both against the same
`BigInt` reference rather than against each other.

### What it costs

Per block, over a 2000-block batch, against a tight `BigInt` implementation of
the same rule:

| | JS (`BigInt`) | native | WebAssembly |
| --- | --- | --- | --- |
| per block | 1.78 µs | **0.86 µs** | **1.33 µs** |
| speedup | — | 2.1x | 1.2x |
| over 2.3M blocks | — | ~2.1 s | ~0.6 s |

The JS column is a purpose-built reference that does nothing but the
arithmetic, so those savings are a floor: a real validator walking header
objects and allocating `BigInt`s per block starts further behind.

The shape matters more than the speed. Called once per block instead of once
per batch, this would cost ~14 µs a block on the WebAssembly fallback — about
30 seconds across a sync, swamping everything it saves. Batching it amortises
the crossing to roughly 8 ns a block, which is why it wins on both surfaces
instead of trading one against the other.

___
## Entry points

| Import | Runtime |
| --- | --- |
| `crypto-toothpick` | native binary under Node, WebAssembly in the browser |
| `crypto-toothpick/native` | Node-API binary, falling back to WebAssembly |
| `crypto-toothpick/wasm` | WebAssembly always |
| `crypto-toothpick/react-native` | the React Native Node-API module (XCFramework / Android libs) |

The default export resolves through the `browser` / `node` conditions, so a
bundler targeting the browser gets the WebAssembly build and Node gets the
native one. The native entry degrades to WebAssembly on its own if the binary
for the current platform is missing or fails to load, so there is no platform
where the import simply breaks.

The WebAssembly module is single-threaded (`wasm32-wasip1`) and instantiates
synchronously at import time — no `await init()`, no shared memory, and no
cross-origin isolation needed to load it in a browser.

### Prebuilt native targets

`x86_64`/`aarch64` for `apple-darwin`, `unknown-linux-gnu`, `unknown-linux-musl`
and `pc-windows-msvc`.

___
## Building

```
npm install
npm run build:full     # build:bin (binaries) + build:ts (TypeScript)
npm test
```

`build:bin` cross-compiles every native target, so a full local build needs:

- **zig** and **cargo-zigbuild** — the Linux targets
- **cargo-xwin** — the Windows MSVC targets (set `XWIN_ACCEPT_LICENSE=1`)
- **LLVM's clang** (`brew install llvm` on macOS) — rs-x11-hash compiles its C
  sources for wasm with plain `clang`, and Apple's clang has no wasm backend.
  Point `WASM_CLANG_DIR` at another LLVM if Homebrew's is not what you want.
- **binaryen** for `wasm-opt`, otherwise the npm devDependency is used
- `RUSTFLAGS='-C target-feature=-crt-static'` for the musl targets, which
  otherwise build a static library rather than a shared object
- **the Android SDK + NDK** (`ANDROID_HOME`, NDK 27.1.12297006) and **Xcode** —
  `ferric` builds the React Native artifacts and generates the TypeScript
  declarations every typing in the package is derived from. The build passes it
  `CARGO_NDK_SYSROOT_PATH`, which rs-x11-hash's build script needs to compile the
  x11 C sources for Android; override the NDK it points at with
  `FERRIC_NDK_VERSION`.

Build only what you need with `NATIVE_BUILD_TARGET`:

```
NATIVE_BUILD_TARGET=aarch64-apple-darwin npm run build:full
```

Rust-level tests (`cargo test`) cover the hashing cores against the upstream
rs-x11-hash vectors and all 64 SipHash reference vectors; the Jest suite runs
the same vectors through both the native and the WebAssembly binding.
