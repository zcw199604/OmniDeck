pub mod client;
pub mod commands;
pub mod config;
pub mod contracts;
pub mod credentials;
pub mod error;

use crate::cc_hub::client::{HttpTransport, HubClient};
use crate::cc_hub::config::{ConfigStore, ConnectionMeta};
use crate::cc_hub::contracts::{Capabilities, ConnectionState};
use crate::cc_hub::credentials::CredentialStore;
use crate::cc_hub::error::{HubError, HubResult};
use std::path::PathBuf;

pub struct AppState {
    pub(crate) transport: HttpTransport,
    config: ConfigStore,
    credentials: CredentialStore,
}

impl AppState {
    pub fn new(config_dir: PathBuf) -> HubResult<Self> {
        Ok(Self {
            transport: HttpTransport::new()?,
            config: ConfigStore::from_config_dir(config_dir)?,
            credentials: CredentialStore::new(),
        })
    }

    pub(crate) fn current_client(&self) -> HubResult<(HubClient, ConnectionMeta)> {
        let meta = self.config.read()?.ok_or(HubError::NotConfigured)?;
        let token = self
            .credentials
            .read()?
            .ok_or(HubError::CredentialMissing)?;
        let client = HubClient::new(
            self.transport.clone(),
            &meta.base_url,
            token,
            meta.allow_insecure_http,
        )?;
        Ok((client, meta))
    }

    pub(crate) fn connection_state(&self) -> HubResult<ConnectionState> {
        let Some(meta) = self.config.read()? else {
            return Ok(ConnectionState::disconnected());
        };
        let has_token = self.credentials.has_token()?;
        Ok(ConnectionState {
            configured: has_token,
            has_token,
            base_url: Some(meta.base_url),
            last_validated_at: Some(meta.last_validated_at),
            api_version: Some(meta.api_version),
            transport_security: Some(if meta.allow_insecure_http {
                "acknowledged-insecure".to_owned()
            } else {
                "secure".to_owned()
            }),
            capabilities: Some(Capabilities::contract_verified()),
        })
    }

    pub(crate) fn save_validated_connection(
        &self,
        meta: &ConnectionMeta,
        token: &str,
    ) -> HubResult<()> {
        let previous_token = self.credentials.read()?;
        self.credentials.write(token)?;
        if let Err(error) = self.config.write(meta) {
            match previous_token {
                Some(previous_token) => {
                    let _ = self.credentials.write(&previous_token);
                }
                None => {
                    let _ = self.credentials.delete();
                }
            }
            return Err(error);
        }
        Ok(())
    }

    pub(crate) fn remove_connection(&self) -> HubResult<()> {
        self.credentials.delete()?;
        self.config.clear()
    }
}
