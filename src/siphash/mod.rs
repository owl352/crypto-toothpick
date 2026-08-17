pub mod hash;

use napi::bindgen_prelude::Uint8Array;
use napi_derive::napi;

use crate::utils::{BigIntString, TryToU64, WithJsError};

/// Size of a SipHash key: two 64-bit halves, little-endian.
#[napi]
pub const SIPHASH24_KEY_LENGTH: u32 = hash::SIPHASH24_KEY_LENGTH as u32;

/// Size of the SipHash-2-4 digest.
#[napi]
pub const SIPHASH24_OUTPUT_LENGTH: u32 = hash::SIPHASH24_OUTPUT_LENGTH as u32;

/// SipHash-2-4 under a 16-byte key, as Bitcoin and Dash use it (BIP 158 filter
/// matching, BIP 152 short ids). The digest is the little-endian bytes of the
/// 64-bit result, the order those protocols serialize it in.
#[napi(js_name = "siphash24")]
pub fn siphash24(key: Uint8Array, data: Uint8Array) -> Result<Uint8Array, napi::Error> {
    let digest = hash::siphash24_bytes(key.as_ref(), data.as_ref()).with_js_error()?;

    Ok(Uint8Array::from(digest.to_vec()))
}

/// Same as [`siphash24`], with the key, the data and the digest as hex strings.
#[napi(js_name = "siphash24Hex")]
pub fn siphash24_hex(key: String, data: String) -> Result<String, napi::Error> {
    hash::siphash24_hex(&key, &data).with_js_error()
}

/// Same as [`siphash24`], keyed by the two 64-bit halves and returning the
/// 64-bit result — the shape BIP 158 filter matching works in.
#[napi(js_name = "siphash24WithKeys")]
pub fn siphash24_with_keys(
    k0: BigIntString,
    k1: BigIntString,
    data: Uint8Array,
) -> Result<BigIntString, napi::Error> {
    let digest = hash::siphash24_with_keys(k0.try_to_u64()?, k1.try_to_u64()?, data.as_ref());

    Ok(BigIntString::from_u64(digest))
}
