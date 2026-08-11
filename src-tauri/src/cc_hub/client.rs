use crate::cc_hub::contracts::{
    parse_currency_display, parse_filter_options, parse_health_version, parse_limit_usage,
    parse_openapi_version, parse_provider_list, parse_provider_patch_result, parse_time_zone,
    parse_usage_log_page, parse_users_page, ConnectionTestResult, FilterOptions, LimitUsage,
    PageInfo, ProviderPatchResult, ProviderRow, UsageLogPage, UserSeed,
};
use crate::cc_hub::error::{HubError, HubResult};
use reqwest::redirect::Policy;
use reqwest::{Method, RequestBuilder};
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;
use url::{Host, Url};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const PROVIDERS_PATH: &str = "/api/v1/providers";
const USERS_PATH: &str = "/api/v1/users";
const USAGE_LOGS_PATH: &str = "/api/v1/usage-logs";

#[derive(Clone)]
pub struct HttpTransport {
    client: reqwest::Client,
}

impl HttpTransport {
    pub fn new() -> HubResult<Self> {
        let client = reqwest::Client::builder()
            .use_rustls_tls()
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .redirect(Policy::none())
            .build()
            .map_err(|_| HubError::Network)?;
        Ok(Self { client })
    }
}

pub struct HubClient {
    transport: HttpTransport,
    base_url: Url,
    token: String,
}

#[derive(Debug, Clone)]
pub struct UserListRequest {
    pub cursor: Option<String>,
    pub limit: u32,
    pub query: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone)]
pub struct UsageLogRequest {
    pub cursor_created_at: Option<String>,
    pub cursor_id: Option<i64>,
    pub limit: u32,
    pub provider_id: Option<i64>,
    pub user_id: Option<i64>,
    pub model: Option<String>,
    pub status_code: Option<i64>,
    pub endpoint: Option<String>,
    pub start_time: Option<i64>,
    pub end_time: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProblemDetails {
    error_code: Option<String>,
}

impl HubClient {
    pub fn new(
        transport: HttpTransport,
        base_url: &str,
        token: String,
        allow_insecure_http: bool,
    ) -> HubResult<Self> {
        if token.trim().is_empty() {
            return Err(HubError::InvalidInput);
        }
        Ok(Self {
            transport,
            base_url: normalize_base_url(base_url, allow_insecure_http)?,
            token,
        })
    }

    pub fn normalized_base_url(&self) -> String {
        self.base_url.as_str().trim_end_matches('/').to_owned()
    }

    fn endpoint_url(&self, path: &str) -> Url {
        let prefix = self.base_url.path().trim_end_matches('/');
        let complete_path = if prefix.is_empty() || prefix == "/" {
            path.to_owned()
        } else {
            format!("{prefix}{path}")
        };
        let mut url = self.base_url.clone();
        url.set_path(&complete_path);
        url.set_query(None);
        url.set_fragment(None);
        url
    }

    fn authorized_request(&self, method: Method, url: Url) -> RequestBuilder {
        self.transport
            .client
            .request(method, url)
            .bearer_auth(&self.token)
    }

    async fn send_json(&self, request: RequestBuilder) -> HubResult<Value> {
        let response = request.send().await.map_err(map_request_error)?;
        let status = response.status();
        if !status.is_success() {
            let error_code = response
                .json::<ProblemDetails>()
                .await
                .ok()
                .and_then(|problem| HubError::safe_error_code(problem.error_code.as_deref()));
            return Err(HubError::Upstream {
                status: status.as_u16(),
                error_code,
            });
        }
        response
            .json::<Value>()
            .await
            .map_err(|_| HubError::ContractMismatch)
    }

    async fn get_json(&self, path: &str, query: Vec<(&str, String)>) -> HubResult<Value> {
        let mut url = self.endpoint_url(path);
        {
            let mut query_pairs = url.query_pairs_mut();
            for (name, value) in query {
                query_pairs.append_pair(name, &value);
            }
        }
        self.send_json(self.authorized_request(Method::GET, url))
            .await
    }

    pub async fn health_version(&self) -> HubResult<String> {
        parse_health_version(self.get_json("/api/v1/health", Vec::new()).await?)
    }

    pub async fn openapi_version(&self) -> HubResult<String> {
        parse_openapi_version(self.get_json("/api/v1/openapi.json", Vec::new()).await?)
    }

    pub async fn list_providers(
        &self,
        query: Option<String>,
        provider_type: Option<String>,
    ) -> HubResult<Vec<ProviderRow>> {
        let mut parameters = vec![("include", "statistics".to_owned())];
        append_non_empty(&mut parameters, "q", query);
        append_non_empty(&mut parameters, "providerType", provider_type);
        parse_provider_list(self.get_json(PROVIDERS_PATH, parameters).await?)
    }

    pub async fn set_provider_enabled(
        &self,
        provider_id: i64,
        enabled: bool,
    ) -> HubResult<ProviderPatchResult> {
        if provider_id < 0 {
            return Err(HubError::InvalidInput);
        }
        let response = self
            .send_json(
                self.authorized_request(
                    Method::PATCH,
                    self.endpoint_url(&format!("{PROVIDERS_PATH}/{provider_id}")),
                )
                .json(&json!({ "is_enabled": enabled })),
            )
            .await?;
        parse_provider_patch_result(response)
    }

    pub async fn list_users(
        &self,
        request: &UserListRequest,
    ) -> HubResult<(Vec<UserSeed>, PageInfo)> {
        let mut parameters = vec![("limit", request.limit.to_string())];
        append_non_empty(&mut parameters, "cursor", request.cursor.clone());
        append_non_empty(&mut parameters, "q", request.query.clone());
        append_non_empty(&mut parameters, "status", request.status.clone());
        parse_users_page(self.get_json(USERS_PATH, parameters).await?)
    }

    pub async fn user_limit_usage(&self, user_id: i64) -> HubResult<LimitUsage> {
        if user_id < 0 {
            return Err(HubError::InvalidInput);
        }
        parse_limit_usage(
            self.get_json(
                &format!("{USERS_PATH}/{user_id}/limit-usage:all"),
                Vec::new(),
            )
            .await?,
        )
    }

    pub async fn list_usage_logs(&self, request: &UsageLogRequest) -> HubResult<UsageLogPage> {
        if request.limit == 0 || request.limit > 100 {
            return Err(HubError::InvalidInput);
        }
        if request.cursor_created_at.is_some() != request.cursor_id.is_some() {
            return Err(HubError::InvalidInput);
        }
        if matches!((request.start_time, request.end_time), (Some(start), Some(end)) if start > end)
        {
            return Err(HubError::InvalidInput);
        }

        let mut parameters = vec![("limit", request.limit.to_string())];
        append_non_empty(
            &mut parameters,
            "cursorCreatedAt",
            request.cursor_created_at.clone(),
        );
        append_integer(&mut parameters, "cursorId", request.cursor_id);
        append_integer(&mut parameters, "providerId", request.provider_id);
        append_integer(&mut parameters, "userId", request.user_id);
        append_non_empty(&mut parameters, "model", request.model.clone());
        append_integer(&mut parameters, "statusCode", request.status_code);
        append_non_empty(&mut parameters, "endpoint", request.endpoint.clone());
        append_integer(&mut parameters, "startTime", request.start_time);
        append_integer(&mut parameters, "endTime", request.end_time);
        parse_usage_log_page(self.get_json(USAGE_LOGS_PATH, parameters).await?)
    }

    pub async fn filter_options(&self) -> HubResult<(Vec<String>, Vec<i64>, Vec<String>)> {
        parse_filter_options(
            self.get_json("/api/v1/usage-logs/filter-options", Vec::new())
                .await?,
        )
    }

    pub async fn time_zone(&self) -> HubResult<String> {
        parse_time_zone(self.get_json("/api/v1/system/timezone", Vec::new()).await?)
    }

    pub async fn currency_display(&self) -> HubResult<String> {
        parse_currency_display(
            self.get_json("/api/v1/system/display-settings", Vec::new())
                .await?,
        )
    }

    pub async fn usage_filter_options(&self) -> HubResult<FilterOptions> {
        let (models, status_codes, endpoints) = self.filter_options().await?;
        let time_zone = self.time_zone().await?;
        let currency_display = self.currency_display().await?;
        Ok(FilterOptions {
            models,
            status_codes,
            endpoints,
            time_zone,
            currency_display,
        })
    }

    pub async fn validate_admin_connection(&self) -> HubResult<ConnectionTestResult> {
        let api_version = self.health_version().await?;
        let openapi_version = self.openapi_version().await?;
        if openapi_version.trim().is_empty() {
            return Err(HubError::ContractMismatch);
        }
        let _providers = self.list_providers(None, None).await?;
        let (users, _) = self
            .list_users(&UserListRequest {
                cursor: None,
                limit: 1,
                query: None,
                status: None,
            })
            .await?;
        if let Some(user) = users.first() {
            let _usage = self.user_limit_usage(user.id).await?;
        }
        let _filter_options = self.usage_filter_options().await?;
        let _logs = self
            .list_usage_logs(&UsageLogRequest {
                cursor_created_at: None,
                cursor_id: None,
                limit: 1,
                provider_id: None,
                user_id: None,
                model: None,
                status_code: None,
                endpoint: None,
                start_time: None,
                end_time: None,
            })
            .await?;
        Ok(ConnectionTestResult {
            api_version,
            admin_access: true,
            capabilities: crate::cc_hub::contracts::Capabilities::contract_verified(),
        })
    }

    #[cfg(test)]
    pub(crate) fn endpoint_url_for_test(&self, path: &str) -> Url {
        self.endpoint_url(path)
    }
}

fn append_non_empty(
    parameters: &mut Vec<(&str, String)>,
    name: &'static str,
    value: Option<String>,
) {
    if let Some(value) = value.map(|value| value.trim().to_owned()) {
        if !value.is_empty() {
            parameters.push((name, value));
        }
    }
}

fn append_integer(parameters: &mut Vec<(&str, String)>, name: &'static str, value: Option<i64>) {
    if let Some(value) = value {
        parameters.push((name, value.to_string()));
    }
}

fn map_request_error(error: reqwest::Error) -> HubError {
    if error.is_timeout() {
        HubError::Timeout
    } else {
        HubError::Network
    }
}

pub fn normalize_base_url(raw: &str, allow_insecure_http: bool) -> HubResult<Url> {
    let mut url = Url::parse(raw.trim()).map_err(|_| HubError::InvalidBaseUrl)?;
    if !matches!(url.scheme(), "https" | "http") || url.host().is_none() {
        return Err(HubError::InvalidBaseUrl);
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(HubError::InvalidBaseUrl);
    }
    if url.scheme() == "http" && (!allow_insecure_http || !is_local_or_private(&url)) {
        return Err(HubError::InsecureTransport);
    }
    let path = url.path().trim_end_matches('/').to_owned();
    url.set_path(if path.is_empty() { "/" } else { &path });
    Ok(url)
}

fn is_local_or_private(url: &Url) -> bool {
    match url.host() {
        Some(Host::Domain(domain)) => {
            domain.eq_ignore_ascii_case("localhost") || domain.ends_with(".localhost")
        }
        Some(Host::Ipv4(address)) => {
            address.is_loopback() || address.is_private() || address.is_link_local()
        }
        Some(Host::Ipv6(address)) => {
            let octets = address.octets();
            address.is_loopback()
                || ((octets[0] & 0xfe) == 0xfc)
                || (octets[0] == 0xfe && (octets[1] & 0xc0) == 0x80)
        }
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_base_url, HttpTransport, HubClient};

    #[test]
    fn normalizes_a_https_base_url_with_a_reverse_proxy_prefix() {
        let url = normalize_base_url("https://hub.example.invalid/gateway/", false)
            .expect("valid https URL");
        assert_eq!(url.as_str(), "https://hub.example.invalid/gateway");
    }

    #[test]
    fn rejects_unsafe_or_ambiguous_urls() {
        assert!(normalize_base_url("https://admin@hub.example.invalid", false).is_err());
        assert!(normalize_base_url("https://hub.example.invalid?token=secret", false).is_err());
        assert!(normalize_base_url("http://hub.example.invalid", true).is_err());
        assert!(normalize_base_url("http://127.0.0.1:3000", false).is_err());
        assert!(normalize_base_url("http://127.0.0.1:3000", true).is_ok());
    }

    #[test]
    fn only_fixed_paths_are_joined_to_the_configured_base_url() {
        let client = HubClient::new(
            HttpTransport::new().expect("transport initializes"),
            "https://hub.example.invalid/gateway",
            "test-token".to_owned(),
            false,
        )
        .expect("client initializes");
        assert_eq!(
            client.endpoint_url_for_test("/api/v1/providers").as_str(),
            "https://hub.example.invalid/gateway/api/v1/providers"
        );
    }
}
