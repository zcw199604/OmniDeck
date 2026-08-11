# Claude Code Hub 管理员 API 手册

> **类型**: 外部工具 API 参考（非本知识库项目自身 API）
> **上游仓库**: https://github.com/ding113/claude-code-hub
> **文档对应版本**: v0.9.2（commit `ccbad37`, 2026-08-04）
> **整理日期**: 2026-08-10
> **内容来源**: 上游 `docs/api/v1/README.md`、`docs/api-authentication-guide.md`、`docs/security/api-key-admin-access.md`、`docs/api-docs-summary.md`、`docs/public-status-api.md` 及 `src/app/api/**`、`server-lib/**`、`server.js` 源码。各端点均标注来源，便于日后对照上游更新。
> **运行时契约核验**: 2026-08-10 已对获授权测试实例完成只读探测，`/api/v1/openapi.json` 的 `info.version` 为 `1.0.0`。脱敏的选择性契约快照与合成响应见 `tests/fixtures/cc-hub/`；其中 provider PATCH 仅确认了 OpenAPI 请求/响应形状，真实可逆写入仍待单独授权。

---

## 1. 概述

Claude Code Hub（CC Hub）是一个 Claude Code 网关/管理平台（Next.js + Hono，自定义 Node.js server）。对外暴露的 HTTP 面按用途分为五大家族：

| API 家族 | 前缀 | 说明 |
|---|---|---|
| 管理 REST API v1 | `/api/v1/*` | 官方推荐的管理 API（Hono + OpenAPI），管理员/用户均可按层级访问 |
| 专有管理端点 | `/api/admin/*` | 仅 admin 角色、仅 session cookie 认证（Next.js 直连路由） |
| Legacy Server Action API | `/api/actions/*` | 已弃用的旧式管理接口（`POST /api/actions/{module}/{action}`），默认保留并带弃用响应头 |
| 公共状态 / 健康 / 半公开 | `/api/public-status`、`/api/health/*`、`/api/prices`、`/api/leaderboard` 等 | 状态页、健康检查、价格与排行榜 |
| OpenAI 兼容代理端点 | `/v1/*` | Claude/OpenAI 兼容代理（`/v1/messages`、`/v1/responses`、`/v1/chat/completions`、`/v1/models`） |

**v1 管理 API 文档入口**（运行时）：
- OpenAPI JSON: `GET /api/v1/openapi.json`
- Scalar UI: `GET /api/v1/scalar`
- Swagger UI: `GET /api/v1/docs`
- Legacy 文档: `GET /api/actions/openapi.json`、`/api/actions/docs`、`/api/actions/scalar`

每个 v1 响应都带响应头 `X-API-Version: 1.0.0`。

---

## 2. 认证与权限层级

### 2.1 三种凭据传输方式

| 传输方式 | Header / Cookie | 允许层级 | 说明 |
|---|---|---|---|
| Cookie 会话 | `Cookie: auth-token=<session>` | read / admin | 浏览器登录后自动携带；写操作需要 CSRF token |
| Bearer Token | `Authorization: Bearer <token>` | read / admin | 接受 session、opaque session token、`ADMIN_TOKEN`、用户 API key（受层级限制） |
| API Key 头 | `X-Api-Key: <key>` | read（默认）；admin 需开关 | 默认不能访问 admin 路由 |

### 2.2 访问层级（AuthTier）

| 层级 | 说明 |
|---|---|
| `public` | 无需认证。例：`GET /api/v1/public/status` |
| `read` | 接受有效 session、`ADMIN_TOKEN` 或任意有效用户 API key |
| `admin` | 接受有效 session cookie、opaque session Bearer token、`ADMIN_TOKEN`。**用户 API key 默认被拒绝**，除非开启 `ENABLE_API_KEY_ADMIN_ACCESS=true` 且 key 属于 admin 角色用户 |

### 2.3 关键配置项

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `ENABLE_API_KEY_ADMIN_ACCESS` | `false` | `true` 时允许属于 admin 用户的 API key 访问 admin 路由 |
| `ADMIN_TOKEN` | - | 作为 Bearer 使用即视为 admin 凭据 |
| `CSRF_SECRET` | - | 生产必须设置；多副本使用同一值 |
| `ENABLE_LEGACY_ACTIONS_API` | `true` | `false` 时 legacy action 执行返回 `410 Gone` |
| `LEGACY_ACTIONS_DOCS_MODE` | - | `hidden` 时隐藏 legacy 文档 |
| `LEGACY_ACTIONS_SUNSET_DATE` | - | 覆盖 legacy API 的 `Sunset` 响应头 |

### 2.4 CSRF 规则

- Cookie 认证的 `POST/PUT/PATCH/DELETE`：先 `GET /api/v1/auth/csrf` 取 token，再在请求头带 `X-CCH-CSRF: <token>`。
- Bearer / `X-Api-Key` 认证：不需要 CSRF。
- 登录/登出（`/api/auth/login`、`/api/auth/logout`）使用独立的 CSRF origin guard，规则不同。

### 2.5 Legacy Actions 弃用响应头

`/api/actions/*` 默认返回（直至 sunset）：
```
Deprecation: @1777420800
Sunset: Thu, 31 Dec 2026 00:00:00 GMT
Link: </api/v1/openapi.json>; rel="successor-version"
```

---

## 3. 错误格式（RFC 9457）

失败响应统一为 `application/problem+json`：

```json
{
  "type": "urn:claude-code-hub:problem:auth.forbidden",
  "title": "Forbidden",
  "status": 403,
  "detail": "Admin access is required.",
  "instance": "/api/v1/providers",
  "errorCode": "auth.forbidden",
  "errorParams": {}
}
```

前端应依据 `errorCode` 与 `errorParams` 本地化，不直接展示 `detail`。

---

## 4. 管理 REST API v1（`/api/v1/*`）

> 来源：`src/app/api/v1/resources/<resource>/router.ts`；根路由 `src/app/api/v1/_root/app.ts`。
> 层级标注：`public` / `read` / `admin`。未标注的 v1 资源端点默认 `admin`（Providers、Model Prices、Audit Logs、Error Rules、Request Filters、Sensitive Words、Notifications、Webhook Targets 等资源整体为 admin）。

### 4.0 根级路由

| 方法 | 路径 | 层级 | 功能 | 返回示例 |
|---|---|---|---|---|
| GET | `/api/v1/health` | public | 管理 API 壳健康检查 | `{"status":"ok","apiVersion":"1.0.0"}` |
| GET | `/api/v1/auth/csrf` | read | 签发 CSRF token | `{"csrfToken":"<token>"}` |

### 4.1 Users（`resources/users/router.ts`）

| 方法 | 路径 | 层级 | 功能 / 请求参数 |
|---|---|---|---|
| GET | `/api/v1/users` | admin | 用户列表。query：`cursor`(string)、`limit`(int 1-100，默认50)、`q`(搜索)、`tags`(逗号分隔)、`keyGroups`、`status`(active/expired/expiringSoon/enabled/disabled)、`sortBy`(name/tags/expiresAt/rpm/limit5hUsd/limitDailyUsd/limitWeeklyUsd/limitMonthlyUsd/createdAt)、`sortOrder`(asc/desc)。返回 `{items, pageInfo:{nextCursor,hasMore,limit}}` |
| POST | `/api/v1/users` | admin | 创建用户。body：`name`(必填)、`note`、`providerGroup`、`tags`、`rpm`、`dailyQuota`、`limit5hUsd`、`limit5hResetMode`、`limitWeeklyUsd`、`limitMonthlyUsd`、`limitTotalUsd`、`limitConcurrentSessions`、`dailyResetMode`、`dailyResetTime`、`isEnabled`、`expiresAt`、`allowedClients`、`blockedClients`、`allowedModels`。返回 201 |
| GET | `/api/v1/users:self` | read | 当前用户信息（legacy 列表形态） |
| GET | `/api/v1/users/tags` | admin | 用户标签列表。返回 `{items:string[]}` |
| GET | `/api/v1/users/key-groups` | admin | 用户 key 供应商分组列表。返回 `{items:string[]}` |
| GET | `/api/v1/users:filter-search` | admin | 紧凑用户选项。query：`q`、`limit`(1-5000，默认20) |
| GET | `/api/v1/users:search` | admin | 用户搜索结果。query 同上 |
| POST | `/api/v1/users:usageBatch` | admin | 批量查询用户 key 用量。body：`{userIds:number[]}`(≤500)。目标实例返回 `{usageByKeyId: Record<string, {todayCallCount,todayTokens,todayUsage,lastProviderName,lastUsedAt,modelStats}>}`；该数据按 key 聚合且不含完整日/月/总额度桶，不能作为额度页主数据源。 |
| POST | `/api/v1/users:batchUpdate` | admin | 批量更新。body：`{userIds:number[], updates:{note,tags,rpm,dailyQuota,limit5hUsd,limit5hResetMode,limitWeeklyUsd,limitMonthlyUsd}}` |
| GET | `/api/v1/users/{id}` | admin | 用户详情。返回 `UserDetailResponseSchema`（id/name/role/rpm/dailyQuota/providerGroup/tags/limits/expiresAt 等） |
| PATCH | `/api/v1/users/{id}` | admin | 部分更新用户。body：`UserUpdateSchema`(partial strict) |
| DELETE | `/api/v1/users/{id}` | admin | 删除用户。204 |
| POST | `/api/v1/users/{id}:enable` | admin | 启用/禁用。body：`{enabled:boolean}` |
| POST | `/api/v1/users/{id}:renew` | admin | 续期。body：`{expiresAt:string, enableUser?:boolean}` |
| GET | `/api/v1/users/{id}/limit-usage` | read | 用户 RPM/日成本用量。返回 `{rpm:{current,limit,window}, dailyCost:{current,limit,resetAt}}` |
| GET | `/api/v1/users/{id}/limit-usage:all` | read | 全部成本桶。目标实例中每个 `limit5h/limitDaily/limitWeekly/limitMonthly/limitTotal` 桶均为 `{usage:number,limit:number|null}`；已配置总额度的 `limitTotal.limit` 与用户列表 `limitTotalUsd` 一致，`limit:null` 表示该项未配置额度上限。 |
| POST | `/api/v1/users/{id}/limits:reset` | admin | 重置限额计数（不删日志）。204 |
| POST | `/api/v1/users/{id}/statistics:reset` | admin | 异步重置统计。202 + `Location` 头。返回 `{resetId,userId,status,requestedAt,deletedMessageRequests,deletedUsageLedger,errorCode}` |
| GET | `/api/v1/users/{id}/statistics-resets/{resetId}` | admin | 查询异步重置状态。params：`id`、`resetId`(uuid) |

**用户列表返回示例**（来自 `docs/api-authentication-guide.md`，旧包装形态）：
```json
{ "users": [ { "id": 1, "name": "admin", "role": "admin" } ], "nextCursor": null, "hasMore": false }
```
> ⚠️ v1 schema 实际为 `{items, pageInfo}` 形态（`createCursorResponseSchema`），文档示例为迁移前的旧包装，两者并存；以 schema 的 `items/pageInfo` 为准。

### 4.2 Keys（`resources/keys/router.ts`）

| 方法 | 路径 | 层级 | 功能 / 请求参数 |
|---|---|---|---|
| GET | `/api/v1/users/{userId}/keys` | admin | 用户 key 列表。params：`userId`；query：`cursor`、`limit`(默认50) |
| POST | `/api/v1/users/{userId}/keys` | admin | 为用户创建 key。body：`KeyCreateSchema`（name/expiresAt/canLoginWebUi/限额/providerGroup/cacheTtlPreference 等） |
| POST | `/api/v1/users:self/keys` | read | 当前用户创建自己的 key（只读 session 拒绝） |
| POST | `/api/v1/keys/{keyId}:enable` | read | 启停 key（admin 任意，普通用户仅自己的） |
| POST | `/api/v1/keys/{keyId}:renew` | read | 续期 key |
| GET | `/api/v1/keys/{keyId}:reveal` | read | 揭示明文 key（所有权检查，记审计日志；`Cache-Control: no-store`） |
| GET | `/api/v1/keys/{keyId}` | admin | key 详情 |
| PATCH | `/api/v1/keys/{keyId}` | read | 更新 key |
| DELETE | `/api/v1/keys/{keyId}` | read | 删除 key。204 |
| POST | `/api/v1/keys/{keyId}/limits:reset` | admin | 重置 key 限额计数。204 |
| GET | `/api/v1/keys/{keyId}/limit-usage` | read | key 成本桶 + 并发会话 |
| GET | `/api/v1/keys/{keyId}/quota` | admin | key 配额 |
| PATCH | `/api/v1/keys/{keyId}/limits/{field}` | admin | 单字段改限额。params：`keyId`、`field` |
| POST | `/api/v1/keys:batchUpdate` | admin | 批量更新 key |

### 4.3 Providers（`resources/providers/router.ts`）— 全部 admin

| 方法 | 路径 | 功能 / 请求参数 |
|---|---|---|
| GET | `/api/v1/providers` | 列表。query：`q`(搜索)、`providerType`(枚举)、`include=statistics`。目标实例的 item 包含 `id/name/providerType/isEnabled/weight/priority`、`todayCallCount:number`、`todayTotalCostUsd:string`，以及 `statistics:{todayCalls:number,todayCost:string,lastCallModel,lastCallTime}`；管理界面以顶层 `todayCallCount` 为今日调用数。 |
| POST | `/api/v1/providers` | 创建 provider。body：`ProviderCreateSchema` |
| GET | `/api/v1/providers/{id}` | 单个 provider。返回 `ProviderSummarySchema`（id/name/url/maskedKey/isEnabled/weight/priority/limits/circuitBreaker 参数/proxyUrl/codex 偏好 等） |
| PATCH | `/api/v1/providers/{id}` | 部分更新。目标 OpenAPI 的请求字段为 snake_case；启停最小 body 是 `{is_enabled:boolean}`，成功响应的状态字段为 camelCase `isEnabled`，并带 `X-CCH-Undo-Token` / `X-CCH-Operation-Id` 头。字段形状及一次保持当前状态的真实可逆写入已在授权的非关键停用 provider 上核验，响应状态与复读状态一致。
| DELETE | `/api/v1/providers/{id}` | 删除。204 + undo 头 |
| GET | `/api/v1/providers/{id}/key:reveal` | 揭示明文 key。返回 `{key:string}`；记审计日志 |
| GET | `/api/v1/providers/health` | 熔断健康。query：`groupSlugs` |
| GET | `/api/v1/providers/cache-effectiveness` | prompt cache 命中效率窗口 |
| POST | `/api/v1/providers/{id}/circuit:reset` | 重置单个熔断器 |
| POST | `/api/v1/providers/{id}/usage:reset` | 重置总用量下界 |
| POST | `/api/v1/providers/circuits:batchReset` | 批量重置熔断。body：`{providerIds:number[]}` |
| GET | `/api/v1/providers/{id}/limit-usage` | 成本/并发桶 |
| POST | `/api/v1/providers/limit-usage:batch` | 批量限额用量 |
| GET | `/api/v1/providers/groups` | provider 分组（含计数） |
| POST | `/api/v1/providers:autoSortPriority` | 按成本系数自动排序。body：`{confirm:boolean}`(默认 false=预览) |
| POST | `/api/v1/providers:batchUpdate` | 批量更新 |
| POST | `/api/v1/providers:batchDelete` | 批量删除（返回 undo 元数据） |
| POST | `/api/v1/providers:undoDelete` | 撤销删除。body：`ProviderUndoBodySchema` |
| POST | `/api/v1/providers:batchPatch:preview` | 批量补丁预览 |
| POST | `/api/v1/providers:batchPatch:apply` | 应用已预览补丁 |
| POST | `/api/v1/providers:undoPatch` | 撤销补丁（undo 窗口内） |
| POST | `/api/v1/providers/test:proxy` | 经代理连通性测试 |
| POST | `/api/v1/providers/test:unified` | 统一 relay 风格测试。body 需 `providerType` |
| POST | `/api/v1/providers/{id}/test` | 用存储凭据测试指定 provider |
| POST | `/api/v1/providers/test:anthropic-messages` | Anthropic Messages 测试 |
| POST | `/api/v1/providers/test:openai-chat-completions` | OpenAI Chat 测试 |
| POST | `/api/v1/providers/test:openai-responses` | OpenAI Responses 测试 |
| POST | `/api/v1/providers/test:gemini` | Gemini 测试 |
| GET | `/api/v1/providers/test:presets` | 测试预设。query：`providerType` |
| POST | `/api/v1/providers/upstream-models:fetch` | 拉取上游模型。body：`ProviderFetchUpstreamModelsSchema` |
| GET | `/api/v1/providers/model-suggestions` | 模型建议。query：`ProviderModelSuggestionsQuerySchema` |
| POST | `/api/v1/providers/vendors:recluster` | vendor 重组。body：`{confirm:boolean}` |

**Provider key reveal 返回示例**：
```json
{ "key": "sk-ant-xxxxxxxx..." }
```

### 4.4 Provider Endpoints / Vendors（`resources/provider-endpoints/router.ts`）— 全部 admin

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/v1/provider-vendors` | vendor 列表。query：`ProviderVendorListQuerySchema` |
| GET | `/api/v1/provider-vendors/{vendorId}` | 单个 vendor |
| PATCH | `/api/v1/provider-vendors/{vendorId}` | 更新 vendor 展示元数据 |
| DELETE | `/api/v1/provider-vendors/{vendorId}` | 删除 vendor。204 |
| GET | `/api/v1/provider-vendors/{vendorId}/endpoints` | vendor 下端点。query：`providerType` 等 |
| POST | `/api/v1/provider-vendors/{vendorId}/endpoints` | 创建端点。body：`ProviderEndpointCreateSchema`（需 providerType） |
| PATCH | `/api/v1/provider-endpoints/{endpointId}` | 更新端点。204 |
| DELETE | `/api/v1/provider-endpoints/{endpointId}` | 软删除端点（无启用 provider 引用时）。204 |
| POST | `/api/v1/provider-endpoints/{endpointId}:probe` | 手动测活并记录。body 可选 `{timeoutMs}` |
| GET | `/api/v1/provider-endpoints/{endpointId}/probe-logs` | 测活历史。query：`ProviderProbeLogsQuerySchema` |
| POST | `/api/v1/provider-endpoints/probe-logs:batch` | 批量测活历史。body：`{endpointIds[], limit?}` |
| POST | `/api/v1/provider-vendors/endpoint-stats:batch` | vendor+type 端点统计。body：`{vendorIds[], providerType}` |
| GET | `/api/v1/provider-endpoints/{endpointId}/circuit` | 端点熔断状态 |
| POST | `/api/v1/provider-endpoints/circuits:batch` | 批量端点熔断 |
| POST | `/api/v1/provider-endpoints/{endpointId}/circuit:reset` | 重置端点熔断。204 |
| GET | `/api/v1/provider-vendors/{vendorId}/circuit` | vendor+type 熔断。query：`providerType` |
| POST | `/api/v1/provider-vendors/{vendorId}/circuit:setManualOpen` | 手动打开熔断。body：`{providerType, manualOpen:boolean}`。204 |
| POST | `/api/v1/provider-vendors/{vendorId}/circuit:reset` | 重置 vendor+type 熔断。204 |

### 4.5 Provider Groups（`resources/provider-groups/router.ts`）— 全部 admin

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/v1/provider-groups` | 分组列表（含 provider 计数） |
| POST | `/api/v1/provider-groups` | 创建分组。body：`ProviderGroupCreateSchema` |
| PATCH | `/api/v1/provider-groups/{id}` | 更新分组 |
| DELETE | `/api/v1/provider-groups/{id}` | 删除分组（非默认且未使用）。204 |

### 4.6 System（`resources/system/router.ts`）

| 方法 | 路径 | 层级 | 功能 |
|---|---|---|---|
| GET | `/api/v1/system/settings` | admin | 全量系统设置。返回 `SystemSettingsSchema`（siteTitle/allowGlobalUsageView/currencyDisplay/discovery 参数/timezone/autoCleanup/rectifier 开关/quota lease 等） |
| PUT | `/api/v1/system/settings` | admin | 部分更新并失效运行时缓存。body：`SystemSettingsUpdateSchema`(partial strict)；415 不支持的媒体类型 |
| GET | `/api/v1/system/display-settings` | read | 只读展示设置。返回 `{siteTitle,currencyDisplay,billingModelSource}` |
| GET | `/api/v1/system/timezone` | read | 服务器时区。返回 `{timeZone:string}` |

### 4.7 Usage Logs（`resources/usage-logs/router.ts`）

| 方法 | 路径 | 层级 | 功能 / 参数 |
|---|---|---|---|
| GET | `/api/v1/usage-logs` | read | 日志列表。已确认 cursor 参数为 `cursorCreatedAt`、`cursorId`、`limit`；也支持 legacy `page/pageSize`。筛选可用 `userId`、`keyId`、`providerId`、`model`、`statusCode`、`endpoint`、`startTime/endTime`（Unix 毫秒）。返回 `{items,pageInfo:{nextCursor,hasMore,limit},sourceSessionIdsByIdentity}`；目标实例默认 `createdAt` 倒序，行有数值 `id`、`createdAt`、provider/user/key 名称、模型、端点、状态、Token 和字符串 `costUsd`。 |
| GET | `/api/v1/usage-logs/stats` | read | 聚合统计 |
| GET | `/api/v1/usage-logs/filter-options` | admin | 缓存模型/状态码/端点过滤选项 |
| GET | `/api/v1/usage-logs/models` | admin | 去重模型列表。返回 `{items:string[]}` |
| GET | `/api/v1/usage-logs/status-codes` | admin | 去重状态码。返回 `{items:number[]}` |
| GET | `/api/v1/usage-logs/endpoints` | admin | 去重端点。返回 `{items:string[]}` |
| GET | `/api/v1/usage-logs/session-id-suggestions` | read | session-id 建议 |
| POST | `/api/v1/usage-logs/exports` | read | CSV 导出；`Prefer: respond-async` 时异步任务（200 同步 / 202 异步） |
| GET | `/api/v1/usage-logs/exports/{jobId}` | read | 导出任务状态 |
| GET | `/api/v1/usage-logs/exports/{jobId}/download` | read | 下载 CSV。`text/csv` |

### 4.8 Dashboard（`resources/dashboard/router.ts`）

| 方法 | 路径 | 层级 | 功能 |
|---|---|---|---|
| GET | `/api/v1/dashboard/overview` | read | 概览指标 |
| GET | `/api/v1/dashboard/statistics` | read | 图表统计。query：`DashboardStatisticsQuerySchema`（时间范围等） |
| GET | `/api/v1/dashboard/concurrent-sessions` | read | 并发会话数 |
| GET | `/api/v1/dashboard/realtime` | admin | 实时数据 |
| GET | `/api/v1/dashboard/provider-slots` | admin | provider 并发槽位 |
| GET | `/api/v1/dashboard/rate-limit-stats` | admin | 限流事件统计 |
| GET | `/api/v1/dashboard/proxy-status` | admin | 全用户代理状态 |
| GET | `/api/v1/dashboard/client-versions` | admin | 客户端版本统计 |
| POST | `/api/v1/dashboard/dispatch-simulator:simulate` | admin | 调度模拟。body：`DispatchSimulatorInputSchema` |

### 4.9 Sessions（`resources/sessions/router.ts`）

| 方法 | 路径 | 层级 | 功能 |
|---|---|---|---|
| GET | `/api/v1/sessions` | read | 会话列表。query：`SessionsListQuerySchema` |
| POST | `/api/v1/sessions:batchTerminate` | read | 批量终止。body：`BatchTerminateSessionsSchema` |
| GET | `/api/v1/sessions/{sessionId}` | read | 会话详情 |
| GET | `/api/v1/sessions/{sessionId}/messages` | read | 会话消息 |
| GET | `/api/v1/sessions/{sessionId}/messages/exists` | read | 消息是否存在。返回 `{exists:boolean}` |
| GET | `/api/v1/sessions/{sessionId}/requests` | read | 会话请求行 |
| GET | `/api/v1/sessions/{sessionId}/origin-chain` | read | provider 来源链 |
| GET | `/api/v1/sessions/{sessionId}/response` | read | 存储的响应体 |
| DELETE | `/api/v1/sessions/{sessionId}` | read | 终止会话。204 |

### 4.10 Model Prices（`resources/model-prices/router.ts`）— 全部 admin

| 方法 | 路径 | 功能 / 参数 |
|---|---|---|
| GET | `/api/v1/model-prices` | 价格列表。query：`ModelPriceListQuerySchema` |
| GET | `/api/v1/model-prices/catalog` | 本地模型目录 |
| GET | `/api/v1/model-prices/exists` | 价格表是否存在。返回 `ModelPriceExistsResponseSchema` |
| POST | `/api/v1/model-prices:upload` | 上传 JSON/TOML 价格表。body：`ModelPriceUploadSchema` |
| POST | `/api/v1/model-prices:syncLitellmCheck` | LiteLLM 同步冲突预检 |
| POST | `/api/v1/model-prices:syncLitellm` | 从 LiteLLM 同步。body 可选：`ModelPriceOverwriteSchema` |
| PUT | `/api/v1/model-prices/{modelName}` | 新建/更新单条手动价格。body：`SingleModelPriceSchema` |
| DELETE | `/api/v1/model-prices/{modelName}` | 删除某模型全部价格记录。204 |
| POST | `/api/v1/model-prices/{modelName}/pricing:pinManual` | 把嵌套 provider 节点钉为手动价。body：`ModelPricePinRequestSchema` |

### 4.11 Audit Logs（`resources/audit-logs/router.ts`）— admin

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/v1/audit-logs` | 审计日志列表。query：`AuditLogListQuerySchema`（cursor 分页+过滤） |
| GET | `/api/v1/audit-logs/{id}` | 审计日志详情。返回 `AuditLogSchema` |

### 4.12 Error Rules（`resources/error-rules/router.ts`）— admin

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/v1/error-rules` | 错误覆盖规则列表（含禁用/默认规则） |
| POST | `/api/v1/error-rules` | 创建规则。body：`ErrorRuleCreateSchema` |
| POST | `/api/v1/error-rules/cache:refresh` | 同步默认规则并重载检测缓存 |
| GET | `/api/v1/error-rules/cache/stats` | 检测器缓存统计 |
| POST | `/api/v1/error-rules:test` | 测试错误消息匹配。body：`ErrorRuleTestRequestSchema` |
| PATCH | `/api/v1/error-rules/{id}` | 更新规则 |
| DELETE | `/api/v1/error-rules/{id}` | 删除规则。204 |

### 4.13 Request Filters（`resources/request-filters/router.ts`）— admin

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/v1/request-filters` | 请求变更过滤器列表 |
| POST | `/api/v1/request-filters` | 创建（simple/advanced 模式）。body：`RequestFilterCreateSchema` |
| POST | `/api/v1/request-filters/cache:refresh` | 重载运行缓存 |
| GET | `/api/v1/request-filters/options/providers` | 可绑定 provider 选项 |
| GET | `/api/v1/request-filters/options/groups` | 可绑定分组标签 |
| PATCH | `/api/v1/request-filters/{id}` | 更新 |
| DELETE | `/api/v1/request-filters/{id}` | 删除。204 |

### 4.14 Sensitive Words（`resources/sensitive-words/router.ts`）— admin

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/v1/sensitive-words` | 敏感词规则列表 |
| POST | `/api/v1/sensitive-words` | 创建。body：`{word, matchType(contains/exact/regex), description?}` |
| POST | `/api/v1/sensitive-words/cache:refresh` | 重载检测器缓存 |
| GET | `/api/v1/sensitive-words/cache/stats` | 检测器缓存统计 |
| PATCH | `/api/v1/sensitive-words/{id}` | 更新 |
| DELETE | `/api/v1/sensitive-words/{id}` | 删除。204 |

### 4.15 Notifications（`resources/notifications/router.ts`）— admin

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/v1/notifications/settings` | 通知设置 |
| PUT | `/api/v1/notifications/settings` | 部分更新通知设置 |
| POST | `/api/v1/notifications/test-webhook` | 发送测试通知。body：`NotificationTestWebhookRequestSchema` |
| GET | `/api/v1/notifications/types/{type}/bindings` | 某类型绑定（脱敏）。params：`type` |
| PUT | `/api/v1/notifications/types/{type}/bindings` | 替换绑定。204 |

### 4.16 Webhook Targets（`resources/webhook-targets/router.ts`）— admin

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/v1/webhook-targets` | 推送目标列表（secret 脱敏） |
| POST | `/api/v1/webhook-targets` | 创建目标。body：`WebhookTargetCreateSchema`（name/providerType/webhookUrl/telegramBotToken/telegramChatId/dingtalkSecret/customTemplate/customHeaders/proxyUrl/isEnabled） |
| GET | `/api/v1/webhook-targets/{id}` | 单个目标 |
| PATCH | `/api/v1/webhook-targets/{id}` | 更新（secret 只写） |
| DELETE | `/api/v1/webhook-targets/{id}` | 删除。204 |
| POST | `/api/v1/webhook-targets/{id}:test` | 发送测试消息 |

### 4.17 Public（`resources/public/router.ts`）

| 方法 | 路径 | 层级 | 功能 |
|---|---|---|---|
| GET | `/api/v1/public/status` | public | 公开状态投影（无需认证）。返回 `PublicStatusResponseSchema`；投影重建中 503 |
| PUT | `/api/v1/public/status/settings` | admin | 更新公开分组发布设置。body：`PublicStatusSettingsUpdateSchema`（publicStatusWindowHours/aggregationInterval/groups[]）。返回 `{updatedGroupCount, configVersion, publicStatusProjectionWarningCode}` |
| GET | `/api/v1/ip-geo/{ip}` | read | IP 归属查询。query：`lang?`。返回 `IpGeoLookupResponseSchema`（ok/private/error 联合） |

### 4.18 Admin User Insights（`resources/admin-user-insights/router.ts`）— admin

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/v1/admin/users/{userId}/insights/overview` | 目标用户概览。query：`AdminUserInsightDateQuerySchema` |
| GET | `/api/v1/admin/users/{userId}/insights/key-trend` | key 级趋势行 |
| GET | `/api/v1/admin/users/{userId}/insights/model-breakdown` | 模型级成本/token 拆分 |
| GET | `/api/v1/admin/users/{userId}/insights/provider-breakdown` | provider 级拆分 |

### 4.19 Me（`resources/me/router.ts`）— read

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/v1/me/metadata` | 当前 key/user 元数据（自服务用量页） |
| GET | `/api/v1/me/quota` | 当前 key/user 配额计数 |
| GET | `/api/v1/me/today` | 今日用量 |
| GET | `/api/v1/me/usage-logs` | 自作用域日志（offset/cursor） |
| GET | `/api/v1/me/usage-logs/full` | 完整只读表格日志 |
| GET | `/api/v1/me/usage-logs/models` | 可见模型。返回 `{items:string[]}` |
| GET | `/api/v1/me/usage-logs/endpoints` | 可见端点。返回 `{items:string[]}` |
| GET | `/api/v1/me/usage-logs/stats-summary` | 日期区间模型拆分 |
| GET | `/api/v1/me/ip-geo/{ip}` | 可见 IP 归属 |

---

## 5. 专有管理端点（`/api/admin/*`）

> 认证：仅 session cookie（`getSession()` + `role === "admin"`），**不支持** Bearer / `X-Api-Key`。来源：`src/app/api/admin/**`。

| 方法 | 路径 | 功能 / 请求参数 | 返回示例 |
|---|---|---|---|
| POST | `/api/admin/log-cleanup/manual` | 手动清理日志。body：`beforeDate?`(ISO)、`afterDate?`、`userIds?:number[]`、`providerIds?:number[]`、`statusCodes?:number[]`、`statusCodeRange?:{min,max}`、`onlyBlocked?:boolean`、`dryRun?:boolean` | `{success, totalDeleted, batchCount, durationMs, softDeletedPurged, vacuumPerformed, error?}` |
| GET | `/api/admin/log-level` | 当前日志级别 | `{level:string}` |
| POST | `/api/admin/log-level` | 设置日志级别。body：`{level: fatal/error/warn/info/debug/trace}` | `{success:true, level}` 或 400 `{error, validLevels}` |
| GET | `/api/admin/system-config` | 系统配置全量（同 v1 `SystemSettingsSchema`） | settings 对象 |
| POST | `/api/admin/system-config` | 更新系统配置（siteTitle/allowGlobalUsageView/currencyDisplay/cleanup/discovery/timezone/rectifiers/quota 等），并失效相关缓存 | 更新后 settings；400 `{error:"discoveryWindowInvalid", errorCode}` |
| GET | `/api/admin/database/status` | 数据库状态（连接/大小/表数/PostgreSQL 版本） | `{isAvailable, containerName, databaseName, databaseSize, tableCount, postgresVersion, error?}` |
| GET | `/api/admin/database/export` | 导出数据库备份。query：`mode=full/excludeLogs/ledgerOnly`(默认 full)。流式 `application/octet-stream`，带 `Content-Disposition`；并发 409；DB 不可用 503 | 二进制 dump（非 JSON） |
| POST | `/api/admin/database/import` | 导入备份。`multipart/form-data`：`file`(.dump, ≤500MB)、`cleanFirst`('true'/'false')、`skipLogs`('true'/'false')。返回 `text/event-stream`(SSE 进度)；409 并发锁；413 过大；503 DB 不可用 | SSE 流 |

---

## 6. Legacy Server Action API（`/api/actions/*`）

> 统一格式：`POST /api/actions/{module}/{actionName}`（`src/app/api/actions/[...route]/route.ts`）。
> 认证：Cookie `auth-token` / Bearer（同 token 值）。`requiredRole:"admin"` 需管理员；`allowReadOnlyAccess:true` 允许只读 key。
> 成功响应仍为 legacy 包装：`{ok, data}`。
> 完整清单见下（按 module）。来源：`route.ts` 各 `createActionRoute`。

**users**：`getUsers`(read, 空参)、`getUsersBatch`(admin)、`searchUsers`(admin)、`addUser`(admin)、`editUser`(admin)、`removeUser`(admin)、`getUserLimitUsage`(read)

**keys**：`getKeys`、`addKey`、`editKey`、`removeKey`、`getKeyLimitUsage`、`resetKeyLimitsOnly`(admin)

**providers**：`getProviders`(admin, 空参, 返回脱敏数组)、`getProviderVendors`(admin)、`getProviderEndpoints`(admin, 需 vendorId+providerType)、`addProviderEndpoint`/`editProviderEndpoint`/`removeProviderEndpoint`(admin)、`probeProviderEndpoint`(admin, `timeoutMs?`)、`getProviderEndpointProbeLogs`(admin, `limit?`/`offset?`)、`batchGetProviderEndpointProbeLogs`(admin)、`batchGetVendorTypeEndpointStats`(admin)、`getEndpointCircuitInfo`/`resetEndpointCircuit`(admin)、`getVendorTypeCircuitInfo`/`setVendorTypeCircuitManualOpen`/`resetVendorTypeCircuit`(admin)、`addProvider`/`editProvider`/`removeProvider`(admin)、`getProvidersHealthStatus`(admin, 空参)、`resetProviderCircuit`(admin)、`getProviderLimitUsage`(admin)

**model-prices**：`getModelPrices`(admin)、`uploadPriceTable`(admin, `jsonContent:string`)、`syncLiteLLMPrices`(admin)、`getAvailableModelsByProviderType`(按类型分组)、`hasPriceTable`(返回 boolean)

**statistics**：`getUserStatistics`(`timeRange: today/7days/30days/thisMonth`)

**usage-logs**：`getUsageLogs`(userId?/keyId?/providerId?/startDate?/endDate?/model?/endpoint?/statusCode?/excludeStatusCode200?/minRetryCount?/page?/pageSize?)、`getModelList`(返回 string[])、`getStatusCodeList`(返回 number[])

**my-usage**（全部 `allowReadOnlyAccess`）：`getMyUsageMetadata`、`getMyQuota`、`getMyTodayStats`、`getMyUsageLogs`、`getMyUsageLogsBatch`、`getMyUsageLogsBatchFull`、`getMyAvailableModels`、`getMyAvailableEndpoints`、`getMyIpGeoDetails`(`ip`, `lang?`)、`getMyStatsSummary`(`startDate?`/`endDate?`)

**overview**：`getOverviewData`(read, 空参; 并发数/今日统计/活跃用户)

**sensitive-words**：`listSensitiveWords`(admin)、`createSensitiveWordAction`(admin, `word`/`matchType`/`description?`)、`updateSensitiveWordAction`(admin)、`deleteSensitiveWordAction`(admin)、`refreshCacheAction`(admin)、`getCacheStats`(admin)

**audit-logs**：`getAuditLogsBatch`(admin, `filter?:{category,success,from,to}`, `cursor?`, `pageSize?`; 返回 `{rows,nextCursor}`)、`getAuditLogDetail`(admin, `id`)

**active-sessions**：`getActiveSessions`(read)、`getSessionDetails`(`sessionId`)、`getSessionMessages`(`sessionId`)

**notifications**：`getNotificationSettingsAction`(admin)、`updateNotificationSettingsAction`(admin, 大量可选字段: enabled/useLegacyMode/circuitBreaker*/dailyLeaderboard*/costAlert*/cacheHitRateAlert*)、`testWebhookAction`(admin, `webhookUrl`, `type`)

**webhook-targets**：`getWebhookTargetsAction`(admin)、`createWebhookTargetAction`(admin)、`updateWebhookTargetAction`(admin, `id`+`input`)、`deleteWebhookTargetAction`(admin, `id`)、`testWebhookTargetAction`(admin, `id`, `notificationType`)

**notification-bindings**：`getBindingsForTypeAction`(admin, `type`)、`updateBindingsAction`(admin, `type`+`bindings[]`)

> 注：`docs/api-docs-summary.md` 只列了 15 个修复过的接口（`users/getUsers`、`providers/getProviders`、`providers/getProvidersHealthStatus`、`model-prices/*`、`usage-logs/getModelList`、`usage-logs/getStatusCodeList`、`overview/getOverviewData`、`sensitive-words/listSensitiveWords` 等），上表为从 `route.ts` 汇总的完整清单。迁移对照见 `docs/api/v1/migration-guide.md`。

---

## 7. 公共状态 / 健康 / 半公开端点（`/api/*`）

| 方法 | 路径 | 认证 | 功能 / 参数 | 返回示例 |
|---|---|---|---|---|
| GET | `/api/public-status` | 无 | 公开状态投影。query：`interval`(5/15/30/60 或 `Xm`)、`rangeHours`(1-168)、`groupSlug`/`groupSlugs`、`model`/`models`、`status`(operational/degraded/failed/no_data)、`q`、`include`(meta,defaults,groups,timeline)。投影重建无快照时 503 | `{generatedAt, freshUntil, status, rebuildState, defaults, resolvedQuery, meta, groups}` |
| GET | `/api/public-site-meta` | 无 | 公开站点标题/描述/时区 | `{available:true, siteTitle, siteDescription, timeZone, source:"projection"}` |
| GET | `/api/health/live` | 无 | Liveness | `{"status":"alive","timestamp":"<ISO>"}` |
| GET | `/api/health/ready` | 无 | Readiness：DB/Redis/Proxy 探测 | `{status:healthy/degraded/unhealthy, timestamp, version, uptime, components:{database,redis,proxy:{status,latencyMs,message?}}}`；unhealthy=503 |
| GET | `/api/health` | 无 | 同 ready（`health_check_failed`） | 同上 |
| GET | `/api/system-settings` | 登录(任意 session) | 系统设置（含货币显示） | `getSystemSettings()` 全量 |
| GET | `/api/availability` | admin | provider 可用性窗口。query：`startTime`、`endTime`、`providerIds`(逗号)、`bucketSizeMinutes`、`includeDisabled`、`maxBuckets`(≤100) | `queryProviderAvailability()` 结果 |
| GET | `/api/availability/current` | admin | 全部 provider 当前状态（近 15 分钟） | `getCurrentProviderStatus()` |
| GET | `/api/availability/endpoints` | admin | vendor+type 端点列表。query：`vendorId`(必填)、`providerType`(必填，6 枚举) | `{vendorId, providerType, endpoints}` |
| GET | `/api/availability/endpoints/probe-logs` | admin | 端点测活历史。query：`endpointId`(必填)、`limit`(≤1000)、`offset` | `{endpoint, logs}` |
| GET | `/api/proxy-status` | admin | 所有用户代理状态 | `{users:[{userId,userName,activeCount,activeRequests,lastRequest}]}` |
| GET | `/api/prices` | admin | 模型价格分页。query：`page`、`pageSize`(≤200)、`search`、`source`(manual/cloud/litellm)、`vendor`、`litellmProvider` | `{ok,data}` 包装的分页结果 |
| GET | `/api/prices/vendors` | admin | 云端价格表 vendor 汇总 | `{ok:true, data:{vendors, version}}` |
| GET | `/api/prices/cloud-model-count` | admin | 云端价格表模型数 | `{ok:true, data:{count, version}}`；上游失败 502 |
| GET | `/api/leaderboard` | admin 或 `allowGlobalUsageView` | 排行榜。query：`period`(daily/weekly/monthly/allTime/custom)、`scope`(user/userCacheHitRate/provider/providerCacheHitRate/model)、`startDate`/`endDate`(custom)、`providerType`、`includeModelStats`、`includeUserModelStats`(admin only)、`userTags`、`userGroups` | 数组含 `totalCostFormatted` 等格式化字段 |
| GET | `/api/ip-geo/{ip}` | admin | IP 归属（`ipGeoLookupEnabled` 关时 404）。query：`lang?` | `{status, data|error}` |
| GET | `/api/version` | 无 | 版本检查（GitHub latest） | `{current, latest, hasUpdate, releaseUrl, publishedAt}` |
| POST | `/api/internal/data-gen` | admin | 数据生成器（测试）。body：`mode`(usage/userBreakdown)、`serviceName`、`startDate`、`endDate`(必填)、`totalRecords`、`totalCostCny`、`models`、`userIds`、`providerIds` | 生成结果（返回示例未确认） |
| POST | `/api/auth/login` | 无(CSRF origin guard) | 登录。body：`{key:string}`。限流 429 | `{ok:true, user:{id,name,description,role}, redirectTo, loginType}` |
| POST | `/api/auth/logout` | Cookie | 登出（撤销 opaque session） | `{ok:true}` |

---

## 8. OpenAI 兼容代理端点（`/v1/*`）— 简述

> 来源：`src/app/v1/[...route]/route.ts`（Hono, basePath `/v1`）。与 `/api/v1/*` 管理 API 相互独立；`server.js` 额外提供 `/v1/responses` 的 WebSocket 隧道（非 WS 客户端不受影响）。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/v1/models` | 聚合：返回用户可用的所有模型 |
| GET | `/v1/responses/models` | 仅 codex 类型（供 `/v1/responses`） |
| GET | `/v1/chat/completions/models`、`GET /v1/chat/models` | 仅 openai-compatible 类型 |
| POST | `/v1/chat/completions` | OpenAI Chat Completions 代理 |
| POST | `/v1/responses` | Responses API（Codex）代理 |
| GET | `/v1/_ping` | 内部健康自检（不代理，返回 `{"status":"pong"}`） |
| 任意 | `/v1/*` | fallback：Claude Messages 等其余代理请求 |

管理相关：代理行为受系统设置（`/api/v1/system/settings`、`/api/admin/system-config`）、敏感词/请求过滤器/错误规则等管理配置影响；通过 v1 管理 API 修改后即作用于代理层。

---

## 9. 注意事项 / 已知差异

1. **返回示例未确认**：v1 下多数「批量/操作类」端点（`providers:batchPatch:apply`、`dashboard/realtime`、`usage-logs/exports`）schema 为 `GenericResponseSchema = z.record(z.string(), z.unknown())`，无固定字段；需运行时抓取确认。
2. **列表响应形态差异**：v1 schema 使用 `{items, pageInfo}`，但 `docs/api-authentication-guide.md` 示例是旧 `{users, nextCursor, hasMore}` 形态；以 schema 为准。
3. **admin 专有 API 认证不一致**：`/api/admin/*`、`/api/availability/*`、`/api/proxy-status`、`/api/prices` 等只接受 session cookie，不支持 Bearer / `X-Api-Key`；与 v1 的三传输方式不同。
4. **provider type 枚举差异**：v1 公开类型 `PUBLIC_PROVIDER_TYPE_VALUES`（隐藏 `claude-auth`、`gemini-cli`），而 legacy actions 与 `/api/availability/endpoints` 的 `PROVIDER_TYPES` 含全部 6 种。
5. **CSRF 范围**：`/api/v1` 写操作要求 `X-CCH-CSRF`（cookie 认证时）；登录/登出使用独立 CSRF origin guard。
6. **端点规模**：v1 约 170+ 路由、legacy actions 约 70 个、`/api/admin` 6 个、公共/半公开约 20 个。

---

## 10. 来源与维护

- 上游仓库：https://github.com/ding113/claude-code-hub
- 本文档整理对应 commit：`ccbad37`（v0.9.2, 2026-08-04）
- 主要上游文档：`docs/api/v1/README.md`、`docs/api/v1/migration-guide.md`、`docs/api-authentication-guide.md`、`docs/security/api-key-admin-access.md`、`docs/api-docs-summary.md`、`docs/public-status-api.md`
- 主要上游源码：`src/app/api/v1/**`（router/schema）、`src/app/api/admin/**`、`src/app/api/actions/[...route]/route.ts`、`src/app/v1/[...route]/route.ts`、`server-lib/**`、`server.js`
- 维护约定：上游 API 变动后，按 §9 的已知差异逐项核对更新本文件。
