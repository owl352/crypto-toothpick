// The wasm build is a reactor cdylib with no `main`; `cargo test` builds a test
// harness binary that needs one, so the attribute is off under `cfg(test)`.
#![cfg_attr(not(test), no_main)]

pub mod error;
pub mod gcs;
pub mod siphash;
pub mod utils;
pub mod x11;
