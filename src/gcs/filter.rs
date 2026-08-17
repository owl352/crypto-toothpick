use crate::error::{HashError, check_length};
use crate::siphash::hash::siphash24_with_keys;

/// Golomb-Rice parameter of the basic (type 0) filter, from BIP 158.
pub const BASIC_FILTER_P: u8 = 19;

/// Range multiplier of the basic (type 0) filter, from BIP 158.
pub const BASIC_FILTER_M: u64 = 784_931;

/// Length of the block hash the filter key is derived from.
pub const BLOCK_HASH_LENGTH: usize = 32;

/// Derives the filter's SipHash key: the first 16 bytes of the block hash in
/// internal (wire) byte order, as two little-endian halves.
pub fn filter_key(block_hash: &[u8]) -> Result<(u64, u64), HashError> {
    check_length("block hash", BLOCK_HASH_LENGTH, block_hash)?;

    let k0 = u64::from_le_bytes(block_hash[..8].try_into().expect("8 bytes"));
    let k1 = u64::from_le_bytes(block_hash[8..16].try_into().expect("8 bytes"));

    Ok((k0, k1))
}

/// Maps a value into the filter's range, `(hash * f) >> 64`, in the wide
/// arithmetic BIP 158 specifies.
fn scale(hash: u64, f: u64) -> u64 {
    ((hash as u128 * f as u128) >> 64) as u64
}

/// Golomb-Rice codes are read bit by bit, which is where a decode spends most
/// of its time. This keeps a 64-bit window of upcoming bits, MSB first, so a
/// P-bit remainder is one shift and the unary quotient is one `leading_zeros`,
/// rather than a loop per bit.
struct BitReader<'a> {
    buf: &'a [u8],
    pos: usize,
    window: u64,
    bits: u32,
}

const QUOTIENT_LIMIT: u64 = 1 << 20;

impl<'a> BitReader<'a> {
    fn new(buf: &'a [u8]) -> Self {
        BitReader {
            buf,
            pos: 0,
            window: 0,
            bits: 0,
        }
    }

    #[inline]
    fn refill(&mut self) {
        while self.bits <= 56 {
            let Some(&byte) = self.buf.get(self.pos) else {
                break;
            };

            self.window |= (byte as u64) << (56 - self.bits);
            self.pos += 1;
            self.bits += 8;
        }
    }

    /// Drops `count` bits off the front of the window. `count` may be 64, which
    /// a plain shift would not survive.
    #[inline]
    fn consume(&mut self, count: u32) {
        if count >= 64 {
            self.window = 0;
        } else {
            self.window <<= count;
        }

        self.bits -= count;
    }

    #[inline]
    fn read_bits(&mut self, count: u32) -> Result<u64, HashError> {
        if count == 0 {
            return Ok(0);
        }

        self.refill();

        if self.bits < count {
            return Err(HashError::MalformedFilter("bit reader past end of payload"));
        }

        let value = self.window >> (64 - count);
        self.consume(count);

        Ok(value)
    }

    /// Reads a run of ones terminated by a zero, returning the run's length.
    #[inline]
    fn read_unary(&mut self) -> Result<u64, HashError> {
        let mut total = 0u64;

        loop {
            self.refill();

            if self.bits == 0 {
                return Err(HashError::MalformedFilter("bit reader past end of payload"));
            }

            let ones = (!self.window).leading_zeros();

            if ones < self.bits {
                // The terminating zero is in the window: take the run and it.
                self.consume(ones + 1);
                total += ones as u64;

                return if total > QUOTIENT_LIMIT {
                    Err(HashError::MalformedFilter("golomb quotient runaway"))
                } else {
                    Ok(total)
                };
            }

            // Every valid bit is a one; take them and refill for the rest.
            total += self.bits as u64;

            if total > QUOTIENT_LIMIT {
                return Err(HashError::MalformedFilter("golomb quotient runaway"));
            }

            self.window = 0;
            self.bits = 0;
        }
    }
}

/// Reads a Bitcoin-style varint, returning the value and the bytes consumed.
fn read_varint(buf: &[u8]) -> Result<(u64, usize), HashError> {
    let first = *buf
        .first()
        .ok_or(HashError::MalformedFilter("filter is empty"))?;

    let (value, size) = match first {
        n if n < 0xfd => (n as u64, 1),
        0xfd => (read_le(buf, 1, 2)?, 3),
        0xfe => (read_le(buf, 1, 4)?, 5),
        _ => (read_le(buf, 1, 8)?, 9),
    };

    Ok((value, size))
}

fn read_le(buf: &[u8], offset: usize, size: usize) -> Result<u64, HashError> {
    let bytes = buf
        .get(offset..offset + size)
        .ok_or(HashError::MalformedFilter("truncated varint"))?;
    let mut value = 0u64;

    for (i, byte) in bytes.iter().enumerate() {
        value |= (*byte as u64) << (i * 8);
    }

    Ok(value)
}

/// Does this filter contain any of these items?
///
/// The whole per-block operation: derive nothing, decode the Golomb-Rice coded
/// set, hash every item under the filter key, map it into the filter's range,
/// and merge the two sorted streams. Nothing crosses back into JS until the
/// answer is known.
pub fn match_any(
    filter: &[u8],
    k0: u64,
    k1: u64,
    items: &[&[u8]],
    p: u8,
    m: u64,
) -> Result<bool, HashError> {
    if p == 0 || p > 63 {
        return Err(HashError::MalformedFilter("golomb parameter out of range"));
    }

    let (n, offset) = read_varint(filter)?;

    if n == 0 || items.is_empty() {
        return Ok(false);
    }

    let f = n
        .checked_mul(m)
        .ok_or(HashError::MalformedFilter("filter range overflows"))?;

    // Hash the items once, in the filter's range, sorted so the decode below
    // can be a single merge rather than a search per value.
    let mut targets: Vec<u64> = items
        .iter()
        .map(|item| scale(siphash24_with_keys(k0, k1, item), f))
        .collect();

    targets.sort_unstable();
    targets.dedup();

    let body = filter
        .get(offset..)
        .ok_or(HashError::MalformedFilter("filter has no payload"))?;
    let mut reader = BitReader::new(body);
    let mut value = 0u64;
    let mut target = 0usize;

    for _ in 0..n {
        // Unary quotient, then the P-bit remainder.
        let delta = (reader.read_unary()? << p) | reader.read_bits(p as u32)?;
        value = value.wrapping_add(delta);

        // Both streams ascend, so walk the targets forward to meet this value.
        while targets[target] < value {
            target += 1;

            if target == targets.len() {
                return Ok(false);
            }
        }

        if targets[target] == value {
            return Ok(true);
        }
    }

    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Golomb-Rice encoder, so the tests can build filters to decode.
    fn encode(values: &[u64], p: u8) -> Vec<u8> {
        let mut sorted = values.to_vec();
        sorted.sort_unstable();

        let mut out = Vec::new();
        let n = sorted.len() as u64;

        if n < 0xfd {
            out.push(n as u8);
        } else {
            out.push(0xfd);
            out.extend_from_slice(&(n as u16).to_le_bytes());
        }

        let mut bits: Vec<u8> = Vec::new();
        let mut last = 0u64;

        for value in sorted {
            let delta = value - last;
            last = value;

            for _ in 0..(delta >> p) {
                bits.push(1);
            }
            bits.push(0);

            for i in (0..p).rev() {
                bits.push(((delta >> i) & 1) as u8);
            }
        }

        for chunk in bits.chunks(8) {
            let mut byte = 0u8;
            for (i, bit) in chunk.iter().enumerate() {
                byte |= bit << (7 - i);
            }
            out.push(byte);
        }

        out
    }

    fn build(items: &[&[u8]], k0: u64, k1: u64) -> Vec<u8> {
        let f = items.len() as u64 * BASIC_FILTER_M;
        let scaled: Vec<u64> = items
            .iter()
            .map(|item| scale(siphash24_with_keys(k0, k1, item), f))
            .collect();

        encode(&scaled, BASIC_FILTER_P)
    }

    #[test]
    fn matches_a_member_and_misses_a_stranger() {
        let members: Vec<Vec<u8>> = (0..50u8)
            .map(|i| vec![0x55, i, i.wrapping_mul(7)])
            .collect();
        let refs: Vec<&[u8]> = members.iter().map(|m| m.as_slice()).collect();
        let filter = build(&refs, 1, 2);

        for member in &refs {
            assert!(
                match_any(&filter, 1, 2, &[member], BASIC_FILTER_P, BASIC_FILTER_M).unwrap(),
                "member should match"
            );
        }

        let stranger: &[u8] = &[0xaa, 1, 2, 3];
        assert!(!match_any(&filter, 1, 2, &[stranger], BASIC_FILTER_P, BASIC_FILTER_M).unwrap());
    }

    #[test]
    fn matches_when_any_one_of_many_items_is_present() {
        let members: Vec<Vec<u8>> = (0..20u8).map(|i| vec![0x55, i]).collect();
        let refs: Vec<&[u8]> = members.iter().map(|m| m.as_slice()).collect();
        let filter = build(&refs, 9, 9);

        let mut query: Vec<&[u8]> = vec![&[0xaa, 1], &[0xaa, 2], &[0xaa, 3]];
        assert!(!match_any(&filter, 9, 9, &query, BASIC_FILTER_P, BASIC_FILTER_M).unwrap());

        query.push(refs[7]);
        assert!(match_any(&filter, 9, 9, &query, BASIC_FILTER_P, BASIC_FILTER_M).unwrap());
    }

    #[test]
    fn handles_empty_filters_and_queries() {
        let filter = build(&[], 0, 0);
        let item: &[u8] = b"anything";

        assert!(!match_any(&filter, 0, 0, &[item], BASIC_FILTER_P, BASIC_FILTER_M).unwrap());
        assert!(!match_any(&[0x00], 0, 0, &[item], BASIC_FILTER_P, BASIC_FILTER_M).unwrap());

        let members: Vec<Vec<u8>> = (0..5u8).map(|i| vec![i]).collect();
        let refs: Vec<&[u8]> = members.iter().map(|m| m.as_slice()).collect();
        let filter = build(&refs, 0, 0);
        assert!(!match_any(&filter, 0, 0, &[], BASIC_FILTER_P, BASIC_FILTER_M).unwrap());
    }

    #[test]
    fn rejects_malformed_input() {
        assert!(matches!(
            match_any(&[], 0, 0, &[b"x"], BASIC_FILTER_P, BASIC_FILTER_M),
            Err(HashError::MalformedFilter(_))
        ));
        // claims 5 entries, provides no payload
        assert!(matches!(
            match_any(&[0x05], 0, 0, &[b"x"], BASIC_FILTER_P, BASIC_FILTER_M),
            Err(HashError::MalformedFilter(_))
        ));
        assert!(matches!(
            match_any(&[0x01, 0xff], 0, 0, &[b"x"], 0, BASIC_FILTER_M),
            Err(HashError::MalformedFilter(_))
        ));
    }

    #[test]
    fn derives_the_filter_key_from_the_block_hash() {
        let hash: Vec<u8> = (0..32u8).collect();
        let (k0, k1) = filter_key(&hash).unwrap();

        assert_eq!(k0, u64::from_le_bytes([0, 1, 2, 3, 4, 5, 6, 7]));
        assert_eq!(k1, u64::from_le_bytes([8, 9, 10, 11, 12, 13, 14, 15]));
        assert!(filter_key(&hash[..31]).is_err());
    }
}
