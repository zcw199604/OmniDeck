#[cfg(target_os = "windows")]
const SERVICE_NAME: &str = "io.github.zcw199604.omnideck.cc-hub";
#[cfg(target_os = "windows")]
const ACCOUNT_NAME: &str = "admin-token";

use crate::cc_hub::error::{HubError, HubResult};

pub struct CredentialStore;

impl CredentialStore {
    pub const fn new() -> Self {
        Self
    }

    #[cfg(target_os = "windows")]
    fn entry(&self) -> HubResult<keyring::Entry> {
        keyring::Entry::new(SERVICE_NAME, ACCOUNT_NAME)
            .map_err(|_| HubError::CredentialStoreUnavailable)
    }

    #[cfg(target_os = "windows")]
    pub fn read(&self) -> HubResult<Option<String>> {
        match self.entry()?.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(HubError::CredentialStoreUnavailable),
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn read(&self) -> HubResult<Option<String>> {
        Err(HubError::CredentialStoreUnavailable)
    }

    #[cfg(target_os = "windows")]
    pub fn write(&self, token: &str) -> HubResult<()> {
        if token.trim().is_empty() {
            return Err(HubError::InvalidInput);
        }
        self.entry()?
            .set_password(token)
            .map_err(|_| HubError::CredentialStoreUnavailable)
    }

    #[cfg(not(target_os = "windows"))]
    pub fn write(&self, token: &str) -> HubResult<()> {
        let _ = token;
        Err(HubError::CredentialStoreUnavailable)
    }

    #[cfg(target_os = "windows")]
    pub fn delete(&self) -> HubResult<()> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(HubError::CredentialStoreUnavailable),
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn delete(&self) -> HubResult<()> {
        Err(HubError::CredentialStoreUnavailable)
    }

    pub fn has_token(&self) -> HubResult<bool> {
        Ok(self.read()?.is_some())
    }
}
