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

/// Same as [`x11_hash`], with the header and the digest as hex strings.
#[napi(js_name = "x11HashHex")]
pub fn x11_hash_hex(input: String) -> Result<String, napi::Error> {
    hash::hash_hex(&input).with_js_error()
}
