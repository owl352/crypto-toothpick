use sha2::{Digest, Sha256};

use crate::error::{HashError, check_length, check_multiple};

/// Size of a compact filter hash, and of a compact filter header. Both are a
/// double-SHA-256 digest, so both are 32 bytes.
pub const CFILTER_HEADER_LENGTH: usize = 32;

/// Double SHA-256, the digest Bitcoin and Dash use nearly everywhere.
pub fn sha256d(data: &[u8]) -> [u8; CFILTER_HEADER_LENGTH] {
    Sha256::digest(Sha256::digest(data)).into()
}

/// The filter header that follows `prev`, from BIP 157:
/// `sha256d(filter_hash || prev_header)`.
///
/// Both arguments and the result are in internal (wire) byte order, not the
/// reversed form block explorers display.
pub fn chain_one(
    filter_hash: &[u8; CFILTER_HEADER_LENGTH],
    prev: &[u8; CFILTER_HEADER_LENGTH],
) -> [u8; CFILTER_HEADER_LENGTH] {
    let mut hasher = Sha256::new();

    hasher.update(filter_hash);
    hasher.update(prev);

    Sha256::digest(hasher.finalize()).into()
}

/// Chains a run of filter hashes onto `prev`, returning one header per hash.
///
/// Each header is the input to the next, which is why this cannot be a generic
/// hash-N-things batch: the walk has to stay on one side of the boundary or it
/// pays the crossing per block rather than per chunk.
pub fn header_chain(prev: &[u8], filter_hashes: &[u8]) -> Result<Vec<u8>, HashError> {
    check_length("previous filter header", CFILTER_HEADER_LENGTH, prev)?;
    check_multiple("filter hashes", CFILTER_HEADER_LENGTH, filter_hashes)?;

    let mut headers = Vec::with_capacity(filter_hashes.len());
    let mut previous: [u8; CFILTER_HEADER_LENGTH] = prev.try_into().expect("32 bytes");

    for filter_hash in filter_hashes.chunks_exact(CFILTER_HEADER_LENGTH) {
        previous = chain_one(filter_hash.try_into().expect("32 bytes"), &previous);
        headers.extend_from_slice(&previous);
    }

    Ok(headers)
}

/// Does this filter hash and chain onto `prev` to give `expected`?
///
/// Folds both digests and the comparison into one call, which is the whole cost
/// a filter already pays at the boundary.
pub fn verify(filter: &[u8], prev: &[u8], expected: &[u8]) -> Result<bool, HashError> {
    check_length("previous filter header", CFILTER_HEADER_LENGTH, prev)?;
    check_length("expected filter header", CFILTER_HEADER_LENGTH, expected)?;

    let header = chain_one(&sha256d(filter), prev.try_into().expect("32 bytes"));

    Ok(header.as_slice() == expected)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// BIP 158's testnet block 0: the basic filter, and the basic header it
    /// chains to off an all-zero previous header.
    ///
    /// The BIP publishes that header as `21584579…b750`, in the reversed order
    /// explorers display; every byte string here is internal (wire) order, so
    /// it appears reversed from the BIP's table.
    const GENESIS_FILTER: &str = "019dfca8";
    const GENESIS_FILTER_HASH: &str =
        "4c8af7fa3ac4111dc5fd7581d176c02dbbfde83fd6f16496a576fbd6b20537c0";
    const GENESIS_HEADER: &str = "50b781aed7b7129012a6d20e2d040027937f3affaee573779908ebb779455821";

    const ZERO_HEADER: &str = "0000000000000000000000000000000000000000000000000000000000000000";

    fn bytes(hex: &str) -> Vec<u8> {
        hex::decode(hex).unwrap()
    }

    #[test]
    fn hashes_the_reference_sha256d_vectors() {
        assert_eq!(
            hex::encode(sha256d(b"")),
            "5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456"
        );
        assert_eq!(
            hex::encode(sha256d(b"abc")),
            "4f8b42c22dd3729b519ba6f68d2da7cc5b2d606d05daed5ad5128cc03e6c6358"
        );
    }

    #[test]
    fn chains_the_bip158_genesis_header() {
        assert_eq!(
            hex::encode(sha256d(&bytes(GENESIS_FILTER))),
            GENESIS_FILTER_HASH
        );
        assert_eq!(
            hex::encode(header_chain(&bytes(ZERO_HEADER), &bytes(GENESIS_FILTER_HASH)).unwrap()),
            GENESIS_HEADER
        );
    }

    #[test]
    fn chains_each_header_off_the_one_before() {
        // Three filter hashes walked off the genesis header above, computed
        // step by step with an independent SHA-256.
        let hashes = ["11".repeat(32), "22".repeat(32), "33".repeat(32)].concat();
        let expected = [
            "d5a5086a52096e96c9b1fc0144f09b8186da252b16caa9fcacf41d62abafdfcb",
            "c648fed05f8a133003a1aa87f5d98200325b1278f144e0c7d00e6397deb2214c",
            "2409966b7ca410880c4fbedc83ec778b345376c3fc5d7c4c1e8feeca9d7344a0",
        ];

        let headers = header_chain(&bytes(GENESIS_HEADER), &bytes(&hashes)).unwrap();

        assert_eq!(headers.len(), expected.len() * CFILTER_HEADER_LENGTH);
        assert_eq!(hex::encode(&headers), expected.concat());
    }

    #[test]
    fn chunks_of_a_chain_join_up() {
        let hashes = ["11".repeat(32), "22".repeat(32), "33".repeat(32)].concat();
        let whole = header_chain(&bytes(GENESIS_HEADER), &bytes(&hashes)).unwrap();

        let first = header_chain(&bytes(GENESIS_HEADER), &bytes(&"11".repeat(32))).unwrap();
        let rest =
            header_chain(&first, &bytes(&["22".repeat(32), "33".repeat(32)].concat())).unwrap();

        assert_eq!([first, rest].concat(), whole);
    }

    #[test]
    fn chains_nothing_onto_no_hashes() {
        assert_eq!(header_chain(&bytes(ZERO_HEADER), &[]).unwrap(), Vec::new());
    }

    #[test]
    fn verifies_a_filter_against_its_header() {
        assert!(
            verify(
                &bytes(GENESIS_FILTER),
                &bytes(ZERO_HEADER),
                &bytes(GENESIS_HEADER)
            )
            .unwrap()
        );
    }

    #[test]
    fn rejects_a_filter_that_does_not_chain() {
        // Right filter, wrong previous header.
        assert!(
            !verify(
                &bytes(GENESIS_FILTER),
                &bytes(GENESIS_HEADER),
                &bytes(GENESIS_HEADER)
            )
            .unwrap()
        );

        // Right previous header, tampered filter.
        assert!(
            !verify(
                &bytes("019dfca9"),
                &bytes(ZERO_HEADER),
                &bytes(GENESIS_HEADER)
            )
            .unwrap()
        );
    }

    #[test]
    fn verify_agrees_with_the_chain() {
        let filter = bytes(GENESIS_FILTER);
        let header = header_chain(&bytes(ZERO_HEADER), &sha256d(&filter)).unwrap();

        assert!(verify(&filter, &bytes(ZERO_HEADER), &header).unwrap());
    }

    #[test]
    fn rejects_a_previous_header_of_the_wrong_length() {
        assert_eq!(
            header_chain(&[0u8; 31], &[]),
            Err(HashError::InvalidLength {
                subject: "previous filter header",
                expected: CFILTER_HEADER_LENGTH,
                actual: 31
            })
        );
        assert_eq!(
            verify(b"", &[0u8; 33], &[0u8; 32]),
            Err(HashError::InvalidLength {
                subject: "previous filter header",
                expected: CFILTER_HEADER_LENGTH,
                actual: 33
            })
        );
    }

    #[test]
    fn rejects_a_run_that_is_not_whole_filter_hashes() {
        assert_eq!(
            header_chain(&[0u8; 32], &[0u8; 33]),
            Err(HashError::NotAMultiple {
                subject: "filter hashes",
                unit: CFILTER_HEADER_LENGTH,
                actual: 33
            })
        );
    }

    #[test]
    fn error_messages_name_what_was_expected() {
        assert_eq!(
            header_chain(&[0u8; 32], &[0u8; 33])
                .unwrap_err()
                .to_string(),
            "filter hashes must be a whole number of 32-byte entries, got 33"
        );
    }
}
