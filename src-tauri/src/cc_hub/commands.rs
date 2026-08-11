use crate::cc_hub::client::{HubClient, UsageLogRequest, UserListRequest};
use crate::cc_hub::config::ConnectionMeta;
use crate::cc_hub::contracts::{
    ConnectionState, ConnectionTestResult, FilterOptions, ProviderPatchResult, ProviderRow,
    QuotaUserPage, QuotaUserRow, UsageLogPage,
};
use crate::cc_hub::error::{HubError, HubResult, SafeCommandError};
use crate::cc_hub::AppState;
use futures_util::future::try_join_all;
use serde::Deserialize;
use tauri::State;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConnectionInput {
    pub base_url: String,
    pub admin_token: String,
    pub allow_insecure_http: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderListInput {
    pub query: Option<String>,
    pub provider_type: Option<String>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetProviderEnabledInput {
    pub provider_id: i64,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaUsersInput {
    pub cursor: Option<String>,
    pub query: Option<String>,
    pub status: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageLogsInput {
    pub cursor_created_at: Option<String>,
    pub cursor_id: Option<i64>,
    pub limit: Option<u32>,
    pub provider_id: Option<i64>,
    pub user_id: Option<i64>,
    pub model: Option<String>,
    pub status_code: Option<i64>,
    pub endpoint: Option<String>,
    pub start_time: Option<i64>,
    pub end_time: Option<i64>,
}

#[tauri::command]
pub fn get_cc_hub_connection_state(
    state: State<'_, AppState>,
) -> Result<ConnectionState, SafeCommandError> {
    state.connection_state().map_err(Into::into)
}

#[tauri::command]
pub async fn save_cc_hub_connection(
    state: State<'_, AppState>,
    input: SaveConnectionInput,
) -> Result<ConnectionState, SafeCommandError> {
    let SaveConnectionInput {
        base_url,
        admin_token,
        allow_insecure_http,
    } = input;
    let client = HubClient::new(
        state.transport.clone(),
        &base_url,
        admin_token.clone(),
        allow_insecure_http,
    )
    .map_err(SafeCommandError::from)?;
    let validation = client
        .validate_admin_connection()
        .await
        .map_err(SafeCommandError::from)?;
    let meta = ConnectionMeta::new(
        client.normalized_base_url(),
        allow_insecure_http,
        validation.api_version,
    );
    state
        .save_validated_connection(&meta, &admin_token)
        .map_err(SafeCommandError::from)?;
    state.connection_state().map_err(Into::into)
}

#[tauri::command]
pub async fn test_cc_hub_connection(
    state: State<'_, AppState>,
) -> Result<ConnectionTestResult, SafeCommandError> {
    let (client, _) = state.current_client().map_err(SafeCommandError::from)?;
    client
        .validate_admin_connection()
        .await
        .map_err(SafeCommandError::from)
}

#[tauri::command]
pub fn remove_cc_hub_connection(state: State<'_, AppState>) -> Result<(), SafeCommandError> {
    state.remove_connection().map_err(Into::into)
}

#[tauri::command]
pub async fn list_providers(
    state: State<'_, AppState>,
    input: ProviderListInput,
) -> Result<Vec<ProviderRow>, SafeCommandError> {
    let query = optional_text(input.query, 200).map_err(SafeCommandError::from)?;
    let provider_type = optional_text(input.provider_type, 80).map_err(SafeCommandError::from)?;
    let (client, _) = state.current_client().map_err(SafeCommandError::from)?;
    let providers = client
        .list_providers(query, provider_type)
        .await
        .map_err(SafeCommandError::from)?;
    Ok(match input.enabled {
        Some(enabled) => providers
            .into_iter()
            .filter(|provider| provider.is_enabled == enabled)
            .collect(),
        None => providers,
    })
}

#[tauri::command]
pub async fn set_provider_enabled(
    state: State<'_, AppState>,
    input: SetProviderEnabledInput,
) -> Result<ProviderPatchResult, SafeCommandError> {
    if input.provider_id < 0 {
        return Err(HubError::InvalidInput.into());
    }
    let (client, _) = state.current_client().map_err(SafeCommandError::from)?;
    let patch_result = client
        .set_provider_enabled(input.provider_id, input.enabled)
        .await
        .map_err(SafeCommandError::from)?;
    if patch_result.is_enabled != input.enabled {
        return Err(HubError::ContractMismatch.into());
    }
    Ok(patch_result)
}

#[tauri::command]
pub async fn list_quota_users(
    state: State<'_, AppState>,
    input: QuotaUsersInput,
) -> Result<QuotaUserPage, SafeCommandError> {
    let limit = input.limit.unwrap_or(25);
    if !(1..=100).contains(&limit) {
        return Err(HubError::InvalidInput.into());
    }
    let status = normalize_status(input.status).map_err(SafeCommandError::from)?;
    let request = UserListRequest {
        cursor: optional_text(input.cursor, 256).map_err(SafeCommandError::from)?,
        limit,
        query: optional_text(input.query, 200).map_err(SafeCommandError::from)?,
        status,
    };
    let (client, _) = state.current_client().map_err(SafeCommandError::from)?;
    let (users, page_info) = client
        .list_users(&request)
        .await
        .map_err(SafeCommandError::from)?;

    let mut items = Vec::with_capacity(users.len());
    for batch in users.chunks(4) {
        let results = try_join_all(batch.iter().cloned().map(|user| async {
            let usage = client.user_limit_usage(user.id).await?;
            Ok::<QuotaUserRow, HubError>(QuotaUserRow::from_seed_and_usage(user, usage))
        }))
        .await
        .map_err(SafeCommandError::from)?;
        items.extend(results);
    }

    Ok(QuotaUserPage { items, page_info })
}

#[tauri::command]
pub async fn list_usage_logs(
    state: State<'_, AppState>,
    input: UsageLogsInput,
) -> Result<UsageLogPage, SafeCommandError> {
    let cursor_created_at =
        optional_text(input.cursor_created_at, 128).map_err(SafeCommandError::from)?;
    let cursor_id = non_negative_id(input.cursor_id).map_err(SafeCommandError::from)?;
    if cursor_created_at.is_some() != cursor_id.is_some() {
        return Err(HubError::InvalidInput.into());
    }
    let limit = input.limit.unwrap_or(25);
    if !(1..=100).contains(&limit) {
        return Err(HubError::InvalidInput.into());
    }
    let request = UsageLogRequest {
        cursor_created_at,
        cursor_id,
        limit,
        provider_id: non_negative_id(input.provider_id).map_err(SafeCommandError::from)?,
        user_id: non_negative_id(input.user_id).map_err(SafeCommandError::from)?,
        model: optional_text(input.model, 200).map_err(SafeCommandError::from)?,
        status_code: non_negative_id(input.status_code).map_err(SafeCommandError::from)?,
        endpoint: optional_text(input.endpoint, 200).map_err(SafeCommandError::from)?,
        start_time: non_negative_id(input.start_time).map_err(SafeCommandError::from)?,
        end_time: non_negative_id(input.end_time).map_err(SafeCommandError::from)?,
    };
    let (client, _) = state.current_client().map_err(SafeCommandError::from)?;
    client
        .list_usage_logs(&request)
        .await
        .map_err(SafeCommandError::from)
}

#[tauri::command]
pub async fn get_usage_filter_options(
    state: State<'_, AppState>,
) -> Result<FilterOptions, SafeCommandError> {
    let (client, _) = state.current_client().map_err(SafeCommandError::from)?;
    client.usage_filter_options().await.map_err(Into::into)
}

fn optional_text(value: Option<String>, maximum_length: usize) -> HubResult<Option<String>> {
    match value {
        None => Ok(None),
        Some(value) => {
            let value = value.trim().to_owned();
            if value.is_empty() {
                Ok(None)
            } else if value.len() > maximum_length {
                Err(HubError::InvalidInput)
            } else {
                Ok(Some(value))
            }
        }
    }
}

fn non_negative_id(value: Option<i64>) -> HubResult<Option<i64>> {
    match value {
        Some(value) if value < 0 => Err(HubError::InvalidInput),
        _ => Ok(value),
    }
}

fn normalize_status(value: Option<String>) -> HubResult<Option<String>> {
    let value = optional_text(value, 32)?;
    match value.as_deref() {
        None => Ok(None),
        Some("active" | "expired" | "expiringSoon" | "enabled" | "disabled") => Ok(value),
        Some(_) => Err(HubError::InvalidInput),
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_status, optional_text};

    #[test]
    fn user_status_is_limited_to_the_confirmed_api_values() {
        assert_eq!(
            normalize_status(Some("enabled".to_owned())).unwrap(),
            Some("enabled".to_owned())
        );
        assert!(normalize_status(Some("admin".to_owned())).is_err());
    }

    #[test]
    fn empty_text_filters_are_omitted() {
        assert_eq!(optional_text(Some("  ".to_owned()), 20).unwrap(), None);
    }
}
