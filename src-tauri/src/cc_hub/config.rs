use crate::cc_hub::contracts::now_millis;
use crate::cc_hub::error::{HubError, HubResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionMeta {
    pub base_url: String,
    pub configured_at: i64,
    pub last_validated_at: i64,
    pub allow_insecure_http: bool,
    pub api_version: String,
}

impl ConnectionMeta {
    pub fn new(base_url: String, allow_insecure_http: bool, api_version: String) -> Self {
        let timestamp = now_millis();
        Self {
            base_url,
            configured_at: timestamp,
            last_validated_at: timestamp,
            allow_insecure_http,
            api_version,
        }
    }
}

pub struct ConfigStore {
    path: PathBuf,
    lock: Mutex<()>,
}

impl ConfigStore {
    pub fn from_config_dir(config_dir: PathBuf) -> HubResult<Self> {
        fs::create_dir_all(&config_dir).map_err(|_| HubError::Storage)?;
        Ok(Self {
            path: config_dir.join("cc-hub-connection.json"),
            lock: Mutex::new(()),
        })
    }

    pub fn from_file_for_tests(path: PathBuf) -> Self {
        Self {
            path,
            lock: Mutex::new(()),
        }
    }

    pub fn read(&self) -> HubResult<Option<ConnectionMeta>> {
        let _guard = self.lock.lock().map_err(|_| HubError::Storage)?;
        let contents = match fs::read_to_string(&self.path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(HubError::Storage),
        };
        serde_json::from_str(&contents)
            .map(Some)
            .map_err(|_| HubError::ConfigUnavailable)
    }

    pub fn write(&self, meta: &ConnectionMeta) -> HubResult<()> {
        let _guard = self.lock.lock().map_err(|_| HubError::Storage)?;
        let contents = serde_json::to_vec_pretty(meta).map_err(|_| HubError::Storage)?;
        fs::write(&self.path, contents).map_err(|_| HubError::Storage)?;
        Ok(())
    }

    pub fn clear(&self) -> HubResult<()> {
        let _guard = self.lock.lock().map_err(|_| HubError::Storage)?;
        match fs::remove_file(&self.path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err(HubError::Storage),
        }
    }

    pub fn path_for_tests(&self) -> &Path {
        &self.path
    }
}

#[cfg(test)]
mod tests {
    use super::{ConfigStore, ConnectionMeta};
    use std::path::PathBuf;

    fn test_path() -> PathBuf {
        std::env::temp_dir().join(format!(
            "omnideck-cc-hub-config-{}-{}.json",
            std::process::id(),
            1
        ))
    }

    #[test]
    fn config_round_trip_contains_no_token_field() {
        let path = test_path();
        let _ = std::fs::remove_file(&path);
        let store = ConfigStore::from_file_for_tests(path.clone());
        let meta = ConnectionMeta {
            base_url: "https://hub.example.invalid".to_owned(),
            configured_at: 1,
            last_validated_at: 2,
            allow_insecure_http: false,
            api_version: "1.0.0".to_owned(),
        };
        store.write(&meta).expect("config writes");
        assert_eq!(store.read().expect("config reads"), Some(meta));
        let contents = std::fs::read_to_string(&path).expect("config file exists");
        assert!(!contents.contains("token"));
        store.clear().expect("config clears");
        assert!(store.read().expect("missing config reads").is_none());
    }
}
