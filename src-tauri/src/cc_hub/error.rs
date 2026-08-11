use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HubError {
    InvalidInput,
    InvalidBaseUrl,
    InsecureTransport,
    NotConfigured,
    ConfigUnavailable,
    CredentialStoreUnavailable,
    CredentialMissing,
    Network,
    Timeout,
    Unauthorized,
    Forbidden,
    Upstream {
        status: u16,
        error_code: Option<String>,
    },
    ContractMismatch,
    Storage,
}

impl HubError {
    pub fn safe_error_code(value: Option<&str>) -> Option<String> {
        let value = value?;
        if value.is_empty() || value.len() > 64 {
            return None;
        }
        if value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        }) {
            Some(value.to_owned())
        } else {
            None
        }
    }

    pub fn command_code(&self) -> &'static str {
        match self {
            Self::InvalidInput => "invalid_input",
            Self::InvalidBaseUrl => "invalid_base_url",
            Self::InsecureTransport => "insecure_transport",
            Self::NotConfigured => "not_configured",
            Self::ConfigUnavailable => "config_unavailable",
            Self::CredentialStoreUnavailable => "credential_store_unavailable",
            Self::CredentialMissing => "credential_missing",
            Self::Network => "network_error",
            Self::Timeout => "request_timeout",
            Self::Unauthorized => "unauthorized",
            Self::Forbidden => "forbidden",
            Self::Upstream { status, .. } if *status == 401 => "unauthorized",
            Self::Upstream { status, .. } if *status == 403 => "forbidden",
            Self::Upstream { .. } => "upstream_error",
            Self::ContractMismatch => "upstream_contract_mismatch",
            Self::Storage => "storage_error",
        }
    }

    pub fn status(&self) -> Option<u16> {
        match self {
            Self::Unauthorized => Some(401),
            Self::Forbidden => Some(403),
            Self::Upstream { status, .. } => Some(*status),
            _ => None,
        }
    }

    pub fn upstream_error_code(&self) -> Option<&str> {
        match self {
            Self::Upstream { error_code, .. } => error_code.as_deref(),
            _ => None,
        }
    }
}

impl fmt::Display for HubError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.command_code())
    }
}

impl std::error::Error for HubError {}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeCommandError {
    pub code: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
}

impl From<HubError> for SafeCommandError {
    fn from(error: HubError) -> Self {
        Self {
            code: error.command_code(),
            status: error.status(),
            error_code: error
                .upstream_error_code()
                .and_then(|value| HubError::safe_error_code(Some(value))),
        }
    }
}

pub type HubResult<T> = Result<T, HubError>;

#[cfg(test)]
mod tests {
    use super::{HubError, SafeCommandError};

    #[test]
    fn command_error_never_serializes_upstream_detail() {
        let error = SafeCommandError::from(HubError::Upstream {
            status: 403,
            error_code: Some("auth.forbidden".to_owned()),
        });
        let serialized = serde_json::to_string(&error).expect("safe error serializes");
        assert!(serialized.contains("auth.forbidden"));
        assert!(!serialized.contains("detail"));
        assert!(!serialized.contains("token"));
    }

    #[test]
    fn unsafe_upstream_error_codes_are_discarded() {
        assert_eq!(
            HubError::safe_error_code(Some("auth.forbidden")),
            Some("auth.forbidden".to_owned())
        );
        assert_eq!(HubError::safe_error_code(Some("detail:secret")), None);
    }
}
