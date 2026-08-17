// The module imports its memory rather than defining one, so it can be sized
// here. Not shared: nothing in this binding is async or threaded, so no
// SharedArrayBuffer and no cross-origin isolation is needed to load it.
//
// 64MB up front is not what the hashes need — they need a few KB — it is what
// keeps `memory.grow` off the hot path. Growth is correct but not free: the
// buffer is replaced, so every JS-side view of it has to be rebuilt.
let memory = new WebAssembly.Memory({
  initial: 1000,
  maximum: 12000
});

module.exports.default = memory;
