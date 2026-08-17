use napi::Status;
use napi_derive::napi;

use crate::error::HashError;

pub trait WithJsError<T> {
    fn with_js_error(self) -> Result<T, napi::Error>;
}

/// Everything the cores reject is a bad argument from JS — a buffer of the
/// wrong size, or hex that isn't hex — so it all surfaces as a `TypeError`.
impl<T> WithJsError<T> for Result<T, HashError> {
    fn with_js_error(self) -> Result<T, napi::Error> {
        self.map_err(|error| napi::Error::new(Status::InvalidArg, error.to_string()))
    }
}

pub trait TryToU64 {
    fn try_to_u64(&self) -> Result<u64, napi::Error>;
    fn from_u64(val: u64) -> BigIntString;
}

/// 64-bit values cross the boundary as decimal strings, so the binding stays on
/// the same N-API level as the rest of the module and needs no BigInt support
/// from the host. The TypeScript layer converts to and from `bigint`.
#[napi]
pub type BigIntString = String;

impl TryToU64 for BigIntString {
    fn try_to_u64(&self) -> Result<u64, napi::Error> {
        self.parse().map_err(|_| {
            napi::Error::new(
                Status::Unknown,
                format!(
                    "Cannot convert String from Uint64String to u64 ({:?})",
                    self.clone()
                ),
            )
        })
    }

    fn from_u64(val: u64) -> Self {
        val.to_string()
    }
}
