use super::uint256::U256;
use crate::error::HashError;

/// Blocks DarkGravityWave averages its target over on every Dash network.
///
/// Unlike the pow limit and the spacing this does not vary between mainnet,
/// testnet, devnet and regtest — it is the default rather than a setting, and
/// a chain that inherited DGW with a different window is the only reason to
/// override it.
pub const DGW_PAST_BLOCKS: usize = 24;

/// Dash's target block spacing, in seconds.
pub const DGW_TARGET_SPACING: u32 = 150;

/// Dash mainnet's proof-of-work limit in compact form,
/// `00000fffff000000000000000000000000000000000000000000000000000000`.
pub const DGW_POW_LIMIT: u32 = 0x1e0f_ffff;

/// Decodes a compact target, rejecting the three forms Dash Core's own
/// `CheckProofOfWork` rejects: negative, overflowing, and zero.
fn target_of(compact: u32) -> Result<U256, HashError> {
    let (target, negative, overflow) = U256::from_compact(compact);

    if negative || overflow || target == U256::ZERO {
        return Err(HashError::InvalidTarget(compact));
    }

    Ok(target)
}

/// The nBits the block after `last` is expected to carry.
///
/// `last` indexes the newest block of the window — the one a validator would
/// call `pindexLast` — and the window reaches back [`DGW_PAST_BLOCKS`] entries
/// from there.
fn next_bits(
    times: &[u32],
    nbits: &[u32],
    last: usize,
    pow_limit: U256,
    target_timespan: i64,
    past_blocks: usize,
) -> Result<u32, HashError> {
    // A weighted running average of the window's targets, newest first. It is
    // not a mean — each step folds the next target in against the count so far
    // — and Dash Core's own comment says as much. Reproducing the weighting is
    // the point: this is consensus, not an approximation of it.
    let mut average = U256::ZERO;

    for count in 1..=past_blocks {
        let target = target_of(nbits[last + 1 - count])?;

        average = if count == 1 {
            target
        } else {
            average
                .mul_u64(count as u64)
                .add(target)
                .div_u64(count as u64 + 1)
        };
    }

    // The walk stops one block short of the window it averaged, so the span
    // covers `past_blocks - 1` intervals rather than `past_blocks`. That
    // off-by-one is in the deployed rule, which makes it the correct answer.
    let oldest = last + 1 - past_blocks;
    let mut actual = i64::from(times[last]) - i64::from(times[oldest]);

    // Timestamps are not monotonic, so the span can come out negative; the
    // lower clamp is what catches that.
    if actual < target_timespan / 3 {
        actual = target_timespan / 3;
    }

    if actual > target_timespan * 3 {
        actual = target_timespan * 3;
    }

    let next = average
        .mul_u64(actual as u64)
        .div_u64(target_timespan as u64);

    Ok(if next > pow_limit { pow_limit } else { next }.to_compact())
}

/// The nBits every block of a range is expected to carry, given the
/// `context_blocks` entries that precede it.
///
/// `times` and `nbits` run oldest first and describe one contiguous run of
/// headers: the leading `context_blocks` entries are there only to seed the
/// averaging window, and the answer covers everything after them. Headers
/// arrive up to 2000 at a time, so a whole mainnet sync is ~1150 calls rather
/// than 2.3M.
///
/// `context_blocks` may exceed `past_blocks` — the extra lead-in is simply not
/// answered for — but it can never be smaller, or the first window would reach
/// back past the start of the data.
///
/// Only call this where DarkGravityWave v3 actually governs: the era dispatch,
/// and the comparison against what a header really carries, stay with the
/// caller.
pub fn next_bits_range(
    times: &[u32],
    nbits: &[u32],
    context_blocks: usize,
    pow_limit: u32,
    target_spacing: u32,
    past_blocks: usize,
) -> Result<Vec<u32>, HashError> {
    if times.len() != nbits.len() {
        return Err(HashError::Mismatched {
            left: "times",
            right: "nbits",
            left_len: times.len(),
            right_len: nbits.len(),
        });
    }

    if past_blocks == 0 {
        return Err(HashError::NotEnough {
            subject: "past blocks",
            needed: 1,
            actual: 0,
        });
    }

    // Both of these are caller-supplied, so a silly pair must not be allowed
    // to wrap the span arithmetic into a wrong answer. Checked before the
    // shape of the data, so an impossible window is reported as one rather
    // than as a shortage of context.
    let target_timespan = i64::try_from(past_blocks)
        .ok()
        .and_then(|blocks| blocks.checked_mul(i64::from(target_spacing)))
        .filter(|span| span.checked_mul(3).is_some())
        .ok_or(HashError::SpanOverflow {
            past_blocks,
            target_spacing,
        })?;

    // The window reaches `past_blocks` back from the entry before the first
    // answer, so anything less would index before the start of the data.
    if context_blocks < past_blocks {
        return Err(HashError::NotEnough {
            subject: "context blocks",
            needed: past_blocks,
            actual: context_blocks,
        });
    }

    if times.len() < context_blocks {
        return Err(HashError::NotEnough {
            subject: "times",
            needed: context_blocks,
            actual: times.len(),
        });
    }

    if target_spacing == 0 {
        return Err(HashError::NotEnough {
            subject: "target spacing (seconds)",
            needed: 1,
            actual: 0,
        });
    }

    let limit = target_of(pow_limit)?;

    (context_blocks..times.len())
        .map(|at| next_bits(times, nbits, at - 1, limit, target_timespan, past_blocks))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A target small enough to do the whole retarget in `u128`, so the
    /// expectations below come from arithmetic that shares nothing with the
    /// u256 code under test.
    const SMALL_BITS: u32 = 0x0500_9234;
    const SMALL_TARGET: u64 = 0x9234_0000;

    const TIMESPAN: i64 = DGW_PAST_BLOCKS as i64 * DGW_TARGET_SPACING as i64;

    /// The same rule again in `u128`: the weighted running average, the clamp,
    /// and the ratio. Only valid while every target fits in 64 bits.
    fn reference(times: &[u32], nbits_as_targets: &[u64], last: usize, past_blocks: usize) -> u64 {
        let mut average = 0u128;

        for count in 1..=past_blocks {
            let target = nbits_as_targets[last + 1 - count] as u128;

            average = if count == 1 {
                target
            } else {
                (average * count as u128 + target) / (count as u128 + 1)
            };
        }

        let oldest = last + 1 - past_blocks;
        let mut actual = i64::from(times[last]) - i64::from(times[oldest]);
        let timespan = past_blocks as i64 * DGW_TARGET_SPACING as i64;

        actual = actual.clamp(timespan / 3, timespan * 3);

        (average * actual as u128 / timespan as u128) as u64
    }

    fn compact(value: u64) -> u32 {
        U256::from_u64(value).to_compact()
    }

    fn window(bits: u32, spacing: u32) -> (Vec<u32>, Vec<u32>) {
        let times = (0..DGW_PAST_BLOCKS as u32).map(|at| 1_500_000_000 + at * spacing);

        (times.collect(), vec![bits; DGW_PAST_BLOCKS])
    }

    fn bits_of(times: &[u32], nbits: &[u32]) -> u32 {
        next_bits(
            times,
            nbits,
            times.len() - 1,
            U256::from_compact(DGW_POW_LIMIT).0,
            TIMESPAN,
            DGW_PAST_BLOCKS,
        )
        .unwrap()
    }

    /// `next_bits_range` with Dash's defaults, so a test only spells out what
    /// it is actually varying.
    fn range(times: &[u32], nbits: &[u32], context_blocks: usize) -> Result<Vec<u32>, HashError> {
        next_bits_range(
            times,
            nbits,
            context_blocks,
            DGW_POW_LIMIT,
            DGW_TARGET_SPACING,
            DGW_PAST_BLOCKS,
        )
    }

    #[test]
    fn a_window_of_equal_targets_averages_to_that_target() {
        let (times, nbits) = window(SMALL_BITS, DGW_TARGET_SPACING);
        // 23 intervals across a 24-block window, so a chain running exactly on
        // time still reads slightly fast and the target tightens a little.
        let expected = SMALL_TARGET as u128 * 3450 / 3600;

        assert_eq!(bits_of(&times, &nbits), compact(expected as u64));
    }

    #[test]
    fn matches_the_u128_reference_across_mixed_windows() {
        // A deterministic spread of targets and spacings; nothing here is
        // tuned to the implementation.
        let mut seed = 0x2545_f491_4f6c_dd1du64;
        let mut next = move || {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            seed
        };

        for _ in 0..200 {
            let targets: Vec<u64> = (0..DGW_PAST_BLOCKS)
                .map(|_| (next() >> 34).max(1) << 8)
                .collect();
            let times: Vec<u32> = (0..DGW_PAST_BLOCKS)
                .scan(1_500_000_000u32, |at, _| {
                    *at = at.wrapping_add((next() % 600) as u32);
                    Some(*at)
                })
                .collect();

            let nbits: Vec<u32> = targets.iter().map(|target| compact(*target)).collect();
            // compact encoding is lossy, so the reference has to run on what
            // the headers actually carry, not on the values they were made from
            let carried: Vec<u64> = nbits.iter().map(|bits| decoded(*bits)).collect();

            assert_eq!(
                bits_of(&times, &nbits),
                compact(reference(
                    &times,
                    &carried,
                    DGW_PAST_BLOCKS - 1,
                    DGW_PAST_BLOCKS
                ))
            );
        }
    }

    /// The target a compact encoding decodes to, as a plain `u64`. Every target
    /// in these tests is built to fit in 64 bits.
    fn decoded(bits: u32) -> u64 {
        let value = U256::from_compact(bits).0;

        assert!(value.bits() <= 64, "test target does not fit in 64 bits");

        value.low_u64()
    }

    #[test]
    fn clamps_a_span_that_is_too_short() {
        let (times, nbits) = window(SMALL_BITS, 0);
        let expected = SMALL_TARGET as u128 * (TIMESPAN / 3) as u128 / TIMESPAN as u128;

        assert_eq!(bits_of(&times, &nbits), compact(expected as u64));
    }

    #[test]
    fn clamps_a_span_that_is_too_long() {
        let (times, nbits) = window(SMALL_BITS, DGW_TARGET_SPACING * 100);
        let expected = SMALL_TARGET as u128 * (TIMESPAN * 3) as u128 / TIMESPAN as u128;

        assert_eq!(bits_of(&times, &nbits), compact(expected as u64));
    }

    #[test]
    fn survives_timestamps_that_go_backwards() {
        let (mut times, nbits) = window(SMALL_BITS, DGW_TARGET_SPACING);

        times.reverse();

        // a negative span falls to the lower clamp rather than wrapping
        let expected = SMALL_TARGET as u128 * (TIMESPAN / 3) as u128 / TIMESPAN as u128;

        assert_eq!(bits_of(&times, &nbits), compact(expected as u64));
    }

    #[test]
    fn never_goes_easier_than_the_pow_limit() {
        let (times, nbits) = window(DGW_POW_LIMIT, DGW_TARGET_SPACING * 100);

        assert_eq!(bits_of(&times, &nbits), DGW_POW_LIMIT);
    }

    #[test]
    fn answers_one_block_per_range_entry() {
        let (mut times, mut nbits) = window(DGW_POW_LIMIT, DGW_TARGET_SPACING);

        for at in 0..10 {
            times.push(times[times.len() - 1] + DGW_TARGET_SPACING);
            nbits.push(DGW_POW_LIMIT - at);
        }

        let expected = range(&times, &nbits, DGW_PAST_BLOCKS).unwrap();

        assert_eq!(expected.len(), times.len() - DGW_PAST_BLOCKS);
    }

    #[test]
    fn each_range_entry_matches_its_own_window() {
        let (mut times, mut nbits) = window(SMALL_BITS, DGW_TARGET_SPACING);

        for at in 0..30u32 {
            times.push(times[times.len() - 1] + 100 + at * 7);
            nbits.push(compact(SMALL_TARGET - u64::from(at) * 0x10_0000));
        }

        let expected = range(&times, &nbits, DGW_PAST_BLOCKS).unwrap();

        for (at, bits) in expected.iter().enumerate() {
            let last = DGW_PAST_BLOCKS + at - 1;

            assert_eq!(
                *bits,
                next_bits(
                    &times,
                    &nbits,
                    last,
                    U256::from_compact(DGW_POW_LIMIT).0,
                    TIMESPAN,
                    DGW_PAST_BLOCKS
                )
                .unwrap(),
                "range entry {at}"
            );
        }
    }

    #[test]
    fn answers_nothing_for_a_range_of_nothing() {
        let (times, nbits) = window(DGW_POW_LIMIT, DGW_TARGET_SPACING);

        assert_eq!(
            range(&times, &nbits, DGW_PAST_BLOCKS).unwrap(),
            Vec::<u32>::new()
        );
    }

    #[test]
    fn averages_over_a_window_of_the_size_it_was_given() {
        let mut seed = 0x1234_5678_9abc_def0u64;
        let mut next = move || {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            seed
        };

        for past_blocks in [1usize, 2, 5, 24, 50] {
            let targets: Vec<u64> = (0..past_blocks)
                .map(|_| (next() >> 34).max(1) << 8)
                .collect();
            let times: Vec<u32> = (0..past_blocks)
                .scan(1_500_000_000u32, |at, _| {
                    *at = at.wrapping_add((next() % 600) as u32);
                    Some(*at)
                })
                .collect();

            let nbits: Vec<u32> = targets.iter().map(|target| compact(*target)).collect();
            let carried: Vec<u64> = nbits.iter().map(|bits| decoded(*bits)).collect();

            let got = next_bits(
                &times,
                &nbits,
                past_blocks - 1,
                U256::from_compact(DGW_POW_LIMIT).0,
                past_blocks as i64 * DGW_TARGET_SPACING as i64,
                past_blocks,
            )
            .unwrap();

            assert_eq!(
                got,
                compact(reference(&times, &carried, past_blocks - 1, past_blocks)),
                "window of {past_blocks}"
            );
        }
    }

    #[test]
    fn a_different_window_gives_a_different_answer() {
        let (mut times, mut nbits) = window(SMALL_BITS, DGW_TARGET_SPACING);

        for at in 0..20u32 {
            times.push(times[times.len() - 1] + 40 + at * 11);
            nbits.push(compact(SMALL_TARGET - u64::from(at) * 0x20_0000));
        }

        let standard = range(&times, &nbits, DGW_PAST_BLOCKS).unwrap();
        let narrow = next_bits_range(
            &times,
            &nbits,
            DGW_PAST_BLOCKS,
            DGW_POW_LIMIT,
            DGW_TARGET_SPACING,
            6,
        )
        .unwrap();

        assert_eq!(standard.len(), narrow.len());
        assert_ne!(standard, narrow);
    }

    #[test]
    fn allows_more_context_than_the_window_needs() {
        let (mut times, mut nbits) = window(SMALL_BITS, DGW_TARGET_SPACING);

        for at in 0..20u32 {
            times.push(times[times.len() - 1] + 90 + at * 3);
            nbits.push(compact(SMALL_TARGET - u64::from(at) * 0x8_0000));
        }

        // extra lead-in changes where the answers start, never what they are
        let whole = range(&times, &nbits, DGW_PAST_BLOCKS).unwrap();
        let later = range(&times, &nbits, DGW_PAST_BLOCKS + 7).unwrap();

        assert_eq!(later, whole[7..]);
    }

    #[test]
    fn rejects_a_window_of_nothing() {
        let (times, nbits) = window(DGW_POW_LIMIT, DGW_TARGET_SPACING);

        assert_eq!(
            next_bits_range(
                &times,
                &nbits,
                DGW_PAST_BLOCKS,
                DGW_POW_LIMIT,
                DGW_TARGET_SPACING,
                0
            ),
            Err(HashError::NotEnough {
                subject: "past blocks",
                needed: 1,
                actual: 0
            })
        );
    }

    #[test]
    fn rejects_less_context_than_the_window_needs() {
        let (times, nbits) = window(DGW_POW_LIMIT, DGW_TARGET_SPACING);

        assert_eq!(
            next_bits_range(
                &times,
                &nbits,
                DGW_PAST_BLOCKS,
                DGW_POW_LIMIT,
                DGW_TARGET_SPACING,
                DGW_PAST_BLOCKS + 1
            ),
            Err(HashError::NotEnough {
                subject: "context blocks",
                needed: DGW_PAST_BLOCKS + 1,
                actual: DGW_PAST_BLOCKS
            })
        );
    }

    #[test]
    fn rejects_a_span_too_long_to_measure() {
        let (times, nbits) = window(DGW_POW_LIMIT, DGW_TARGET_SPACING);

        assert_eq!(
            next_bits_range(
                &times,
                &nbits,
                DGW_PAST_BLOCKS,
                DGW_POW_LIMIT,
                u32::MAX,
                usize::MAX
            ),
            Err(HashError::SpanOverflow {
                past_blocks: usize::MAX,
                target_spacing: u32::MAX
            })
        );
    }

    #[test]
    fn rejects_inputs_of_different_lengths() {
        let (times, nbits) = window(DGW_POW_LIMIT, DGW_TARGET_SPACING);

        assert_eq!(
            range(&times[..23], &nbits, DGW_PAST_BLOCKS),
            Err(HashError::Mismatched {
                left: "times",
                right: "nbits",
                left_len: 23,
                right_len: 24
            })
        );
    }

    #[test]
    fn rejects_a_context_too_short_to_seed_the_window() {
        let (times, nbits) = window(DGW_POW_LIMIT, DGW_TARGET_SPACING);

        assert_eq!(
            range(&times, &nbits, 23),
            Err(HashError::NotEnough {
                subject: "context blocks",
                needed: DGW_PAST_BLOCKS,
                actual: 23
            })
        );
    }

    #[test]
    fn rejects_targets_no_header_could_carry() {
        // zero, negative, and overflowing: the three CheckProofOfWork rejects
        for bad in [0x0000_0000u32, 0x0492_3456, 0x2312_3456] {
            let (mut times, mut nbits) = window(DGW_POW_LIMIT, DGW_TARGET_SPACING);

            times.push(times[times.len() - 1] + DGW_TARGET_SPACING);
            nbits.push(DGW_POW_LIMIT);
            nbits[0] = bad;

            assert_eq!(
                range(&times, &nbits, DGW_PAST_BLOCKS),
                Err(HashError::InvalidTarget(bad)),
                "nBits {bad:#010x}"
            );
        }
    }

    #[test]
    fn rejects_a_pow_limit_no_chain_could_use() {
        let (times, nbits) = window(DGW_POW_LIMIT, DGW_TARGET_SPACING);

        assert_eq!(
            next_bits_range(
                &times,
                &nbits,
                DGW_PAST_BLOCKS,
                0,
                DGW_TARGET_SPACING,
                DGW_PAST_BLOCKS
            ),
            Err(HashError::InvalidTarget(0))
        );
    }

    #[test]
    fn rejects_a_spacing_of_zero() {
        let (times, nbits) = window(DGW_POW_LIMIT, DGW_TARGET_SPACING);

        assert!(
            next_bits_range(
                &times,
                &nbits,
                DGW_PAST_BLOCKS,
                DGW_POW_LIMIT,
                0,
                DGW_PAST_BLOCKS
            )
            .is_err()
        );
    }

    #[test]
    fn error_messages_say_what_was_wrong() {
        let (times, nbits) = window(DGW_POW_LIMIT, DGW_TARGET_SPACING);

        assert_eq!(
            range(&times, &nbits, 10).unwrap_err().to_string(),
            "context blocks must be at least 24 entries, got 10"
        );
        assert_eq!(
            HashError::InvalidTarget(0x0492_3456).to_string(),
            "nBits 0x04923456 is not a valid target"
        );
    }
}
