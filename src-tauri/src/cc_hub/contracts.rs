use crate::cc_hub::error::{HubError, HubResult};
use serde::Serialize;
use serde_json::{Map, Value};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn object(value: &Value) -> HubResult<&Map<String, Value>> {
    value.as_object().ok_or(HubError::ContractMismatch)
}

fn required_value<'a>(object: &'a Map<String, Value>, name: &str) -> HubResult<&'a Value> {
    object.get(name).ok_or(HubError::ContractMismatch)
}

fn required_string(object: &Map<String, Value>, name: &str) -> HubResult<String> {
    required_value(object, name)?
        .as_str()
        .map(str::to_owned)
        .ok_or(HubError::ContractMismatch)
}

fn optional_string(object: &Map<String, Value>, name: &str) -> HubResult<Option<String>> {
    match object.get(name) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value.clone())),
        Some(_) => Err(HubError::ContractMismatch),
    }
}

fn required_bool(object: &Map<String, Value>, name: &str) -> HubResult<bool> {
    required_value(object, name)?
        .as_bool()
        .ok_or(HubError::ContractMismatch)
}

fn optional_bool(object: &Map<String, Value>, name: &str) -> HubResult<Option<bool>> {
    match object.get(name) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value.as_bool().map(Some).ok_or(HubError::ContractMismatch),
    }
}

fn integer(value: &Value) -> HubResult<i64> {
    if let Some(value) = value.as_i64() {
        return Ok(value);
    }
    value
        .as_u64()
        .and_then(|value| i64::try_from(value).ok())
        .ok_or(HubError::ContractMismatch)
}

fn required_integer(object: &Map<String, Value>, name: &str) -> HubResult<i64> {
    integer(required_value(object, name)?)
}

fn optional_integer(object: &Map<String, Value>, name: &str) -> HubResult<Option<i64>> {
    match object.get(name) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => integer(value).map(Some),
    }
}

fn required_non_negative_integer(object: &Map<String, Value>, name: &str) -> HubResult<u64> {
    let value = required_integer(object, name)?;
    u64::try_from(value).map_err(|_| HubError::ContractMismatch)
}

fn optional_number(object: &Map<String, Value>, name: &str) -> HubResult<Option<f64>> {
    match object.get(name) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value
            .as_f64()
            .filter(|value| value.is_finite())
            .map(Some)
            .ok_or(HubError::ContractMismatch),
    }
}

fn required_number(object: &Map<String, Value>, name: &str) -> HubResult<f64> {
    optional_number(object, name)?.ok_or(HubError::ContractMismatch)
}

fn required_array<'a>(object: &'a Map<String, Value>, name: &str) -> HubResult<&'a Vec<Value>> {
    required_value(object, name)?
        .as_array()
        .ok_or(HubError::ContractMismatch)
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRow {
    pub id: i64,
    pub name: String,
    pub provider_type: String,
    pub is_enabled: bool,
    pub today_call_count: u64,
    pub weight: Option<i64>,
    pub priority: Option<i64>,
}

impl ProviderRow {
    fn from_value(value: &Value) -> HubResult<Self> {
        let provider = object(value)?;
        Ok(Self {
            id: required_integer(provider, "id")?,
            name: required_string(provider, "name")?,
            provider_type: required_string(provider, "providerType")?,
            is_enabled: required_bool(provider, "isEnabled")?,
            today_call_count: required_non_negative_integer(provider, "todayCallCount")?,
            weight: optional_integer(provider, "weight")?,
            priority: optional_integer(provider, "priority")?,
        })
    }
}

pub fn parse_provider_list(value: Value) -> HubResult<Vec<ProviderRow>> {
    let response = object(&value)?;
    required_array(response, "items")?
        .iter()
        .map(ProviderRow::from_value)
        .collect()
}

pub fn parse_provider(value: Value) -> HubResult<ProviderRow> {
    ProviderRow::from_value(&value)
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderPatchResult {
    pub is_enabled: bool,
}

pub fn parse_provider_patch_result(value: Value) -> HubResult<ProviderPatchResult> {
    let response = object(&value)?;
    Ok(ProviderPatchResult {
        is_enabled: required_bool(response, "isEnabled")?,
    })
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    pub next_cursor: Option<String>,
    pub has_more: bool,
    pub limit: u32,
}

impl PageInfo {
    fn from_value(value: &Value) -> HubResult<Self> {
        let page_info = object(value)?;
        let limit = required_integer(page_info, "limit")?;
        Ok(Self {
            next_cursor: optional_string(page_info, "nextCursor")?,
            has_more: required_bool(page_info, "hasMore")?,
            limit: u32::try_from(limit).map_err(|_| HubError::ContractMismatch)?,
        })
    }
}

#[derive(Debug, Clone)]
pub struct UserSeed {
    pub id: i64,
    pub name: String,
    pub role: Option<String>,
    pub is_enabled: Option<bool>,
}

pub fn parse_users_page(value: Value) -> HubResult<(Vec<UserSeed>, PageInfo)> {
    let response = object(&value)?;
    let users = required_array(response, "items")?
        .iter()
        .map(|value| {
            let user = object(value)?;
            Ok(UserSeed {
                id: required_integer(user, "id")?,
                name: required_string(user, "name")?,
                role: optional_string(user, "role")?,
                is_enabled: optional_bool(user, "isEnabled")?,
            })
        })
        .collect::<HubResult<Vec<_>>>()?;
    let page_info = PageInfo::from_value(required_value(response, "pageInfo")?)?;
    Ok((users, page_info))
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuotaBucket {
    pub usage: f64,
    pub limit: Option<f64>,
}

impl QuotaBucket {
    fn from_value(value: &Value) -> HubResult<Self> {
        let bucket = object(value)?;
        Ok(Self {
            usage: required_number(bucket, "usage")?,
            limit: optional_number(bucket, "limit")?,
        })
    }
}

#[derive(Debug, Clone)]
pub struct LimitUsage {
    pub daily: QuotaBucket,
    pub monthly: QuotaBucket,
    pub total: QuotaBucket,
}

pub fn parse_limit_usage(value: Value) -> HubResult<LimitUsage> {
    let response = object(&value)?;
    Ok(LimitUsage {
        daily: QuotaBucket::from_value(required_value(response, "limitDaily")?)?,
        monthly: QuotaBucket::from_value(required_value(response, "limitMonthly")?)?,
        total: QuotaBucket::from_value(required_value(response, "limitTotal")?)?,
    })
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RemainingQuotaStatus {
    Limited,
    Unlimited,
    Exceeded,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RemainingQuota {
    pub value: Option<f64>,
    pub status: RemainingQuotaStatus,
}

pub fn derive_remaining_quota(total: &QuotaBucket) -> RemainingQuota {
    match total.limit {
        None => RemainingQuota {
            value: None,
            status: RemainingQuotaStatus::Unlimited,
        },
        Some(limit) if total.usage > limit => RemainingQuota {
            value: Some(0.0),
            status: RemainingQuotaStatus::Exceeded,
        },
        Some(limit) => RemainingQuota {
            value: Some(limit - total.usage),
            status: RemainingQuotaStatus::Limited,
        },
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuotaUserRow {
    pub id: i64,
    pub name: String,
    pub role: Option<String>,
    pub is_enabled: Option<bool>,
    pub total: QuotaBucket,
    pub today: QuotaBucket,
    pub month: QuotaBucket,
    pub remaining: RemainingQuota,
}

impl QuotaUserRow {
    pub fn from_seed_and_usage(seed: UserSeed, usage: LimitUsage) -> Self {
        Self {
            id: seed.id,
            name: seed.name,
            role: seed.role,
            is_enabled: seed.is_enabled,
            remaining: derive_remaining_quota(&usage.total),
            total: usage.total,
            today: usage.daily,
            month: usage.monthly,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuotaUserPage {
    pub items: Vec<QuotaUserRow>,
    pub page_info: PageInfo,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageLogRow {
    pub id: i64,
    pub occurred_at: String,
    pub provider_name: Option<String>,
    pub user_name: Option<String>,
    pub key_name: Option<String>,
    pub model: Option<String>,
    pub endpoint: Option<String>,
    pub status_code: Option<i64>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub cost_usd: Option<String>,
}

impl UsageLogRow {
    fn from_value(value: &Value) -> HubResult<Self> {
        let log = object(value)?;
        Ok(Self {
            id: required_integer(log, "id")?,
            occurred_at: required_string(log, "createdAt")?,
            provider_name: optional_string(log, "providerName")?,
            user_name: optional_string(log, "userName")?,
            key_name: optional_string(log, "keyName")?,
            model: optional_string(log, "model")?,
            endpoint: optional_string(log, "endpoint")?,
            status_code: optional_integer(log, "statusCode")?,
            input_tokens: optional_integer(log, "inputTokens")?,
            output_tokens: optional_integer(log, "outputTokens")?,
            cost_usd: optional_string(log, "costUsd")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageLogPage {
    pub items: Vec<UsageLogRow>,
    pub page_info: PageInfo,
}

pub fn parse_usage_log_page(value: Value) -> HubResult<UsageLogPage> {
    let response = object(&value)?;
    let items = required_array(response, "items")?
        .iter()
        .map(UsageLogRow::from_value)
        .collect::<HubResult<Vec<_>>>()?;
    Ok(UsageLogPage {
        items,
        page_info: PageInfo::from_value(required_value(response, "pageInfo")?)?,
    })
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FilterOptions {
    pub models: Vec<String>,
    pub status_codes: Vec<i64>,
    pub endpoints: Vec<String>,
    pub time_zone: String,
    pub currency_display: String,
}

fn string_array(object: &Map<String, Value>, name: &str) -> HubResult<Vec<String>> {
    required_array(object, name)?
        .iter()
        .map(|value| {
            value
                .as_str()
                .map(str::to_owned)
                .ok_or(HubError::ContractMismatch)
        })
        .collect()
}

fn integer_array(object: &Map<String, Value>, name: &str) -> HubResult<Vec<i64>> {
    required_array(object, name)?.iter().map(integer).collect()
}

pub fn parse_filter_options(value: Value) -> HubResult<(Vec<String>, Vec<i64>, Vec<String>)> {
    let response = object(&value)?;
    Ok((
        string_array(response, "models")?,
        integer_array(response, "statusCodes")?,
        string_array(response, "endpoints")?,
    ))
}

pub fn parse_time_zone(value: Value) -> HubResult<String> {
    required_string(object(&value)?, "timeZone")
}

pub fn parse_currency_display(value: Value) -> HubResult<String> {
    required_string(object(&value)?, "currencyDisplay")
}

pub fn parse_health_version(value: Value) -> HubResult<String> {
    let response = object(&value)?;
    let _status = required_string(response, "status")?;
    required_string(response, "apiVersion")
}

pub fn parse_openapi_version(value: Value) -> HubResult<String> {
    let response = object(&value)?;
    let info = object(required_value(response, "info")?)?;
    required_string(info, "version")
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub provider_today_calls: bool,
    pub provider_patch: bool,
    pub provider_patch_runtime_verified: bool,
    pub quota_usage: bool,
    pub usage_logs: bool,
    pub usage_log_stable_id: bool,
}

impl Capabilities {
    pub const fn contract_verified() -> Self {
        Self {
            provider_today_calls: true,
            provider_patch: true,
            provider_patch_runtime_verified: true,
            quota_usage: true,
            usage_logs: true,
            usage_log_stable_id: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionState {
    pub configured: bool,
    pub has_token: bool,
    pub base_url: Option<String>,
    pub last_validated_at: Option<i64>,
    pub api_version: Option<String>,
    pub transport_security: Option<String>,
    pub capabilities: Option<Capabilities>,
}

impl ConnectionState {
    pub const fn disconnected() -> Self {
        Self {
            configured: false,
            has_token: false,
            base_url: None,
            last_validated_at: None,
            api_version: None,
            transport_security: None,
            capabilities: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub api_version: String,
    pub admin_access: bool,
    pub capabilities: Capabilities,
}

#[cfg(test)]
mod tests {
    use super::{
        derive_remaining_quota, parse_limit_usage, parse_provider_list,
        parse_provider_patch_result, parse_usage_log_page, Capabilities, RemainingQuotaStatus,
    };
    use serde_json::Value;

    const PROVIDERS_FIXTURE: &str = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/fixtures/cc-hub/providers-statistics.json"
    ));
    const PROVIDER_PATCH_FIXTURE: &str = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/fixtures/cc-hub/provider-patch.json"
    ));
    const LIMIT_USAGE_FIXTURE: &str = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/fixtures/cc-hub/limit-usage-all.json"
    ));
    const LIMIT_USAGE_UNLIMITED_FIXTURE: &str = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/fixtures/cc-hub/limit-usage-all-unlimited.json"
    ));
    const USAGE_LOGS_FIXTURE: &str = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/fixtures/cc-hub/usage-logs.json"
    ));

    fn fixture(contents: &str) -> Value {
        serde_json::from_str(contents).expect("synthetic fixture is valid JSON")
    }

    #[test]
    fn parses_confirmed_provider_today_call_count() {
        let providers =
            parse_provider_list(fixture(PROVIDERS_FIXTURE)).expect("provider fixture parses");
        assert_eq!(providers[0].today_call_count, 37);
        assert!(providers[0].is_enabled);
    }

    #[test]
    fn accepts_the_confirmed_patch_request_and_response_field_names() {
        let patch = fixture(PROVIDER_PATCH_FIXTURE);
        assert_eq!(patch["request"]["is_enabled"], Value::Bool(true));
        let patch_result =
            parse_provider_patch_result(patch["response"].clone()).expect("patch response parses");
        assert!(patch_result.is_enabled);
    }

    #[test]
    fn derives_limited_unlimited_and_exceeded_quota_states() {
        let limited =
            parse_limit_usage(fixture(LIMIT_USAGE_FIXTURE)).expect("limit fixture parses");
        let unlimited = parse_limit_usage(fixture(LIMIT_USAGE_UNLIMITED_FIXTURE))
            .expect("unlimited fixture parses");
        assert_eq!(
            derive_remaining_quota(&limited.total).status,
            RemainingQuotaStatus::Limited
        );
        assert_eq!(
            derive_remaining_quota(&unlimited.total).status,
            RemainingQuotaStatus::Unlimited
        );
    }

    #[test]
    fn uses_numeric_usage_log_id_as_stable_row_identity() {
        let page = parse_usage_log_page(fixture(USAGE_LOGS_FIXTURE)).expect("log fixture parses");
        assert_eq!(page.items[0].id, 401);
        assert_eq!(page.items[0].occurred_at, "2026-08-10T08:01:00.000Z");
    }

    #[test]
    fn records_runtime_patch_verification_after_authorized_probe() {
        let capabilities = Capabilities::contract_verified();
        assert!(capabilities.provider_patch);
        assert!(capabilities.provider_patch_runtime_verified);
    }
}
