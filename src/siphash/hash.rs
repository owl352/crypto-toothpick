use siphasher::sip::SipHasher24;

use crate::error::{HashError, check_length};

/// Size of a SipHash key: two 64-bit halves, little-endian.
pub const SIPHASH24_KEY_LENGTH: usize = 16;

/// Size of the SipHash-2-4 digest.
pub const SIPHASH24_OUTPUT_LENGTH: usize = 8;

/// SipHash-2-4 keyed by the two 64-bit halves, as Bitcoin and Dash use it (BIP
/// 158 filter matching, BIP 152 short ids).
pub fn siphash24_with_keys(k0: u64, k1: u64, data: &[u8]) -> u64 {
    SipHasher24::new_with_keys(k0, k1).hash(data)
}

/// Same, keyed by the 16 raw key bytes: `k0` is the first eight in
/// little-endian order, `k1` the second eight.
pub fn siphash24(key: &[u8], data: &[u8]) -> Result<u64, HashError> {
    check_length("siphash key", SIPHASH24_KEY_LENGTH, key)?;

    let mut bytes = [0u8; SIPHASH24_KEY_LENGTH];
    bytes.copy_from_slice(key);

    Ok(SipHasher24::new_with_key(&bytes).hash(data))
}

/// Same as [`siphash24`], with the digest as the little-endian bytes of the
/// 64-bit result — the order Bitcoin and Dash serialize it in.
pub fn siphash24_bytes(
    key: &[u8],
    data: &[u8],
) -> Result<[u8; SIPHASH24_OUTPUT_LENGTH], HashError> {
    Ok(siphash24(key, data)?.to_le_bytes())
}

/// Same as [`siphash24_bytes`], with the key, the data and the digest as hex
/// strings.
pub fn siphash24_hex(key: &str, data: &str) -> Result<String, HashError> {
    Ok(hex::encode(siphash24_bytes(
        &hex::decode(key)?,
        &hex::decode(data)?,
    )?))
}

#[cfg(test)]
mod tests {
    use super::*;

    // `vectors_sip64` from the reference implementation
    // (https://github.com/veorq/SipHash): key 000102...0f, and as message the
    // first `i` bytes of 00 01 02 ..., for every i in 0..64. Each entry is the
    // digest as serialized bytes.
    const KEY: &str = "000102030405060708090a0b0c0d0e0f";
    const VECTORS: [&str; 64] = [
        "310e0edd47db6f72",
        "fd67dc93c539f874",
        "5a4fa9d909806c0d",
        "2d7efbd796666785",
        "b7877127e09427cf",
        "8da699cd64557618",
        "cee3fe586e46c9cb",
        "37d1018bf50002ab",
        "6224939a79f5f593",
        "b0e4a90bdf82009e",
        "f3b9dd94c5bb5d7a",
        "a7ad6b22462fb3f4",
        "fbe50e86bc8f1e75",
        "903d84c02756ea14",
        "eef27a8e90ca23f7",
        "e545be4961ca29a1",
        "db9bc2577fcc2a3f",
        "9447be2cf5e99a69",
        "9cd38d96f0b3c14b",
        "bd6179a71dc96dbb",
        "98eea21af25cd6be",
        "c7673b2eb0cbf2d0",
        "883ea3e395675393",
        "c8ce5ccd8c030ca8",
        "94af49f6c650adb8",
        "eab8858ade92e1bc",
        "f315bb5bb835d817",
        "adcf6b0763612e2f",
        "a5c91da7acaa4dde",
        "716595876650a2a6",
        "28ef495c53a387ad",
        "42c341d8fa92d832",
        "ce7cf2722f512771",
        "e37859f94623f3a7",
        "381205bb1ab0e012",
        "ae97a10fd434e015",
        "b4a31508beff4d31",
        "81396229f0907902",
        "4d0cf49ee5d4dcca",
        "5c73336a76d8bf9a",
        "d0a704536ba93e0e",
        "925958fcd6420cad",
        "a915c29bc8067318",
        "952b79f3bc0aa6d4",
        "f21df2e41d4535f9",
        "87577519048f53a9",
        "10a56cf5dfcd9adb",
        "eb75095ccd986cd0",
        "51a9cb9ecba312e6",
        "96afadfc2ce666c7",
        "72fe52975a4364ee",
        "5a1645b276d592a1",
        "b274cb8ebf87870a",
        "6f9bb4203de7b381",
        "eaecb2a30b22a87f",
        "9924a43cc1315724",
        "bd838d3aafbf8db7",
        "0b1a2a3265d51aea",
        "135079a3231ce660",
        "932b2846e4d70666",
        "e1915f5cb1eca46c",
        "f325965ca16d629f",
        "575ff28e60381be5",
        "724506eb4c328a95",
    ];

    fn message(len: usize) -> Vec<u8> {
        (0..len).map(|byte| byte as u8).collect()
    }

    #[test]
    fn hashes_the_reference_vectors() {
        let key = hex::decode(KEY).unwrap();

        for (len, digest) in VECTORS.into_iter().enumerate() {
            assert_eq!(
                hex::encode(siphash24_bytes(&key, &message(len)).unwrap()),
                digest,
                "message of {len} bytes"
            );
        }
    }

    #[test]
    fn keys_and_key_bytes_agree() {
        let key = hex::decode(KEY).unwrap();
        let k0 = u64::from_le_bytes(key[..8].try_into().unwrap());
        let k1 = u64::from_le_bytes(key[8..].try_into().unwrap());

        for len in [0, 1, 8, 63] {
            assert_eq!(
                siphash24(&key, &message(len)).unwrap(),
                siphash24_with_keys(k0, k1, &message(len))
            );
        }
    }

    #[test]
    fn hashes_data_of_any_length() {
        let key = hex::decode(KEY).unwrap();

        assert_eq!(siphash24_bytes(&key, &[]).unwrap().len(), 8);
        assert_eq!(siphash24_bytes(&key, &[0u8; 1000]).unwrap().len(), 8);
    }

    #[test]
    fn rejects_keys_of_the_wrong_length() {
        for key in [vec![], vec![0u8; 15], vec![0u8; 17]] {
            assert_eq!(
                siphash24(&key, b"data"),
                Err(HashError::InvalidLength {
                    subject: "siphash key",
                    expected: SIPHASH24_KEY_LENGTH,
                    actual: key.len()
                })
            );
        }
    }

    #[test]
    fn rejects_malformed_hex() {
        assert!(matches!(
            siphash24_hex(&"z".repeat(32), ""),
            Err(HashError::InvalidHex(_))
        ));
        assert!(matches!(
            siphash24_hex(KEY, "0"),
            Err(HashError::InvalidHex(_))
        ));
    }

    #[test]
    fn error_messages_name_the_expected_length() {
        assert_eq!(
            siphash24(&[0u8; 8], b"").unwrap_err().to_string(),
            "siphash key must be exactly 16 bytes, got 8"
        );
    }
}
