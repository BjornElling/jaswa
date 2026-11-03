use aes::Aes128;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use cbc::Decryptor;
use cipher::{BlockDecryptMut, KeyIvInit, block_padding::Pkcs7};
use serde_json::Value;
use std::io::Read;

pub const MAXIMUM_DECODED_RESPONSE_BYTES: usize = 32 * 1024 * 1024;
const KEY: &[u8; 16] = b"Gr4S2eiNl7zq5MrU";

pub fn decrypt_envelope(payload: &str) -> Result<Vec<u8>, String> {
    if payload.trim().is_empty() {
        return Err("The gateway envelope was empty.".into());
    }
    let mut encrypted = STANDARD
        .decode(payload)
        .map_err(|error| format!("The gateway envelope was not base64: {error}"))?;
    Decryptor::<Aes128>::new_from_slices(KEY, &[0; 16])
        .map_err(|_| "Could not create the gateway cipher.".to_owned())?
        .decrypt_padded_mut::<Pkcs7>(&mut encrypted)
        .map(|plain| plain.to_vec())
        .map_err(|_| "The gateway envelope could not be decrypted.".to_owned())
}

/* The client marks an answer sealed with the AES key it makes for one session
and sends only RSA-wrapped (docs/LIVE-IMPORT-COVERAGE.md, "Raid response-key
negotiation"). That key never crosses the wire readably, so passive reading
cannot open such an answer whatever JASWA learns: the marker is the proof that
a miss is the game's encryption and not a reader still to write. */
const SESSION_KEY_MARKER: &str = "Vv2XRzS1O1AW8FuV";

/// Whether an answer is sealed with the game's per-session key: the marker,
/// then base64 whose bytes fill whole AES blocks.
pub fn session_encrypted(payload: &str) -> bool {
    payload.trim().strip_prefix(SESSION_KEY_MARKER)
        .and_then(|rest| STANDARD.decode(rest).ok())
        .is_some_and(|bytes| !bytes.is_empty() && bytes.len() % 16 == 0)
}

pub fn decode_request(payload: &str) -> Result<Value, String> {
    let plain = decrypt_envelope(payload)?;
    serde_json::from_slice(&plain)
        .map_err(|error| format!("The game request was not JSON: {error}"))
}

pub fn decode_response(payload: &str) -> Result<Value, String> {
    let plain = decrypt_envelope(payload)?;
    let mut decoder = flate2::read::ZlibDecoder::new(plain.as_slice());
    let mut decoded = Vec::new();
    decoder
        .by_ref()
        .take((MAXIMUM_DECODED_RESPONSE_BYTES + 1) as u64)
        .read_to_end(&mut decoded)
        .map_err(|error| format!("The game response could not be decompressed: {error}"))?;
    if decoded.len() > MAXIMUM_DECODED_RESPONSE_BYTES {
        return Err("The game response was too large to import safely.".into());
    }
    serde_json::from_slice(&decoded)
        .map_err(|error| format!("The game response was not JSON: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_marked_whole_block_answer_is_session_encrypted() {
        let sealed = |bytes: usize| format!("{SESSION_KEY_MARKER}{}", STANDARD.encode(vec![41; bytes]));
        assert!(session_encrypted(&sealed(16)));
        assert!(session_encrypted(&sealed(1_744)));
        // A broken envelope is not proof of the game's key: it may be JASWA's defect.
        assert!(!session_encrypted(&sealed(0)));
        assert!(!session_encrypted(&sealed(15)));
        assert!(!session_encrypted(&STANDARD.encode([41; 32])));
        assert!(!session_encrypted(&format!("{SESSION_KEY_MARKER}not base64!")));
        assert!(!session_encrypted(""));
    }
}
