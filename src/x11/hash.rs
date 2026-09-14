use rs_x11_hash::get_x11_hash;

use crate::error::{HashError, check_length, check_multiple};

/// Size of the input the X11 chain consumes: a Dash block header.
pub const X11_INPUT_LENGTH: usize = 80;

/// Size of the X11 digest.
pub const X11_OUTPUT_LENGTH: usize = 32;

/// Hashes an 80-byte block header with the X11 chain.
///
/// The C implementation behind `rs-x11-hash` reads a fixed
/// [`X11_INPUT_LENGTH`] bytes from the pointer it is handed and ignores the
/// length of the slice, so anything shorter would read out of bounds: the
/// length check here is what keeps that call sound.
pub fn hash(header: &[u8]) -> Result<[u8; X11_OUTPUT_LENGTH], HashError> {
    check_length("x11 input (a block header)", X11_INPUT_LENGTH, header)?;

    Ok(get_x11_hash(header))
}

/// Hashes a run of block headers laid end to end, returning the digests the
/// same way: [`X11_INPUT_LENGTH`] bytes each in, [`X11_OUTPUT_LENGTH`] each out.
///
/// Every header is hashed through [`hash`], so each one is length-checked
/// before the C implementation sees it — `chunks_exact` cannot hand it a short
/// slice, and the trailing remainder is rejected up front.
pub fn hash_many(headers: &[u8]) -> Result<Vec<u8>, HashError> {
    check_multiple("x11 input (block headers)", X11_INPUT_LENGTH, headers)?;

    let count = headers.len() / X11_INPUT_LENGTH;
    let mut digests = Vec::with_capacity(count * X11_OUTPUT_LENGTH);

    for header in headers.chunks_exact(X11_INPUT_LENGTH) {
        digests.extend_from_slice(&hash(header)?);
    }

    Ok(digests)
}

/// Same as [`hash`], with the header and the digest as hex strings.
pub fn hash_hex(header: &str) -> Result<String, HashError> {
    Ok(hex::encode(hash(&hex::decode(header)?)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Headers and digests from the upstream rs-x11-hash test suite.
    const VECTORS: [(&str, &str); 4] = [
        (
            "020000002cc0081be5039a54b686d24d5d8747ee9770d9973ec1ace02e5c0500000000008d7139724b11c52995db4370284c998b9114154b120ad3486f1a360a1d4253d310d40e55b8f70a1be8e32300",
            "f29c0f286fd8071669286c6987eb941181134ff5f3978bf89f34070000000000",
        ),
        (
            "040000002e3df23eec5cd6a86edd509539028e2c3a3dc05315eb28f2baa43218ca080000b3a56d65316ffdb006163240a4380e94a4c2d8c0f0b3b2c1ddc486fae15ed065ba968054ffff7f2002000000",
            "000739d9da507b3acb949f21fe10ad424abbad5b4c46789285b05fe36df5c5b0",
        ),
        (
            "040000002e3df23eec5cd6a86edd509539028e2c3a3dc05315eb28f2baa43218ca080000b3a56d65316ffdb006163240a4380e94a4c2d8c0f0b3b2c1ddc486fae15ed065ba968054ffff7f2003000000",
            "90ec0543cd91297e7ad3d3141a404fb55f787b3058aca2b45ab0fc20d06409c6",
        ),
        (
            "040000002e3df23eec5cd6a86edd509539028e2c3a3dc05315eb28f2baa43218ca080000b3a56d65316ffdb006163240a4380e94a4c2d8c0f0b3b2c1ddc486fae15ed065ba968054ffff7f2004000000",
            "eee8ff78056e3b0cd35cd8e267fa871270a183a5d05c764d8c2047b7c3cca014",
        ),
    ];

    #[test]
    fn hashes_known_headers() {
        for (header, digest) in VECTORS {
            assert_eq!(hash_hex(header).unwrap(), digest);
            assert_eq!(
                hash(&hex::decode(header).unwrap()).unwrap().to_vec(),
                hex::decode(digest).unwrap()
            );
        }
    }

    #[test]
    fn rejects_headers_of_the_wrong_length() {
        for header in [vec![], vec![0u8; 79], vec![0u8; 81]] {
            assert_eq!(
                hash(&header),
                Err(HashError::InvalidLength {
                    subject: "x11 input (a block header)",
                    expected: X11_INPUT_LENGTH,
                    actual: header.len()
                })
            );
        }
    }

    #[test]
    fn accepts_an_all_zero_header() {
        assert_eq!(
            hash(&[0u8; X11_INPUT_LENGTH]).unwrap().len(),
            X11_OUTPUT_LENGTH
        );
    }

    #[test]
    fn rejects_malformed_hex() {
        assert!(matches!(
            hash_hex(&"zz".repeat(X11_INPUT_LENGTH)),
            Err(HashError::InvalidHex(_))
        ));
        assert!(matches!(
            hash_hex(&"0".repeat(X11_INPUT_LENGTH * 2 - 1)),
            Err(HashError::InvalidHex(_))
        ));
    }

    #[test]
    fn hashes_a_run_of_headers_in_one_call() {
        let headers: String = VECTORS.iter().map(|(header, _)| *header).collect();
        let digests: String = VECTORS.iter().map(|(_, digest)| *digest).collect();

        assert_eq!(
            hex::encode(hash_many(&hex::decode(headers).unwrap()).unwrap()),
            digests
        );
    }

    #[test]
    fn a_run_agrees_with_the_headers_hashed_one_at_a_time() {
        let headers = hex::decode(
            VECTORS
                .iter()
                .map(|(header, _)| *header)
                .collect::<String>(),
        )
        .unwrap();

        let one_at_a_time: Vec<u8> = headers
            .chunks_exact(X11_INPUT_LENGTH)
            .flat_map(|header| hash(header).unwrap())
            .collect();

        assert_eq!(hash_many(&headers).unwrap(), one_at_a_time);
    }

    #[test]
    fn hashes_nothing_into_nothing() {
        assert_eq!(hash_many(&[]).unwrap(), Vec::new());
    }

    #[test]
    fn rejects_a_run_that_is_not_whole_headers() {
        for len in [1, 79, 81, 159] {
            assert_eq!(
                hash_many(&vec![0u8; len]),
                Err(HashError::NotAMultiple {
                    subject: "x11 input (block headers)",
                    unit: X11_INPUT_LENGTH,
                    actual: len
                })
            );
        }
    }

    #[test]
    fn error_messages_name_the_expected_length() {
        assert_eq!(
            hash(&[0u8; 64]).unwrap_err().to_string(),
            "x11 input (a block header) must be exactly 80 bytes, got 64"
        );
    }
}
