//! Shared browser choices stay on this computer, independent of game capture.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, io::{self, Write}, path::PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Copy {
    pub token: String,
    pub preferences: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WriteRequest {
    pub expected_token: Option<String>,
    pub preferences: Value,
}

pub struct PreferenceStore { path: PathBuf }

impl PreferenceStore {
    pub fn new(directory: PathBuf) -> Self { Self { path: directory.join("preferences.json") } }

    pub fn read(&self) -> io::Result<Option<Copy>> {
        let bytes = match fs::read(&self.path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error),
        };
        let copy: Copy = serde_json::from_slice(&bytes).map_err(io::Error::other)?;
        if copy.token.is_empty() || !copy.preferences.is_object() {
            return Err(io::Error::other("Unreadable shared personalization; the saved file was left unchanged."));
        }
        Ok(Some(copy))
    }

    /// The caller holds one mutex across the read, comparison and durable write.
    /// A token identifies one commit, never a program or document format.
    pub fn write(&self, request: WriteRequest) -> io::Result<Result<Copy, ()>> {
        if !request.preferences.is_object() { return Err(io::Error::other("Personalization must be an object.")); }
        let previous = self.read()?;
        if previous.as_ref().map(|copy| &copy.token) != request.expected_token.as_ref() { return Ok(Err(())); }
        let copy = Copy { token: uuid::Uuid::new_v4().to_string(), preferences: request.preferences };
        fs::create_dir_all(self.path.parent().expect("preference directory"))?;
        let temporary = self.path.with_extension("pending");
        let mut file = fs::File::create(&temporary)?;
        file.write_all(&serde_json::to_vec(&copy).map_err(io::Error::other)?)?;
        file.sync_all()?;
        drop(file);
        fs::rename(temporary, &self.path)?;
        Ok(Ok(copy))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn preferences_survive_restart_and_stale_writers_cannot_overwrite_them() {
        let directory = tempfile::tempdir().unwrap();
        let store = PreferenceStore::new(directory.path().to_owned());
        assert!(store.read().unwrap().is_none());
        let first = store.write(WriteRequest { expected_token: None, preferences: json!({"runeRoles": []}) }).unwrap().unwrap();
        assert!(store.write(WriteRequest { expected_token: None, preferences: json!({}) }).unwrap().is_err());
        let second = store.write(WriteRequest { expected_token: Some(first.token.clone()), preferences: json!({"general": {"numberFormat": "european"}, "runeRoles": []}) }).unwrap().unwrap();
        assert_ne!(first.token, second.token);
        let restarted = PreferenceStore::new(directory.path().to_owned());
        assert_eq!(restarted.read().unwrap().unwrap().preferences, second.preferences);
        assert!(restarted.write(WriteRequest { expected_token: Some(first.token), preferences: json!({}) }).unwrap().is_err());
        assert_eq!(restarted.read().unwrap().unwrap().token, second.token);
    }

    #[test]
    fn unreadable_saved_choices_are_never_replaced() {
        let directory = tempfile::tempdir().unwrap();
        let store = PreferenceStore::new(directory.path().to_owned());
        fs::write(&store.path, b"unreadable").unwrap();
        assert!(store.read().is_err());
        assert!(store.write(WriteRequest { expected_token: None, preferences: json!({}) }).is_err());
        assert_eq!(fs::read(&store.path).unwrap(), b"unreadable");
    }
}
