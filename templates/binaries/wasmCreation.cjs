const { WASI } = require('@tybys/wasm-util');
const { getDefaultContext } = require('@emnapi/runtime');
const { instantiateNapiModuleSync } = require('@emnapi/core');

const { bytes } = require('./wasm/wasmBytes.cjs');
const { decode } = require('../utils/base122.cjs');
const { decompressSync } = require('fflate');

const emnapiContext = getDefaultContext();
// No `new Function` (so the module loads under a strict CSP) and no BigInt:
// this binding only ever passes byte arrays, strings and small integers.
emnapiContext.feature.supportNewFunction = false;
emnapiContext.feature.supportBigInt = false;

const wasmBytes = new Uint8Array(decode(bytes));

const wasi = new WASI({
  version: 'preview1',
  print: function () {
    console.log.apply(console, arguments);
  },
  printErr: function () {
    console.error.apply(console, arguments);
  }
});

// Everything exported here is synchronous and single-threaded (x11 is a chain
// of eleven digests over an 80-byte header), so the module needs no wasm
// threads: it is compiled for plain `wasm32-wasip1`, owns its own memory and
// spawns no workers. That keeps instantiation synchronous at import time, which
// the ~300KB module is small enough for.
const wasm = instantiateNapiModuleSync(decompressSync(wasmBytes), {
  context: emnapiContext,
  wasi,
  overwriteImports(importObject) {
    importObject.env = {
      ...importObject.env,
      ...importObject.napi,
      ...importObject.emnapi
    };
  },
  beforeInit({ instance }) {
    for (const name of Object.keys(instance.exports)) {
      if (name.startsWith('__napi_register__')) {
        instance.exports[name]();
      }
    }
  }
});

module.exports = wasm.napiModule.exports;
module.exports.default = wasm.napiModule.exports;
