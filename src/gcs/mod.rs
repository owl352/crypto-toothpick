pub mod filter;

use napi::bindgen_prelude::{Uint8Array, Uint32Array};
use napi_derive::napi;

use crate::utils::{BigIntString, TryToU64, WithJsError};

/// Golomb-Rice parameter of the basic (type 0) filter, from BIP 158.
#[napi]
pub const BASIC_FILTER_P: u32 = filter::BASIC_FILTER_P as u32;

/// Range multiplier of the basic (type 0) filter, from BIP 158.
#[napi]
pub const BASIC_FILTER_M: u32 = filter::BASIC_FILTER_M as u32;

/// A wallet's watched items, held on the Rust side across a sync.
///
/// The set does not change from block to block, but the filter key does, so
/// every block has to re-hash it. What a block does not have to redo is
/// carrying the items across the boundary: for a wallet watching a thousand
/// scripts that copy is most of the per-block cost, and this pays it once.
#[napi(js_name = "FilterMatcherNAPI")]
pub struct FilterMatcherNAPI {
    items: Vec<Vec<u8>>,
    p: u8,
    m: u64,
}

#[napi]
impl FilterMatcherNAPI {
    #[napi(constructor)]
    pub fn new(
        items: Vec<Uint8Array>,
        p: Option<u32>,
        m: Option<BigIntString>,
    ) -> Result<Self, napi::Error> {
        Ok(FilterMatcherNAPI {
            items: items.iter().map(|item| item.as_ref().to_vec()).collect(),
            p: checked_p(p)?,
            m: checked_m(m)?,
        })
    }

    /// How many items are being watched.
    #[napi(getter)]
    pub fn size(&self) -> u32 {
        self.items.len() as u32
    }

    /// Does this block's filter contain any watched item?
    #[napi(js_name = "matchBlock")]
    pub fn match_block(
        &self,
        filter: Uint8Array,
        block_hash: Uint8Array,
    ) -> Result<bool, napi::Error> {
        let (k0, k1) = filter::filter_key(block_hash.as_ref()).with_js_error()?;

        self.match_with_keys(filter.as_ref(), k0, k1)
    }

    /// Same, keyed directly by the two 64-bit halves.
    #[napi(js_name = "matchBlockWithKeys")]
    pub fn match_block_with_keys(
        &self,
        filter: Uint8Array,
        k0: BigIntString,
        k1: BigIntString,
    ) -> Result<bool, napi::Error> {
        self.match_with_keys(filter.as_ref(), k0.try_to_u64()?, k1.try_to_u64()?)
    }

    /// Does each of these blocks' filters contain any watched item?
    ///
    /// One call for a whole run of blocks: `filters` is every payload laid end
    /// to end, `offsets` marks where each begins (one entry more than there
    /// are blocks), and `blockHashes` is 32 bytes each in the same order. The
    /// answer is one byte per block, 1 for a match.
    ///
    /// Filters arrive one per network message, so a caller has to buffer a run
    /// before it can use this — which delays when a match is known. Worth it
    /// only where the run is already in hand.
    #[napi(js_name = "matchBlockMany")]
    pub fn match_block_many(
        &self,
        filters: Uint8Array,
        offsets: Uint32Array,
        block_hashes: Uint8Array,
    ) -> Result<Uint8Array, napi::Error> {
        // Hoisted out of the loop: `matchBlock` rebuilds this per call, and
        // over a run that copy is most of what batching is meant to remove.
        let items: Vec<&[u8]> = self.items.iter().map(|item| item.as_slice()).collect();

        let matches = filter::match_many(
            filters.as_ref(),
            offsets.as_ref(),
            block_hashes.as_ref(),
            &items,
            self.p,
            self.m,
        )
        .with_js_error()?;

        Ok(Uint8Array::from(matches))
    }

    fn match_with_keys(&self, filter: &[u8], k0: u64, k1: u64) -> Result<bool, napi::Error> {
        let items: Vec<&[u8]> = self.items.iter().map(|item| item.as_slice()).collect();

        filter::match_any(filter, k0, k1, &items, self.p, self.m).with_js_error()
    }
}

fn checked_p(p: Option<u32>) -> Result<u8, napi::Error> {
    match p.unwrap_or(filter::BASIC_FILTER_P as u32) {
        p if p >= 1 && p <= 63 => Ok(p as u8),
        _ => Err(napi::Error::new(
            napi::Status::InvalidArg,
            "golomb parameter out of range",
        )),
    }
}

fn checked_m(m: Option<BigIntString>) -> Result<u64, napi::Error> {
    match m {
        Some(m) => m.try_to_u64(),
        None => Ok(filter::BASIC_FILTER_M),
    }
}

/// Does this block's compact filter contain any of these items?
///
/// One call answers the whole per-block question a wallet asks during sync:
/// the Golomb-Rice set is decoded, every item is hashed under the filter key
/// and mapped into the filter's range, and the two sorted streams are merged —
/// all without crossing back into JS.
///
/// `blockHash` is the 32-byte hash in internal (wire) byte order, not the
/// reversed form block explorers display. `p` and `m` default to the basic
/// filter's parameters.
#[napi(js_name = "gcsMatchAny")]
pub fn gcs_match_any(
    filter: Uint8Array,
    block_hash: Uint8Array,
    items: Vec<Uint8Array>,
    p: Option<u32>,
    m: Option<BigIntString>,
) -> Result<bool, napi::Error> {
    let (k0, k1) = filter::filter_key(block_hash.as_ref()).with_js_error()?;

    gcs_match_any_with_keys(
        filter,
        BigIntString::from_u64(k0),
        BigIntString::from_u64(k1),
        items,
        p,
        m,
    )
}

/// Same as [`gcs_match_any`], keyed directly by the two 64-bit halves rather
/// than by the block hash they are derived from.
#[napi(js_name = "gcsMatchAnyWithKeys")]
pub fn gcs_match_any_with_keys(
    filter: Uint8Array,
    k0: BigIntString,
    k1: BigIntString,
    items: Vec<Uint8Array>,
    p: Option<u32>,
    m: Option<BigIntString>,
) -> Result<bool, napi::Error> {
    let items: Vec<&[u8]> = items.iter().map(|item| item.as_ref()).collect();

    filter::match_any(
        filter.as_ref(),
        k0.try_to_u64()?,
        k1.try_to_u64()?,
        &items,
        checked_p(p)?,
        checked_m(m)?,
    )
    .with_js_error()
}
