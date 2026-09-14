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
    MalformedFilter(&'static str),
    NotAMultiple {
        subject: &'static str,
        unit: usize,
        actual: usize,
    },
    NotEnough {
        subject: &'static str,
        needed: usize,
        actual: usize,
    },
    Mismatched {
        left: &'static str,
        right: &'static str,
        left_len: usize,
        right_len: usize,
    },
    InvalidTarget(u32),
    BadOffsets(&'static str),
    SpanOverflow {
        past_blocks: usize,
        target_spacing: u32,
    },
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
            HashError::MalformedFilter(reason) => write!(f, "malformed compact filter: {reason}"),
            HashError::NotAMultiple {
                subject,
                unit,
                actual,
            } => write!(
                f,
                "{subject} must be a whole number of {unit}-byte entries, got {actual}"
            ),
            HashError::NotEnough {
                subject,
                needed,
                actual,
            } => write!(
                f,
                "{subject} must be at least {needed} {}, got {actual}",
                if *needed == 1 { "entry" } else { "entries" }
            ),
            HashError::Mismatched {
                left,
                right,
                left_len,
                right_len,
            } => write!(
                f,
                "{left} and {right} must be the same length, got {left_len} and {right_len}"
            ),
            HashError::InvalidTarget(compact) => {
                write!(f, "nBits {compact:#010x} is not a valid target")
            }
            HashError::BadOffsets(reason) => write!(f, "filter offsets {reason}"),
            HashError::SpanOverflow {
                past_blocks,
                target_spacing,
            } => write!(
                f,
                "a window of {past_blocks} blocks at {target_spacing}s spacing is too long to measure"
            ),
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

/// Rejects a buffer that is not a whole number of `unit`-byte entries, naming
/// what it was supposed to be.
pub fn check_multiple(subject: &'static str, unit: usize, bytes: &[u8]) -> Result<(), HashError> {
    if bytes.len() % unit != 0 {
        return Err(HashError::NotAMultiple {
            subject,
            unit,
            actual: bytes.len(),
        });
    }

    Ok(())
}
