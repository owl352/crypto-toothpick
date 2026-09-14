pub mod retarget;
pub mod uint256;

use napi::bindgen_prelude::Uint32Array;
use napi_derive::napi;

use crate::utils::WithJsError;

/// Blocks DarkGravityWave averages its target over, and so the least context
/// every range needs in front of it. The default; see `pastBlocks`.
#[napi]
pub const DGW_PAST_BLOCKS: u32 = retarget::DGW_PAST_BLOCKS as u32;

/// Dash's target block spacing, in seconds.
#[napi]
pub const DGW_TARGET_SPACING: u32 = retarget::DGW_TARGET_SPACING;

/// Dash mainnet's proof-of-work limit, in compact form.
#[napi]
pub const DGW_POW_LIMIT: u32 = retarget::DGW_POW_LIMIT;

/// The nBits every block of a range is expected to carry under DarkGravityWave
/// v3, given the `contextBlocks` entries that precede it.
///
/// `times` and `nbits` run oldest first over one contiguous run of headers, and
/// are the same length; the leading `contextBlocks` entries seed the averaging
/// window and get no answer of their own, so the result holds
/// `times.length - contextBlocks` values. Batched this way a whole mainnet sync
/// is ~1150 calls rather than 2.3M, which is what keeps it worth crossing the
/// boundary for on the WebAssembly surface as well as the native one.
///
/// All of it is u256 integer arithmetic, so both surfaces agree by
/// construction. The era dispatch — calling this only where v3 governs — and
/// the comparison against what a header really carries stay with the caller.
///
/// `powLimit`, `targetSpacing` and `pastBlocks` default to Dash's. The first
/// two vary between Dash's own networks; the window does not, and only a
/// DGW-derived chain that chose a different one should be overriding it.
/// `contextBlocks` may be larger than `pastBlocks`, never smaller.
#[napi(js_name = "dgwNextBitsRange")]
pub fn dgw_next_bits_range(
    times: Uint32Array,
    nbits: Uint32Array,
    context_blocks: u32,
    pow_limit: Option<u32>,
    target_spacing: Option<u32>,
    past_blocks: Option<u32>,
) -> Result<Uint32Array, napi::Error> {
    let expected = retarget::next_bits_range(
        times.as_ref(),
        nbits.as_ref(),
        context_blocks as usize,
        pow_limit.unwrap_or(retarget::DGW_POW_LIMIT),
        target_spacing.unwrap_or(retarget::DGW_TARGET_SPACING),
        past_blocks.map_or(retarget::DGW_PAST_BLOCKS, |blocks| blocks as usize),
    )
    .with_js_error()?;

    Ok(Uint32Array::new(expected))
}
