/// A 256-bit unsigned integer, in the shape Bitcoin and Dash use for
/// proof-of-work targets: four 64-bit limbs, least significant first.
///
/// Arithmetic wraps on overflow and division truncates, which is what
/// `arith_uint256` does — a retarget that agrees with the network has to agree
/// with its rounding, not with what the arithmetic ought to be.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct U256([u64; 4]);

/// Widest value a compact encoding's mantissa can hold.
const MANTISSA_MASK: u32 = 0x007f_ffff;

/// The bit a mantissa sets when it would otherwise read as negative.
const SIGN_BIT: u32 = 0x0080_0000;

impl U256 {
    pub const ZERO: U256 = U256([0; 4]);

    pub fn from_u64(value: u64) -> U256 {
        U256([value, 0, 0, 0])
    }

    /// Decodes a compact ("nBits") target, the way `SetCompact` does.
    ///
    /// The sign and overflow flags the C++ version reports through out
    /// parameters come back in the tuple: a negative or overflowing mantissa is
    /// not a target any header should carry, and the caller rejects it rather
    /// than retargeting off a nonsense value.
    pub fn from_compact(compact: u32) -> (U256, bool, bool) {
        let size = compact >> 24;
        let mut word = compact & MANTISSA_MASK;

        // `SetCompact` shifts the mantissa down for a small exponent and then
        // tests *that* value for the sign, so a mantissa that shifts away to
        // nothing is not negative however its sign bit reads.
        let value = if size <= 3 {
            word >>= 8 * (3 - size);
            U256::from_u64(word as u64)
        } else {
            U256::from_u64(word as u64).shl(8 * (size - 3))
        };

        let negative = word != 0 && (compact & SIGN_BIT) != 0;
        let overflow =
            word != 0 && (size > 34 || (word > 0xff && size > 33) || (word > 0xffff && size > 32));

        (value, negative, overflow)
    }

    /// Encodes the target back into its compact form, the way `GetCompact`
    /// does. Never negative: nothing here produces a negative target.
    pub fn to_compact(self) -> u32 {
        let mut size = (self.bits() + 7) / 8;

        let mut compact = if size <= 3 {
            (self.0[0] as u32) << (8 * (3 - size))
        } else {
            self.shr(8 * (size - 3)).0[0] as u32
        };

        // A mantissa that would read as negative is shifted down a byte and the
        // exponent raised to match.
        if compact & SIGN_BIT != 0 {
            compact >>= 8;
            size += 1;
        }

        compact | (size << 24)
    }

    /// The least significant 64 bits.
    pub fn low_u64(self) -> u64 {
        self.0[0]
    }

    /// Position of the highest set bit, counting from one; zero for zero.
    pub fn bits(self) -> u32 {
        for (index, limb) in self.0.iter().enumerate().rev() {
            if *limb != 0 {
                return (index as u32) * 64 + (64 - limb.leading_zeros());
            }
        }

        0
    }

    pub fn shl(self, shift: u32) -> U256 {
        if shift >= 256 {
            return U256::ZERO;
        }

        let (limbs, bits) = ((shift / 64) as usize, shift % 64);
        let mut out = [0u64; 4];

        for index in 0..4 {
            if index + limbs < 4 {
                out[index + limbs] |= self.0[index] << bits;
            }

            // A shift of 64 is undefined in Rust as much as in C, so the
            // carry into the next limb is spelled out separately.
            if bits > 0 && index + limbs + 1 < 4 {
                out[index + limbs + 1] |= self.0[index] >> (64 - bits);
            }
        }

        U256(out)
    }

    pub fn shr(self, shift: u32) -> U256 {
        if shift >= 256 {
            return U256::ZERO;
        }

        let (limbs, bits) = ((shift / 64) as usize, shift % 64);
        let mut out = [0u64; 4];

        for index in 0..4 {
            if index >= limbs {
                out[index - limbs] |= self.0[index] >> bits;
            }

            if bits > 0 && index >= limbs + 1 {
                out[index - limbs - 1] |= self.0[index] << (64 - bits);
            }
        }

        U256(out)
    }

    /// Wrapping addition, as `arith_uint256` does it.
    pub fn add(self, other: U256) -> U256 {
        let mut out = [0u64; 4];
        let mut carry = 0u64;

        for index in 0..4 {
            let (sum, first) = self.0[index].overflowing_add(other.0[index]);
            let (sum, second) = sum.overflowing_add(carry);

            out[index] = sum;
            carry = u64::from(first) + u64::from(second);
        }

        U256(out)
    }

    /// Wrapping multiplication by a 64-bit scalar. Every multiplier a retarget
    /// applies is small — the block count, or a clamped timespan — so the
    /// 256x256 case never arises.
    pub fn mul_u64(self, scalar: u64) -> U256 {
        let mut out = [0u64; 4];
        let mut carry = 0u128;

        for index in 0..4 {
            let wide = self.0[index] as u128 * scalar as u128 + carry;

            out[index] = wide as u64;
            carry = wide >> 64;
        }

        U256(out)
    }

    /// Truncating division by a 64-bit scalar.
    pub fn div_u64(self, divisor: u64) -> U256 {
        debug_assert!(divisor != 0, "retarget never divides by zero");

        let mut out = [0u64; 4];
        let mut remainder = 0u128;

        for index in (0..4).rev() {
            let current = (remainder << 64) | self.0[index] as u128;

            out[index] = (current / divisor as u128) as u64;
            remainder = current % divisor as u128;
        }

        U256(out)
    }
}

impl PartialOrd for U256 {
    fn partial_cmp(&self, other: &U256) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for U256 {
    /// Most significant limb first — the derived order would compare the least
    /// significant one first and get this backwards.
    fn cmp(&self, other: &U256) -> std::cmp::Ordering {
        for index in (0..4).rev() {
            match self.0[index].cmp(&other.0[index]) {
                std::cmp::Ordering::Equal => continue,
                ordering => return ordering,
            }
        }

        std::cmp::Ordering::Equal
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Dash mainnet's proof-of-work limit, `00000fffff000000…`.
    const POW_LIMIT: u32 = 0x1e0f_ffff;

    #[test]
    fn decodes_the_reference_compact_vectors() {
        // From Bitcoin's arith_uint256 tests: mantissa, then what it decodes to
        // as a plain 64-bit value.
        for (compact, value) in [
            (0x0112_3456u32, 0x12u64),
            (0x0212_3456, 0x1234),
            (0x0312_3456, 0x12_3456),
            (0x0412_3456, 0x1234_5600),
            (0x0500_9234, 0x9234_0000),
        ] {
            assert_eq!(
                U256::from_compact(compact).0,
                U256::from_u64(value),
                "compact {compact:#010x}"
            );
        }
    }

    #[test]
    fn decodes_a_mantissa_of_zero_to_zero() {
        for compact in [
            0x0012_3456u32,
            0x0100_3456,
            0x0200_0056,
            0x0300_0000,
            0x0400_0000,
        ] {
            assert_eq!(U256::from_compact(compact).0, U256::ZERO);
        }
    }

    #[test]
    fn round_trips_the_canonical_compact_forms() {
        for compact in [
            0x0312_3456u32,
            0x0412_3456,
            0x0500_9234,
            0x2012_3456,
            0x1d00_ffff, // bitcoin's genesis target
            POW_LIMIT,
        ] {
            assert_eq!(U256::from_compact(compact).0.to_compact(), compact);
        }
    }

    #[test]
    fn renormalises_a_mantissa_that_would_read_as_negative() {
        // 0x92340000 needs its top mantissa bit clear, so the encoder shifts it
        // down a byte and raises the exponent: 0x04923400 would be negative.
        assert_eq!(U256::from_u64(0x9234_0000).to_compact(), 0x0500_9234);
    }

    #[test]
    fn flags_a_negative_mantissa() {
        assert!(U256::from_compact(0x0492_3456).1);
        assert!(!U256::from_compact(0x0412_3456).1);
        // this mantissa shifts away to nothing, so it is not negative either
        assert!(!U256::from_compact(0x0180_3456).1);
        assert_eq!(U256::from_compact(0x0180_3456).0, U256::ZERO);
    }

    #[test]
    fn flags_an_overflowing_mantissa() {
        assert!(U256::from_compact(0x2312_3456).2);
        assert!(U256::from_compact(0x2200_3456).2);
        assert!(!U256::from_compact(0x2012_3456).2);
        assert!(!U256::from_compact(POW_LIMIT).2);
    }

    #[test]
    fn decodes_the_dash_pow_limit() {
        // 00000fffff000000000000000000000000000000000000000000000000000000
        let limit = U256::from_compact(POW_LIMIT).0;

        assert_eq!(limit.bits(), 236);
        assert_eq!(limit, U256::from_u64(0x0f_ffff).shl(8 * 27));
    }

    #[test]
    fn counts_bits() {
        assert_eq!(U256::ZERO.bits(), 0);
        assert_eq!(U256::from_u64(1).bits(), 1);
        assert_eq!(U256::from_u64(u64::MAX).bits(), 64);
        assert_eq!(U256::from_u64(1).shl(255).bits(), 256);
    }

    #[test]
    fn shifts_in_both_directions() {
        let value = U256::from_u64(0x1234_5678);

        assert_eq!(value.shl(64).shr(64), value);
        assert_eq!(value.shl(200).shr(200), value);
        assert_eq!(value.shl(256), U256::ZERO);
        assert_eq!(value.shr(256), U256::ZERO);
        // shifted past the top, the bits that fell off are gone: only the six
        // that still fit come back
        assert_eq!(value.shl(250).shr(250), U256::from_u64(0x1234_5678 & 0x3f));
    }

    #[test]
    fn adds_across_limb_boundaries() {
        let max = U256::from_u64(u64::MAX);

        assert_eq!(max.add(U256::from_u64(1)), U256::from_u64(1).shl(64));
        assert_eq!(U256::ZERO.add(max), max);
    }

    #[test]
    fn multiplies_across_limb_boundaries() {
        // u64::MAX * 2 is 2^65 - 2, which straddles the first limb boundary
        assert_eq!(
            U256::from_u64(u64::MAX).mul_u64(2),
            U256([0xffff_ffff_ffff_fffe, 1, 0, 0])
        );
        assert_eq!(U256::from_u64(1).shl(64).mul_u64(3), U256([0, 3, 0, 0]));
    }

    #[test]
    fn multiplication_wraps_past_the_top() {
        // arith_uint256 wraps rather than saturating, and so does this
        assert_eq!(U256::from_u64(1).shl(255).mul_u64(2), U256::ZERO);
    }

    #[test]
    fn multiplication_and_division_invert_each_other() {
        let limit = U256::from_compact(POW_LIMIT).0;

        for scalar in [1u64, 2, 3, 24, 25, 1200, 3600, 10800] {
            assert_eq!(limit.mul_u64(scalar).div_u64(scalar), limit);
        }
    }

    #[test]
    fn divides_truncating() {
        assert_eq!(U256::from_u64(7).div_u64(2), U256::from_u64(3));
        assert_eq!(U256::from_u64(1).div_u64(2), U256::ZERO);
    }

    #[test]
    fn applies_a_retarget_ratio() {
        // the clamped extremes: three times slower, three times faster
        let limit = U256::from_compact(POW_LIMIT).0;

        assert_eq!(limit.mul_u64(10800).div_u64(3600), limit.mul_u64(3));
        assert_eq!(limit.mul_u64(1200).div_u64(3600), limit.div_u64(3));
    }

    #[test]
    fn orders_by_the_most_significant_limb_first() {
        let small = U256::from_u64(u64::MAX);
        let large = U256::from_u64(1).shl(64);

        assert!(small < large);
        assert!(large > small);
        assert_eq!(small.cmp(&small), std::cmp::Ordering::Equal);
        assert!(U256::from_compact(0x2012_3456).0 > U256::from_compact(POW_LIMIT).0);
    }
}
