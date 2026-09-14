pub mod chain;

use napi::bindgen_prelude::Uint8Array;
use napi_derive::napi;

use crate::utils::WithJsError;

/// Size of a compact filter hash, and of a compact filter header.
#[napi]
pub const CFILTER_HEADER_LENGTH: u32 = chain::CFILTER_HEADER_LENGTH as u32;

/// Walks a run of compact filter hashes into the filter headers they chain to,
/// starting from `prev`.
///
/// Every header is the input to the next, so the walk cannot be split into
/// independent pieces the way a batch of hashes can: done here it is one
/// crossing per chunk of blocks rather than one per block. The hashes arrive
/// as 32 bytes each, back to back, and the headers come back the same way.
///
/// `prev` is the filter header of the block before the first hash, in internal
/// (wire) byte order — not the reversed form block explorers display.
#[napi(js_name = "cfilterHeaderChain")]
pub fn cfilter_header_chain(
    prev: Uint8Array,
    filter_hashes: Uint8Array,
) -> Result<Uint8Array, napi::Error> {
    let headers = chain::header_chain(prev.as_ref(), filter_hashes.as_ref()).with_js_error()?;

    Ok(Uint8Array::from(headers))
}

/// Does this filter hash and chain onto `prev` to give `expected`?
///
/// Both digests and the comparison happen in one call, which is what a filter
/// already costs at the boundary. All three byte strings are in internal (wire)
/// byte order.
#[napi(js_name = "cfilterVerify")]
pub fn cfilter_verify(
    filter: Uint8Array,
    prev: Uint8Array,
    expected: Uint8Array,
) -> Result<bool, napi::Error> {
    chain::verify(filter.as_ref(), prev.as_ref(), expected.as_ref()).with_js_error()
}
