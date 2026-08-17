use std::fmt;

/// Everything the hashing cores reject: a buffer of the wrong size, or hex that
/// isn't hex. Both are bad arguments from JS, and the napi layer surfaces them
/// as `TypeError`.
#[derive(Debug, PartialEq)]
pub enum HashError {
    InvalidLength {
        subject: &'static str,
        expected: usize,
        actual: usize,
    },
    InvalidHex(hex::FromHexError),
}

impl fmt::Display for HashError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            HashError::InvalidLength {
                subject,
                expected,
                actual,
            } => write!(
                f,
                "{subject} must be exactly {expected} bytes, got {actual}"
            ),
            HashError::InvalidHex(error) => write!(f, "input must be valid hex: {error}"),
        }
    }
}

impl From<hex::FromHexError> for HashError {
    fn from(error: hex::FromHexError) -> Self {
        HashError::InvalidHex(error)
    }
}

/// Rejects a buffer that is not exactly `expected` bytes long, naming what it
/// was supposed to be.
pub fn check_length(subject: &'static str, expected: usize, bytes: &[u8]) -> Result<(), HashError> {
    if bytes.len() != expected {
        return Err(HashError::InvalidLength {
            subject,
            expected,
            actual: bytes.len(),
        });
    }

    Ok(())
}
