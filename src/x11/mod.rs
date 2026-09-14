pub mod hash;

use napi::bindgen_prelude::Uint8Array;
use napi_derive::napi;

use crate::utils::WithJsError;

/// Size of the input the X11 chain consumes: a Dash block header.
#[napi]
pub const X11_INPUT_LENGTH: u32 = hash::X11_INPUT_LENGTH as u32;

/// Size of the X11 digest.
#[napi]
pub const X11_OUTPUT_LENGTH: u32 = hash::X11_OUTPUT_LENGTH as u32;

/// Hashes an 80-byte block header with the X11 chain (Blake, BMW, Groestl,
/// Skein, JH, Keccak, Luffa, CubeHash, SHAvite-3, SIMD, ECHO).
#[napi(js_name = "x11Hash")]
pub fn x11_hash(input: Uint8Array) -> Result<Uint8Array, napi::Error> {
    let digest = hash::hash(input.as_ref()).with_js_error()?;

    Ok(Uint8Array::from(digest.to_vec()))
}

/// Hashes a run of 80-byte block headers in a single call, returning the
/// digests concatenated, 32 bytes each.
///
/// Headers arrive from the network in batches of up to 2000, so the call site
/// is a loop that already exists. Hashing them one at a time pays a crossing
/// per header, in and out: measured over 2000 headers that is 0.69 µs of the
/// 6.03 µs a native call costs, but 14.4 µs of the 22.2 µs it costs through
/// WebAssembly, where the crossing costs twice what X11 itself does.
#[napi(js_name = "x11HashMany")]
pub fn x11_hash_many(headers: Uint8Array) -> Result<Uint8Array, napi::Error> {
    let digests = hash::hash_many(headers.as_ref()).with_js_error()?;

    Ok(Uint8Array::from(digests))
}

/// Same as [`x11_hash`], with the header and the digest as hex strings.
#[napi(js_name = "x11HashHex")]
pub fn x11_hash_hex(input: String) -> Result<String, napi::Error> {
    hash::hash_hex(&input).with_js_error()
}
