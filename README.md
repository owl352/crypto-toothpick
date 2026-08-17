# crypto-toothpick

JavaScript bindings for the hashes [Dash](https://dash.org) runs on: the
[X11 chain](https://docs.dash.org/en/latest/introduction/features.html#x11-hash-algorithm)
used for block headers, built on [rs-x11-hash](https://github.com/dashpay/rs-x11-hash),
and SipHash-2-4 for BIP 158 compact filters.

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
| `siphash24` | `(key: Uint8Array \| string, data: Uint8Array \| string) => Uint8Array` | 8-byte digest, the 64-bit result little-endian |
| `siphash24Hex` | `(key: Uint8Array \| string, data: Uint8Array \| string) => string` | same digest, 16 hex chars |
| `siphash24WithKeys` | `(k0: bigint, k1: bigint, data: Uint8Array \| string) => bigint` | keyed by the two 64-bit halves |
| `X11_INPUT_LENGTH` | `80` | bytes of input X11 consumes |
| `X11_OUTPUT_LENGTH` | `32` | bytes of X11 digest |
| `SIPHASH24_KEY_LENGTH` | `16` | bytes of SipHash key: `k0` little-endian, then `k1` |
| `SIPHASH24_OUTPUT_LENGTH` | `8` | bytes of SipHash digest |
| `toBytes` / `toHex` | `(value: Uint8Array \| string) => Uint8Array \| string` | the conversion helpers used internally |

Unlike X11, SipHash takes data of any length; only its key is fixed, at 16
bytes. `siphash24WithKeys` drops straight into a
`(k0, k1, data) => bigint` hook such as `dash-core-p2p`'s `setCustomSipHash`.

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
