# Sub2API 管理员 API 手册

> **类型**: 外部工具 API 参考（非本知识库项目自身 API）
> **上游仓库**: https://github.com/Wei-Shaw/sub2api
> **文档对应版本**: commit `10a4c6e`（2026-08-10，上游无固定语义化版本号）
> **整理日期**: 2026-08-10
> **内容来源**: 上游 `backend/internal/server/routes/*.go`、`backend/internal/handler/admin/*.go`、`backend/internal/server/middleware/*.go`、`backend/internal/pkg/response/response.go`、`docs/ADMIN_PAYMENT_INTEGRATION_API.md`、`docs/PAYMENT_CN.md`、`docs/legal/admin-compliance.zh.md` 及前端 `frontend/src/api/admin/*.ts`。各端点均标注来源，便于日后对照上游更新。

---

## 1. 概述

Sub2API 是一个 AI API 网关/管理平台（Go + Gin 后端 / Vue 前端）。所有管理端点统一挂在 **`/api/v1/admin/...`** 前缀下（`backend/internal/server/router.go:120` 定义 `v1 := r.Group("/api/v1")`；`router.go:130` 注册 `RegisterAdminRoutes`，`router.go:132` 注册支付管理路由）。

> ⚠️ **重要澄清**：本仓库**没有 `root` 角色**，仅两种角色常量 `admin` / `user`（`backend/internal/domain/constants.go:14-18`）。任务/README 中出现的 "root" 概念在本代码库中不存在；管理面仅 `admin` 角色可访问。

---

## 2. 认证 / 权限模型（前置必读）

### 2.1 角色

| 角色常量 | 说明 |
|---|---|
| `admin` | 唯一可访问管理面（`/api/v1/admin/*`）的角色 |
| `user` | 普通用户 |

`User.IsAdmin()` = `Role == RoleAdmin`（`backend/internal/service/user.go:67-69`）。把角色更新为 `"root"` 会被拒绝（`backend/internal/service/admin_service_role_test.go:83-90`）。

### 2.2 管理员认证中间件 `AdminAuthMiddleware`

位置 `backend/internal/server/middleware/admin_auth.go:22-93`，支持三种方式：

| 方式 | 凭证 | 说明 |
|---|---|---|
| **Admin API Key** | 请求头 `x-api-key: <admin-api-key>`（形如 `admin-<64hex>`） | 走 `validateAdminAPIKey`；会绑定到"第一个管理员"身份 |
| **JWT** | `Authorization: Bearer <jwt>` | 需 `user.IsAdmin()`，要求 `TokenVersion` 匹配、会话绑定通过、用户 active；否则 401（`TOKEN_EXPIRED`/`INVALID_TOKEN`/`TOKEN_REVOKED`/`USER_INACTIVE`）或 403 `FORBIDDEN` |
| **WebSocket** | `Sec-WebSocket-Protocol: sub2api-admin, jwt.<token>` | Ops 实时面板用 |

### 2.3 管理面附加中间件（`handler/admin/admin.go:20-25`）

- `panelRateLimiter.Global()`：面板按用户限流（管理员默认豁免，可在系统设置调整）。
- `auditLog`：审计日志（变更类 + 敏感读取）。
- `AdminComplianceGuard(settingService)`：部署合规确认门，未确认返回 **`423 ADMIN_COMPLIANCE_ACK_REQUIRED`**（见 `docs/legal/admin-compliance.zh.md`）。

### 2.4 敏感操作 step-up 2FA 门控（`middleware/step_up.go`）

- 开关 `step_up_enabled`（默认关）关闭时直接放行；开启时需：JWT 真人会话（**admin API key 一律拒绝**，错误码 `STEP_UP_ADMIN_API_KEY_FORBIDDEN`）、已启用 TOTP、会话内最近完成过 `POST /api/v1/user/totp/step-up`。
- 错误码：`STEP_UP_TOTP_NOT_ENABLED`、`STEP_UP_REQUIRED`、`STEP_UP_UNAVAILABLE`。
- 强制 step-up 的操作：账号/代理**导出** `GET /data`、S3 配置修改、备份创建/下载/恢复、用户角色提升为 admin（`user_handler.go:262-267` 等）。

### 2.5 管理员登录（无独立 admin login 端点）

管理员与普通用户共用认证端点（**没有 `/api/admin/login`**）：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/auth/login` | 登录；若启 TOTP 返回 `{requires_2fa:true, temp_token}`，否则返回完整 token 对 |
| POST | `/api/v1/auth/login/2fa` | 2FA 第二步 |
| GET | `/api/v1/auth/me` | 当前用户（需 JWT）。返回 `UserResponse{...user, run_mode}` |
| POST | `/api/v1/auth/refresh` | 刷新 token |
| POST | `/api/v1/auth/logout` | 登出 |
| POST | `/api/v1/auth/revoke-all-sessions` | 撤销全部会话 |

登录响应结构（`auth_handler.go:94-99`）：`{access_token, refresh_token?, expires_in?, token_type:"Bearer", user}`。

**Backend 模式**：`backend_mode_enabled` 开启后仅管理员可登录/访问面板（`BackendModeUserGuard`，`middleware/backend_mode_guard.go`；模型广场对非管理员 403）。

### 2.6 统一响应信封（`backend/internal/pkg/response/response.go`）

```jsonc
// 成功
{ "code": 0, "message": "success", "data": ... }

// 分页（data 结构）
{ "code": 0, "message": "success",
  "data": { "items": [...], "total": 0, "page": 1, "page_size": 20, "pages": 1 } }

// 失败
{ "code": <http状态码>, "message": "...", "reason": "...?", "metadata": {...}? }
```

- 创建成功返回 `code:0` + HTTP 201（`Created`）。
- 分页参数：`page`(默认1)、`page_size` 或 `limit`(默认20，最大1000)。
- ⚠️ 部分端点（Ops、Dashboards）直接返回裸数据或 `gin.H`，前端通过 `client.ts` 拦截器统一解包 `{code,message,data}`。
- 幂等：写接口建议带 `Idempotency-Key` 头；缺失时部分接口返回 `400 IDEMPOTENCY_KEY_REQUIRED`。

---

## 3. 认证 / 会话 / 合规（管理面）

| 方法 | 路径 | 功能 | 请求参数 | 返回示例 | 来源 |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/compliance` | 查询当前管理员的合规确认状态 | 无 | 未确认（返回 status 对象） | `routes/admin.go:153-159` |
| POST | `/api/v1/admin/compliance/accept` | 逐字输入短语确认合规（留痕 IP/UA） | body：`phrase`(必填)、`language` | 未确认 | `handler/admin/compliance_handler.go:30-59` |

---

## 4. 用户管理（`/api/v1/admin/users`）

来源：`routes/admin.go:291-316`；实现 `handler/admin/user_handler.go`。

| 方法 | 路径 | 功能 | 请求参数 | 返回示例 | 来源 |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/users` | 分页列用户（含当前并发） | query：`page/page_size`、`status`、`role`、`search`、`group_name`、`api_key_group_id`、`attr[{id}]=值`、`include_subscriptions`、`sort_by/sort_order` | `{code:0,data:{items:[{id,email,username,role,balance,concurrency,current_concurrency,...}],total,page,page_size,pages}}` | user_handler.go:112-190 |
| GET | `/api/v1/admin/users/:id` | 获取用户详情 | path `id`；query `include_deleted=true` | `{code:0,data:{...User}}` | user_handler.go:196-214 |
| POST | `/api/v1/admin/users/:id/auth-identities` | 手动绑定认证身份 | body：`provider_type`、`provider_key`、`provider_subject`、`issuer?`、`metadata?`、`channel?{channel,channel_app_id,channel_subject,metadata}` | `{code:0,data:identity}` | user_handler.go:216-261 |
| POST | `/api/v1/admin/users` | 创建用户（创建 admin 需 step-up） | body：`email`(必填)、`password`(必填≥6)、`username`、`notes`、`role`(admin/user)、`balance?`、`concurrency`、`rpm_limit`、`allowed_groups[]` | `{code:0,data:{...User}}` | user_handler.go:263-286 |
| PUT | `/api/v1/admin/users/:id` | 更新用户（升 admin 需 step-up；不能自我降级） | body：`email`、`password`、`username*`、`notes*`、`role`、`balance*`、`concurrency*`、`rpm_limit*`、`status`(active/disabled)、`allowed_groups*`、`group_rates{groupID:*float64}` | `{code:0,data:{...User}}` | user_handler.go:288-342 |
| DELETE | `/api/v1/admin/users/:id` | 删除用户 | path `id` | `{code:0,data:{message:"User deleted successfully"}}` | user_handler.go:344-357 |
| POST | `/api/v1/admin/users/:id/balance` | 余额调整（幂等） | body：`balance`(必填>0)、`operation`(必填 set/add/subtract)、`notes` | `{code:0,data:{...User}}` | user_handler.go:359-383 |
| GET | `/api/v1/admin/users/:id/api-keys` | 用户 API Key 列表（分页） | path `id`；query `page/page_size/sort_by/sort_order` | 分页 `{items:[APIKey],total,...}` | user_handler.go:385-411 |
| GET | `/api/v1/admin/users/:id/usage` | 用户用量统计 | path `id`；query `period`(默认 month) | `{code:0,data:stats}` | user_handler.go:413-424 |
| GET | `/api/v1/admin/users/:id/balance-history` | 余额/并发变动历史 | path `id`；query `page/page_size`、`type`(balance/affiliate_balance/admin_balance/concurrency/admin_concurrency/subscription) | `{code:0,data:{items,total,page,page_size,pages,total_recharged}}` | user_handler.go:426-459 |
| POST | `/api/v1/admin/users/:id/replace-group` | 替换用户专属分组 | body：`old_group_id`(必填)、`new_group_id`(必填) | 未确认 | user_handler.go:467-495 |
| GET | `/api/v1/admin/users/:id/rpm-status` | 用户 RPM 状态 | path `id` | 未确认 | user_handler.go:497+ |
| POST | `/api/v1/admin/users/batch-concurrency` | 批量改并发 | 参数未确认 | 未确认 | admin.go:306 |
| POST | `/api/v1/admin/users/batch-limits` | 批量改限额 | 参数未确认 | 未确认 | admin.go:307 |
| GET | `/api/v1/admin/users/:id/platform-quotas` | 查看用户平台配额 | path `id` | 未确认 | admin.go:308 |
| PUT | `/api/v1/admin/users/:id/platform-quotas` | 更新用户平台配额 | 参数未确认 | 未确认 | admin.go:309 |
| POST | `/api/v1/admin/users/:id/platform-quotas/reset` | 重置平台配额窗口 | path `id` | 未确认 | admin.go:310 |
| GET | `/api/v1/admin/users/:id/attributes` | 读取用户自定义属性 | path `id` | 未确认 | admin.go:313 |
| PUT | `/api/v1/admin/users/:id/attributes` | 更新用户自定义属性 | 参数未确认 | 未确认 | admin.go:314 |

---

## 5. 分组管理（`/api/v1/admin/groups`）

来源：`routes/admin.go:318-346`；实现 `handler/admin/group_handler.go`。

| 方法 | 路径 | 功能 | 请求参数 | 返回示例 | 来源 |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/groups` | 分页列分组 | query：`page/page_size`、`platform`、`status` | 分页 | group_handler.go:246-277 |
| GET | `/api/v1/admin/groups/all` | 全量分组（含停用） | query：`platform`、`include_inactive` | 列表 | group_handler.go:412-437 |
| GET | `/api/v1/admin/groups/usage-summary` | 今日/累计成本汇总 | query：`timezone` | 未确认 | group_handler.go:730-742 |
| GET | `/api/v1/admin/groups/capacity-summary` | 容量汇总（并发/会话/RPM） | 无 | 未确认 | group_handler.go:745-753 |
| GET | `/api/v1/admin/groups/live-capability` | 服务端 Live attestation 能力探测 | 无 | `{supported:bool}` | group_handler.go:29-33 |
| PUT | `/api/v1/admin/groups/sort-order` | 批量调整排序 | body：`updates:[{id(必填),sort_order}]` | 未确认 | group_handler.go:891-904 |
| GET | `/api/v1/admin/groups/:id/models-list-candidates` | 自定义 /v1/models 候选模型 | path `id` | 未确认 | group_handler.go:458-477 |
| GET | `/api/v1/admin/groups/:id/composite-routes` | 复合路由列表 | path `id` | 未确认 | group_handler.go:282-293 |
| POST | `/api/v1/admin/groups/:id/composite-routes` | 创建复合路由 | body：`public_model`(必填)、`match_type`(exact/prefix)、`target_platform`(必填)、`target_model`、`notes` | 未确认 | group_handler.go:297-313 |
| POST | `/api/v1/admin/groups/:id/composite-routes/preview` | 预览复合路由命中 | body：`model`(必填)、`endpoint`(any/messages/...) | 未确认 | group_handler.go:359+ |
| PUT | `/api/v1/admin/groups/:id/composite-routes/:route_id` | 更新复合路由 | 同创建 | 未确认 | group_handler.go:317-337 |
| DELETE | `/api/v1/admin/groups/:id/composite-routes/:route_id` | 删除复合路由 | path 两个 id | 未确认 | group_handler.go:341-355 |
| GET | `/api/v1/admin/groups/:id` | 分组详情 | path `id` | `{code:0,data:{...}}` | group_handler.go:441-455 |
| POST | `/api/v1/admin/groups` | 创建分组 | body：`name`(必填)、`description`、`platform`(anthropic/openai/gemini/antigravity/grok/composite)、`...`（`CreateGroupRequest` group_handler.go:98-161） | `{code:0,data:{...}}` | group_handler.go:481+ |
| POST | `/api/v1/admin/groups/:id/duplicate` | 复制分组（停用态+绑定账号） | path `id`；body：`copy_accounts_from_group_ids[]` 等 | 未确认 | group_handler.go:566+ |
| PUT | `/api/v1/admin/groups/:id` | 更新分组 | body：`UpdateGroupRequest`（name/description*/platform/...） | `{code:0,data:{...}}` | group_handler.go:613+ |
| DELETE | `/api/v1/admin/groups/:id` | 删除分组 | path `id` | 未确认 | group_handler.go:693-707 |
| GET | `/api/v1/admin/groups/:id/stats` | 分组统计 | path `id` | 未确认 | group_handler.go:711-726 |
| GET | `/api/v1/admin/groups/:id/rate-multipliers` | 组内用户倍率 | path `id` | 未确认 | group_handler.go:781-798 |
| PUT | `/api/v1/admin/groups/:id/rate-multipliers` | 批量设置倍率 | body：`entries:[...]`(必填) | 未确认 | group_handler.go:824+ |
| DELETE | `/api/v1/admin/groups/:id/rate-multipliers` | 清空倍率 | path `id` | 未确认 | group_handler.go:802-814 |
| PUT | `/api/v1/admin/groups/:id/rpm-overrides` | 批量设置 RPM 覆盖 | body：`entries:[...]`(必填) | 未确认 | group_handler.go:852+ |
| DELETE | `/api/v1/admin/groups/:id/rpm-overrides` | 清空 RPM 覆盖 | path `id` | 未确认 | group_handler.go:875-887 |
| GET | `/api/v1/admin/groups/:id/api-keys` | 组内 API Key | path `id` | 未确认 | group_handler.go:757-777 |

---

## 6. 账号（上游供应商）管理（`/api/v1/admin/accounts`）

来源：`routes/admin.go:348-419`；实现 `handler/admin/account_handler.go`。

| 方法 | 路径 | 功能 | 请求参数 | 返回示例 | 来源 |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/accounts` | 分页列账号（含负载/调度分） | query：`page/page_size`、`platform`、`type`、`status`、`search`、`group_id` | 分页 | account_handler.go:499+ |
| GET | `/api/v1/admin/accounts/upstream-billing-probe/settings` | 上游计费探测全局设置 | 无 | 未确认 | admin.go:351 |
| PUT | `/api/v1/admin/accounts/upstream-billing-probe/settings` | 更新探测设置 | 参数未确认 | 未确认 | admin.go:352 |
| POST | `/api/v1/admin/accounts/upstream-billing-probe/batch` | 批量探测 | 参数未确认 | 未确认 | admin.go:353 |
| GET/PUT | `/api/v1/admin/accounts/ollama-cloud-usage/settings` | Ollama 云用量设置 | 参数未确认 | 未确认 | admin.go:354-355 |
| GET | `/api/v1/admin/accounts/:id` | 账号详情 | path `id` | `{code:0,data:{...Account}}` | account_handler.go:755-775 |
| POST | `/api/v1/admin/accounts` | 创建账号 | body：`name`(必填)、`notes`、`platform`(必填)、`type`、`credentials`、`group_ids`、`model_mapping` 等（`CreateAccountRequest` account_handler.go:113-132） | `{code:0,data:{...}}` | account_handler.go:823+ |
| POST | `/api/v1/admin/accounts/:id/duplicate` | 复制账号 | path `id` | 未确认 | account_handler.go:907+ |
| POST | `/api/v1/admin/accounts/check-mixed-channel` | 混渠道风险检查 | body：`platform`(必填)、`group_ids[]`、`account_id?` | 未确认 | account_handler.go:778+ |
| POST | `/api/v1/admin/accounts/import/codex-session` | 导入 Codex session | 参数未确认 | 未确认 | admin.go:359 |
| POST | `/api/v1/admin/accounts/sync/crs` | 从 CRS 同步账号 | body：`base_url`(必填)、`username`(必填)、`password`(必填)、`selected_account_ids[]` | 未确认 | account_handler.go:1149+ |
| POST | `/api/v1/admin/accounts/sync/crs/preview` | CRS 预览 | body：`base_url`、`username`、`password`(必填) | 未确认 | account_handler.go:1181+ |
| PUT | `/api/v1/admin/accounts/:id` | 更新账号 | body：`UpdateAccountRequest`（name、notes*、type(oauth/setup-token/apikey/upstream/bedrock/service_account)、...） | `{code:0,data:{...}}` | account_handler.go:954+ |
| PUT/POST | `/api/v1/admin/accounts/:id/upstream-billing-probe` | 单账号计费探测开关/执行 | 参数未确认 | 未确认 | admin.go:369-370 |
| GET/PUT/DELETE/POST | `/api/v1/admin/accounts/:id/ollama-cloud-usage*` | Ollama 云用量会话管理 | 参数未确认 | 未确认 | admin.go:371-376 |
| DELETE | `/api/v1/admin/accounts/:id` | 删除账号 | path `id` | 未确认 | account_handler.go:1046-1059 |
| POST | `/api/v1/admin/accounts/:id/test` | 连通性测试（SSE 流式） | body：`model_id`、`prompt`、`mode`、`audio_data_url?` | SSE 流 | account_handler.go:1089+ |
| POST | `/api/v1/admin/accounts/:id/recover-state` | 恢复可恢复运行状态 | path `id` | 未确认 | account_handler.go:1120+ |
| POST | `/api/v1/admin/accounts/:id/refresh` | 刷新 OAuth 凭证 | path `id` | 未确认 | account_handler.go:1345+ |
| POST | `/api/v1/admin/accounts/:id/apply-oauth-credentials` | 落库重新授权凭证 | body：`type`(必填 oauth/setup-token)、`credentials`(必填 map)、`extra?` | 未确认 | account_handler.go:1377+ |
| POST | `/api/v1/admin/accounts/:id/set-privacy` | 设置隐私 | 参数未确认 | 未确认 | account_handler.go:2842+ |
| POST | `/api/v1/admin/accounts/:id/refresh-tier` | 刷新档位 | 参数未确认 | 未确认 | admin.go:381 |
| GET | `/api/v1/admin/accounts/:id/stats` | 账号统计 | path `id` | 未确认 | account_handler.go:1493+ |
| POST | `/api/v1/admin/accounts/:id/clear-error` | 清除账号错误态 | path `id` | 未确认 | account_handler.go:1524+ |
| POST | `/api/v1/admin/accounts/:id/revert-proxy-fallback` | 回退代理 | path `id` | 未确认 | account_handler.go:1550+ |
| GET | `/api/v1/admin/accounts/:id/usage` | 用量（缓存/被动/主动） | path `id`；query `source=passive/active`、`force` | 未确认 | account_handler.go:2313+ |
| GET | `/api/v1/admin/accounts/:id/today-stats` | 今日统计 | path `id` | 未确认 | account_handler.go:2429+ |
| POST | `/api/v1/admin/accounts/usage/batch` | 批量用量 | body：`account_ids`(必填)、`force` | 未确认 | account_handler.go:2503+ |
| POST | `/api/v1/admin/accounts/today-stats/batch` | 批量今日统计 | body：`account_ids`(必填) | 未确认 | account_handler.go:2457+ |
| POST | `/api/v1/admin/accounts/:id/clear-rate-limit` | 清除限流态 | path `id` | 未确认 | account_handler.go:2339+ |
| POST | `/api/v1/admin/accounts/:id/reset-quota` | 重置配额 | path `id` | 未确认 | account_handler.go:2363+ |
| GET/DELETE | `/api/v1/admin/accounts/:id/temp-unschedulable` | 临时停调状态 | path `id` | 未确认 | account_handler.go:2386+ |
| POST | `/api/v1/admin/accounts/:id/schedulable` | 切换可调度 | body：`schedulable`(bool) | 未确认 | account_handler.go:2538+ |
| POST | `/api/v1/admin/accounts/models/sync-upstream-preview` | 用凭证预览上游模型 | body：`platform`(必填)、`type`(必填)、`credentials...` | 未确认 | account_handler.go:2793+ |
| GET | `/api/v1/admin/accounts/:id/models` | 可用模型 | path `id` | 未确认 | account_handler.go:2562+ |
| POST | `/api/v1/admin/accounts/:id/models/sync-upstream` | 同步上游模型 | path `id` | 未确认 | account_handler.go:2751+ |
| POST | `/api/v1/admin/accounts/batch` | 批量创建 | body：`accounts:[CreateAccountRequest]`(必填≥1) | 未确认 | account_handler.go:1863+ |
| GET | `/api/v1/admin/accounts/data` | **导出（step-up 2FA 强制）** | 无 | 导出 JSON | admin.go:406 |
| POST | `/api/v1/admin/accounts/data` | 导入数据 | multipart/form-data 文件 | `{proxy_created,proxy_reused,...}` | admin.go:407 |
| POST | `/api/v1/admin/accounts/batch-update-credentials` | 批量更新凭证字段 | body：`account_ids`(必填)、`field`(必填 account_uuid/org_uuid/intercept_warmup_requests)、`value` | 未确认 | account_handler.go:1994+ |
| POST | `/api/v1/admin/accounts/batch-refresh-tier` | 批量刷新档位 | 参数未确认 | 未确认 | admin.go:410 |
| POST | `/api/v1/admin/accounts/bulk-update` | 批量编辑（选定字段/凭证） | body：`account_ids[]`、`filters?`、`name`、... | 未确认 | account_handler.go:2076+ |
| POST | `/api/v1/admin/accounts/batch-delete` | 批量删除 | body：`account_ids[]` | 未确认 | account_handler.go:1565+ |
| POST | `/api/v1/admin/accounts/batch-clear-error` | 批量清错 | body：`account_ids[]` | 未确认 | account_handler.go:1700+ |
| POST | `/api/v1/admin/accounts/batch-refresh` | 批量刷新 | body：`account_ids[]` | 未确认 | account_handler.go:1768+ |
| GET | `/api/v1/admin/accounts/antigravity/default-model-mapping` | Antigravity 默认模型映射 | 无 | 未确认 | admin.go:414 |
| POST | `/api/v1/admin/accounts/:id/shadow` | 创建 Spark 影子账号 | 参数未确认 | 未确认 | admin.go:416 |
| POST | `/api/v1/admin/accounts/generate-auth-url` | 生成 OAuth 授权 URL | body：`proxy_id?` | `{authorize_url}` | account_handler.go:2170+ |
| POST | `/api/v1/admin/accounts/generate-setup-token-url` | 生成 Setup Token URL | 参数未确认 | 未确认 | admin.go:418 |
| POST | `/api/v1/admin/accounts/exchange-code` | 兑换授权码 | body：`session_id`(必填)、`code`(必填)、`proxy_id?` | 未确认 | account_handler.go:2211+ |
| POST | `/api/v1/admin/accounts/exchange-setup-token-code` | 兑换 Setup Token 码 | 参数未确认 | 未确认 | admin.go:420 |
| POST | `/api/v1/admin/accounts/cookie-auth` | Cookie 认证（OAuth） | body：`code`(sessionKey, 必填)、`proxy_id?` | 未确认 | account_handler.go:2262+ |
| POST | `/api/v1/admin/accounts/setup-token-cookie-auth` | Setup Token Cookie 认证 | body：`code`(sessionKey, 必填)、`proxy_id?` | 未确认 | account_handler.go:2291+ |

### 6.1 OpenAI OAuth（`/api/v1/admin/openai`，admin.go:433-446）

`POST /generate-auth-url`、`POST /exchange-code`、`POST /refresh-token`、`POST /accounts/:id/refresh`、`POST /create-from-oauth`、`POST /create-from-codex-pat`（body：`access_token`(必填)、`name`、`notes`）、`GET /accounts/:id/quota`、`POST /accounts/:id/quota/refresh`、`POST /accounts/:id/reset-quota`。

### 6.2 Gemini OAuth（admin.go:448-455）

`POST /oauth/auth-url`、`POST /oauth/exchange-code`、`GET /oauth/capabilities`。

### 6.3 Antigravity OAuth（admin.go:457-464）

`POST /oauth/auth-url`、`POST /oauth/exchange-code`、`POST /oauth/refresh-token`。

### 6.4 Grok OAuth（admin.go:466-483）

`GET /oauth/capabilities`、`POST /oauth/auth-url`、`POST /oauth/exchange-code`、`POST /oauth/refresh-token`、`POST /oauth/sso-token`、`POST /oauth/password`、`POST /oauth/create-from-oauth`、`POST /sso-to-oauth`、`POST /oauth/reconcile`、`POST /accounts/:id/refresh`、`GET /accounts/:id/quota`、`POST /accounts/:id/reset-quota`、`GET /runtime-sanity`。（以上参数大多未确认）

---

## 7. 代理管理（`/api/v1/admin/proxies`）

来源：`routes/admin.go:485-504`；实现 `handler/admin/proxy_handler.go`、`proxy_data.go`。

| 方法 | 路径 | 功能 | 请求参数 | 返回示例 | 来源 |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/proxies` | 分页列代理 | query：`page/page_size` 等 | 分页 | admin.go:486 |
| GET | `/api/v1/admin/proxies/all` | 全量代理 | 无 | 列表 | admin.go:487 |
| GET | `/api/v1/admin/proxies/data` | **导出（step-up 2FA）** | 无 | 导出 JSON | admin.go:490 |
| POST | `/api/v1/admin/proxies/data` | 导入 | 文件 | `{proxy_created,proxy_reused,...}` | admin.go:491 |
| GET | `/api/v1/admin/proxies/:id` | 详情 | path `id` | 未确认 | admin.go:492 |
| POST | `/api/v1/admin/proxies` | 创建 | 参数未确认（含 host/port/username/password 等） | 未确认 | admin.go:493 |
| PUT | `/api/v1/admin/proxies/:id` | 更新 | 参数未确认 | 未确认 | admin.go:494 |
| DELETE | `/api/v1/admin/proxies/:id` | 删除 | path `id` | 未确认 | admin.go:495 |
| POST | `/api/v1/admin/proxies/:id/test` | 连通测试 | 参数未确认 | 未确认 | admin.go:496 |
| POST | `/api/v1/admin/proxies/:id/quality-check` | 质量检查 | 参数未确认 | 未确认 | admin.go:497 |
| GET | `/api/v1/admin/proxies/:id/stats` | 统计 | path `id` | 未确认 | admin.go:498 |
| GET | `/api/v1/admin/proxies/:id/accounts` | 代理下账号 | path `id` | 未确认 | admin.go:499 |
| POST | `/api/v1/admin/proxies/batch-delete` | 批量删除 | body 未确认 | 未确认 | admin.go:500 |
| POST | `/api/v1/admin/proxies/batch` | 批量创建 | 参数未确认 | 未确认 | admin.go:501 |

---

## 8. 渠道（Channel）管理（`/api/v1/admin/channels`）

来源：`routes/admin.go:725-736`；实现 `handler/admin/channel_handler.go`；前端类型 `frontend/src/api/admin/channels.ts`。

| 方法 | 路径 | 功能 | 请求参数 | 返回示例 | 来源 |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/channels` | 分页列渠道 | query：`page/page_size`、`status`、`search`、`sort_by/sort_order` | `{code:0,data:{items:[Channel],total,...}}` | channels.ts:70-90 |
| GET | `/api/v1/admin/channels/model-pricing` | 模型默认定价 | query：`model` | `{found,input_price,output_price,cache_write_price,cache_read_price,image_input_price,image_output_price}` | channels.ts:120-136 |
| GET | `/api/v1/admin/channels/pricing/sync-models` | 从 LiteLLM 目录同步模型名 | query：`platform` | `{models:string[]}` | channels.ts:147-156 |
| GET | `/api/v1/admin/channels/:id` | 渠道详情 | path `id` | `{code:0,data:Channel}` | channels.ts:96-100 |
| POST | `/api/v1/admin/channels` | 创建渠道 | body：`name`(必填)、`description`、`group_ids[]`、`model_pricing[]`、`model_mapping`、`billing_model_source`(requested/upstream/channel_mapped)、`restrict_models`、`features_config`、`apply_pricing_to_account_stats`、`account_stats_pricing_rules[]`（`CreateChannelRequest` channel_handler.go:45-61） | `{code:0,data:Channel}` | channels.ts:104-108 |
| PUT | `/api/v1/admin/channels/:id` | 更新渠道 | body：同创建（可空指针）+`status`(active/disabled) | `{code:0,data:Channel}` | channels.ts:112-116 |
| DELETE | `/api/v1/admin/channels/:id` | 删除渠道 | path `id` | 未确认 | channels.ts:120 |

`channelModelPricing` 字段：`platform`、`models[]`(必填 1-100)、`billing_mode`(token/per_request/image)、`input_price`/`output_price`/`cache_write_price`/`cache_read_price`/`image_input_price`/`image_output_price`/`per_request_price`、`intervals[]`（channel_handler.go:80-103）。

---

## 9. 渠道监控（`/api/v1/admin/channel-monitors`、`-v2`、`-templates`）

来源：`routes/admin.go:738-786`；`channel_monitor_handler.go`、`channel_monitor_template_handler.go`、`channel_monitor_v2_handler.go`。
> 这些端点被 `channelMonitorAdminFeatureGuard`（admin.go:813-823）保护——功能开关 `channel_monitor_enabled` 关闭时返回 `ErrChannelMonitorDisabled`。V2 读/矩阵端点还要求 `mode=v2`（admin.go:825-844）。

- **Monitors**：`GET/POST /api/v1/admin/channel-monitors`、`GET/POST /api/v1/admin/channel-monitors/:id(duplicate)`、`PUT/DELETE /:id`、`POST /:id/run`、`GET /:id/history`
- **Templates**：`GET/POST /api/v1/admin/channel-monitor-templates`、`GET/:id`、`PUT/DELETE/:id`、`GET /:id/monitors`、`POST /:id/apply`
- **V2**：`GET/PUT /api/v1/admin/channel-monitor-v2/config`；`GET /dimensions`、`/snapshot`、`/models`、`/matrix`、`/errors`、`/users`（需 mode=v2）
- 请求/返回参数未逐一确认。

---

## 10. 系统配置（`/api/v1/admin/settings`）

来源：`routes/admin.go:534-574`；实现 `setting_handler.go`、`setting_handler_update.go`、`setting_handler_email.go` 等。GET 返回全量设置 + auth source 默认值 + 支付配置 + ops 开关。

| 方法 | 路径 | 功能 | 请求参数 | 返回示例 | 来源 |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/settings` | 获取全部系统设置 | 无 | `{code:0,data:{...settings,auth_source_defaults,payment_config,ops_enabled}}` | setting_handler.go:102-130 |
| PUT | `/api/v1/admin/settings` | 更新设置（部分字段） | body：任意设置键 JSON | `{code:0,data:updated}` | setting_handler_update.go:381 |
| POST | `/api/v1/admin/settings/test-smtp` | 测试 SMTP | 参数未确认 | 未确认 | setting_handler_email.go:24 |
| POST | `/api/v1/admin/settings/send-test-email` | 发送测试邮件 | 参数未确认 | 未确认 | setting_handler_email.go:92 |
| GET | `/api/v1/admin/settings/email-templates` | 邮件模板列表 | 无 | 未确认 | setting_handler_email.go:191 |
| GET | `/api/v1/admin/settings/email-templates/:event/:locale` | 单模板 | path `event`、`locale` | 未确认 | setting_handler_email.go:212 |
| PUT | `/api/v1/admin/settings/email-templates/:event/:locale` | 更新模板 | body：模板内容 | 未确认 | setting_handler_email.go:227 |
| POST | `/api/v1/admin/settings/email-templates/:event/:locale/restore-official` | 还原官方模板 | path | 未确认 | setting_handler_email.go:247 |
| POST | `/api/v1/admin/settings/email-template-preview` | 模板预览 | 参数未确认 | 未确认 | setting_handler_email.go:262 |
| GET | `/api/v1/admin/settings/admin-api-key` | 查看 Admin API Key（脱敏） | 无 | 未确认 | admin.go:548 |
| POST | `/api/v1/admin/settings/admin-api-key/regenerate` | 重新生成 Admin API Key | 无 | 未确认 | admin.go:549 |
| DELETE | `/api/v1/admin/settings/admin-api-key` | 删除 Admin API Key | 无 | 未确认 | admin.go:550 |
| GET/PUT | `/api/v1/admin/settings/overload-cooldown` | 529 过载冷却配置 | 参数未确认 | 未确认 | admin.go:552-553 |
| GET/PUT | `/api/v1/admin/settings/rate-limit-429-cooldown` | 429 默认回避配置 | 参数未确认 | 未确认 | admin.go:554-555 |
| GET/PUT | `/api/v1/admin/settings/panel-rate-limit` | 面板 API 限流配置 | 参数未确认 | 未确认 | admin.go:556-557 |
| GET/PUT | `/api/v1/admin/settings/stream-timeout` | 流超时处理配置 | 参数未确认 | 未确认 | admin.go:558-559 |
| GET/PUT | `/api/v1/admin/settings/rectifier` | 请求整流器配置 | 参数未确认 | 未确认 | admin.go:560-561 |
| GET/PUT | `/api/v1/admin/settings/beta-policy` | Beta 策略配置 | 参数未确认 | 未确认 | admin.go:562-563 |
| GET/PUT | `/api/v1/admin/settings/web-search-emulation` | Web Search 模拟配置 | 参数未确认 | 未确认 | admin.go:564-565 |
| POST | `/api/v1/admin/settings/web-search-emulation/test` | 测试 Web Search 模拟 | 参数未确认 | 未确认 | admin.go:566 |
| POST | `/api/v1/admin/settings/web-search-emulation/reset-usage` | 重置 Web Search 用量 | 参数未确认 | 未确认 | admin.go:567 |

---

## 11. 数据管理 / 备份恢复

### 11.1 数据管理（`/api/v1/admin/data-management`，admin.go:576-598）

| 方法 | 路径 | 功能 | 请求参数 | 返回示例 | 来源 |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/data-management/agent/health` | 数据代理健康 | 无 | 未确认 | admin.go:577 |
| GET/PUT | `/api/v1/admin/data-management/config` | 数据管理配置 | 参数未确认 | 未确认 | admin.go:578-579 |
| GET/POST/PUT/DELETE | `/api/v1/admin/data-management/sources/:source_type/profiles[...]` | 来源 profile 管理 | `source_type` path；body：`config`(必填) 等 | 未确认 | admin.go:580-585 |
| POST | `/api/v1/admin/data-management/s3/test` | 测试 S3 | 参数未确认 | 未确认 | admin.go:586 |
| GET | `/api/v1/admin/data-management/s3/profiles` | S3 profile 列表 | 无 | 未确认 | admin.go:587 |
| POST/PUT | `/api/v1/admin/data-management/s3/profiles[...]` | 创建/更新 S3 profile（**step-up**） | body：`profile_id`(必填)、`name`(必填)、`enabled`、`endpoint`、`access_key_id`、`secret_access_key`、`bucket`、`region`、`set_active` | 未确认 | admin.go:588-589 |
| DELETE | `/api/v1/admin/data-management/s3/profiles/:profile_id` | 删除 S3 profile | path | 未确认 | admin.go:590 |
| POST | `/api/v1/admin/data-management/s3/profiles/:profile_id/activate` | 激活 S3 profile（**step-up**） | path | 未确认 | admin.go:591 |
| POST | `/api/v1/admin/data-management/backups` | 创建备份任务（**step-up**） | 参数未确认 | 未确认 | admin.go:592 |
| GET | `/api/v1/admin/data-management/backups`、`/backups/:job_id` | 备份任务列表/详情 | path | 未确认 | admin.go:593-594 |

### 11.2 备份（`/api/v1/admin/backups`，admin.go:600-630）

| 方法 | 路径 | 功能 | 请求参数 | 返回示例 | 来源 |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/backups/s3-config` | S3 存储配置 | 无 | 未确认 | admin.go:602 |
| PUT | `/api/v1/admin/backups/s3-config` | 更新 S3 配置（**step-up**） | 参数未确认 | 未确认 | admin.go:604 |
| POST | `/api/v1/admin/backups/s3-config/test` | 测试 S3 连接 | 参数未确认 | 未确认 | admin.go:605 |
| GET/PUT | `/api/v1/admin/backups/image-storage` | 异步生图对象存储配置（PUT 需 **step-up**） | 参数未确认 | 未确认 | admin.go:607-609 |
| POST | `/api/v1/admin/backups/image-storage/test` | 测试图片存储连接 | 参数未确认 | 未确认 | admin.go:610 |
| GET/PUT | `/api/v1/admin/backups/schedule` | 定时备份配置 | 参数未确认 | 未确认 | admin.go:612-613 |
| POST | `/api/v1/admin/backups` | 创建备份（**step-up**） | body：`expire_days?`(nil=14 天，0=永久) | 未确认 | admin.go:616 |
| GET | `/api/v1/admin/backups` | 备份列表 | 无 | 未确认 | admin.go:617 |
| GET/DELETE | `/api/v1/admin/backups/:id` | 备份详情/删除 | path | 未确认 | admin.go:618-619 |
| GET | `/api/v1/admin/backups/:id/download-url` | 下载链接（**step-up**） | path | 未确认 | admin.go:621 |
| POST | `/api/v1/admin/backups/:id/restore` | 恢复备份（**step-up**，整库覆盖） | path | 未确认 | admin.go:623 |

---

## 12. 系统管理 / 更新（`/api/v1/admin/system`）

来源：`routes/admin.go:632-642`；实现 `system_handler.go`。

| 方法 | 路径 | 功能 | 请求参数 | 返回示例 | 来源 |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/system/version` | 当前版本 | 无 | `{code:0,data:{version:"x.y.z"}}` | system_handler.go:63-69 |
| GET | `/api/v1/admin/system/check-updates` | 检查更新 | query：`force=true` | `{code:0,data:UpdateInfo}` | system_handler.go:72-81 |
| POST | `/api/v1/admin/system/update` | 执行更新（幂等） | 无 body | `{code:0,data:{message,need_restart:true,operation_id}}` 或 `{message:"Already up to date",already_up_to_date:true,current_version,latest_version,operation_id}` | system_handler.go:84-127 |
| GET | `/api/v1/admin/system/rollback-versions` | 可回滚版本列表 | 无 | `{code:0,data:{versions:[...]}}` | system_handler.go:132-144 |
| POST | `/api/v1/admin/system/rollback` | 回滚（空 body 用本地 .backup，或 `{version:"x.y.z"}`） | body：`version?` | 未确认 | system_handler.go:148+ |
| POST | `/api/v1/admin/system/restart` | 重启服务 | 无 | 未确认 | system_handler.go:202 |

---

## 13. 订阅 / 套餐管理

### 13.1 管理订阅（`/api/v1/admin/subscriptions`，admin.go:644-664）

| 方法 | 路径 | 功能 | 请求参数 | 返回示例 | 来源 |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/subscriptions` | 分页列表 | query：`page/page_size`、`user_id`、`group_id`、`status`、`platform`、`sort_by/sort_order` | 分页 `{items:[AdminUserSubscription],...}` | subscription_handler.go:69+ |
| GET | `/api/v1/admin/subscriptions/:id` | 详情 | path | `{code:0,data:AdminUserSubscription}` | subscription_handler.go:97+ |
| GET | `/api/v1/admin/subscriptions/:id/progress` | 用量进度 | path | 未确认 | subscription_handler.go:119+ |
| POST | `/api/v1/admin/subscriptions/assign` | 分配订阅 | body：`user_id`(必填)、`group_id`(必填)、`validity_days`(≤36500)、`notes` | `{code:0,data:AdminUserSubscription}` | subscription_handler.go:139+ |
| POST | `/api/v1/admin/subscriptions/bulk-assign` | 批量分配 | body：`user_ids[]`(必填≥1)、`group_id`(必填)、`validity_days`、`notes` | 未确认 | subscription_handler.go |
| POST | `/api/v1/admin/subscriptions/:id/extend` | 延长/缩短 | body：`days`(必填，-36500..36500) | 未确认 | admin.go:652 |
| POST | `/api/v1/admin/subscriptions/:id/reset-quota` | 重置配额 | path | 未确认 | admin.go:653 |
| POST | `/api/v1/admin/subscriptions/:id/revoke` | 撤销订阅 | path | 未确认 | admin.go:654 |
| POST | `/api/v1/admin/subscriptions/:id/restore` | 恢复订阅 | path | 未确认 | admin.go:655 |
| DELETE | `/api/v1/admin/subscriptions/:id` | 撤销（软删） | path | 未确认 | admin.go:656 |
| GET | `/api/v1/admin/groups/:id/subscriptions` | 分组下订阅 | path `id` | 未确认 | admin.go:660 |
| GET | `/api/v1/admin/users/:id/subscriptions` | 用户下订阅 | path `id` | 未确认 | admin.go:663 |

### 13.2 支付套餐（`/api/v1/admin/payment/plans`，payment.go:115-121）

| 方法 | 路径 | 功能 | 请求参数 | 返回示例 | 来源 |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/payment/plans` | 套餐列表 | 无 | `{code:0,data:[AdminSubscriptionPlanResult]}`（含 group 信息/倍率/限额/模型范围） | payment_handler.go:238+ |
| POST | `/api/v1/admin/payment/plans` | 创建套餐 | body：`service.CreatePlanRequest`（含 name/price/group_id/validity_days/for_sale 等） | `{code:0,data:plan}`（HTTP 201） | payment_handler.go:293+ |
| PUT | `/api/v1/admin/payment/plans/:id` | 更新套餐 | body：`UpdatePlanRequest` | `{code:0,data:plan}` | payment_handler.go:307+ |
| DELETE | `/api/v1/admin/payment/plans/:id` | 删除套餐 | path | `{code:0,data:{message:"deleted"}}` | payment_handler.go:321+ |

### 13.3 支付 Provider 实例（payment.go:123-131）

| 方法 | 路径 | 功能 | 请求参数 | 返回示例 | 来源 |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/payment/providers` | Provider 列表 | 无 | `{code:0,data:[...]}` | payment_handler.go:339+ |
| POST | `/api/v1/admin/payment/providers` | 创建 Provider | body：`CreateProviderInstanceRequest` | `{code:0,data:inst}`（201） | payment_handler.go:346+ |
| PUT | `/api/v1/admin/payment/providers/:id` | 更新 Provider | body：`UpdateProviderInstanceRequest` | `{code:0,data:inst}` | payment_handler.go:359+ |
| DELETE | `/api/v1/admin/payment/providers/:id` | 删除 Provider | path | `{code:0,data:{message:"deleted"}}` | payment_handler.go:372+ |

---

## 14. 支付管理 / 订单（`/api/v1/admin/payment`）

来源：`routes/payment.go:96-132`（adminGroup，挂 `adminAuth + auditLog + AdminComplianceGuard`）；实现 `handler/admin/payment_handler.go`。文档：`docs/ADMIN_PAYMENT_INTEGRATION_API.md`、`docs/PAYMENT_CN.md`、`docs/PAYMENT.md`。

| 方法 | 路径 | 功能 | 请求参数 | 返回示例 | 来源 |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/payment/dashboard` | 支付仪表盘统计 | query：`days`(默认30) | `{code:0,data:stats}` | payment_handler.go:48-60 |
| GET | `/api/v1/admin/payment/config` | 支付配置 | 无 | `{code:0,data:cfg}` | payment_handler.go:396+ |
| PUT | `/api/v1/admin/payment/config` | 更新支付配置 | body：`UpdatePaymentConfigRequest` | `{code:0,data:{message:"updated"}}` | payment_handler.go:404+ |
| GET | `/api/v1/admin/payment/orders` | 订单分页列表 | query：`page/page_size`、`user_id`、`status`、`order_type`、`payment_type`、`keyword` | 分页 `{items:[AdminPaymentOrderResult],...}` | payment_handler.go:65-90 |
| GET | `/api/v1/admin/payment/orders/:id` | 订单详情+审计日志 | path | `{code:0,data:{order,auditLogs}}` | payment_handler.go:93-102 |
| POST | `/api/v1/admin/payment/orders/:id/cancel` | 取消待支付订单 | path | `{code:0,data:{message}}` | payment_handler.go:105-114 |
| POST | `/api/v1/admin/payment/orders/:id/retry` | 重试履约 | path | `{code:0,data:{message:"fulfillment retried"}}` | payment_handler.go:118-128 |
| POST | `/api/v1/admin/payment/orders/:id/refund` | 处理退款 | body：`amount`、`reason`、`force`、`deduct_balance` | `{code:0,data:result}` | payment_handler.go:244-268 |
| POST | `/api/v1/admin/payment/orders/:id/refund/query` | 查询并终态化退款 | path | `{code:0,data:result}` | payment_handler.go:272-282 |

`AdminPaymentOrderResult` 关键字段（payment_handler.go:108-138）：`id, user_id, user_email, user_name, user_notes, amount, pay_amount, fee_rate, currency, recharge_code, out_trade_no, payment_type, payment_trade_no, pay_url, qr_code, qr_code_img, order_type, plan_id, subscription_group_id, subscription_days, provider_instance_id, provider_key, status, refund_amount, refund_reason, refund_at, force_refund, expires_at, paid_at, completed_at, failed_at, failed_reason, client_ip, src_host, src_url, created_at, updated_at`。

---

## 15. 卡密 / 兑换码（`/api/v1/admin/redeem-codes`）

来源：`routes/admin.go:506-520`；实现 `redeem_handler.go`；文档示例 `docs/ADMIN_PAYMENT_INTEGRATION_API.md`。

| 方法 | 路径 | 功能 | 请求参数 | 返回示例 | 来源 |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/redeem-codes` | 分页列表 | query：`page/page_size`、`type`、`status`、`search`、`sort_by/sort_order` | 分页 `{items:[AdminRedeemCode],...}` | redeem_handler.go:118+ |
| GET | `/api/v1/admin/redeem-codes/stats` | 统计 | 无 | 未确认 | admin.go:508 |
| GET | `/api/v1/admin/redeem-codes/export` | 导出（CSV） | 无 | CSV 文件 | admin.go:509 |
| GET | `/api/v1/admin/redeem-codes/:id` | 详情 | path | `{code:0,data:AdminRedeemCode}` | redeem_handler.go:143+ |
| POST | `/api/v1/admin/redeem-codes/create-and-redeem` | 原子"创建+兑换"（幂等） | body：`code`(必填 3-128)、`type`(balance/concurrency/subscription/invitation，缺省 balance)、`value`(必填)、`user_id`(必填>0)、`group_id?`(subscription 必填)、`validity_days`、`notes`、`expires_at`/`expires_in_days` | `{code:0,data:{redeem_code:...}}`；幂等：同 code 同 used_by=200、异 used_by=409、缺 Idempotency-Key=400 | redeem_handler.go:175+ |
| POST | `/api/v1/admin/redeem-codes/generate` | 批量生成（幂等） | body：`count`(必填 1-100)、`type`(必填)、`value`、`group_id?`、`validity_days`、`expires_at`/`expires_in_days` | `{code:0,data:[AdminRedeemCode]}` | redeem_handler.go:155+ |
| DELETE | `/api/v1/admin/redeem-codes/:id` | 删除 | path | 未确认 | admin.go:514 |
| POST | `/api/v1/admin/redeem-codes/batch-delete` | 批量删除 | 参数未确认 | 未确认 | admin.go:515 |
| POST | `/api/v1/admin/redeem-codes/batch-update` | 批量更新 | 参数未确认 | 未确认 | admin.go:516 |
| POST | `/api/v1/admin/redeem-codes/:id/expire` | 使过期 | path | 未确认 | admin.go:517 |

---

## 16. 优惠码（`/api/v1/admin/promo-codes`）

来源：`routes/admin.go:522-532`；实现 `promo_handler.go`。

| 方法 | 路径 | 功能 | 请求参数 | 返回示例 | 来源 |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/promo-codes` | 列表 | 参数未确认 | 未确认 | admin.go:523 |
| GET | `/api/v1/admin/promo-codes/:id` | 详情 | path | 未确认 | admin.go:524 |
| POST | `/api/v1/admin/promo-codes` | 创建 | body：`code?`(空自动生成)、`bonus_amount`(必填≥0)、`max_uses`(0=无限)、`expires_at?` | 未确认 | admin.go:525 |
| PUT | `/api/v1/admin/promo-codes/:id` | 更新 | body：`code*`、`bonus_amount*`、`max_uses*` | 未确认 | admin.go:526 |
| DELETE | `/api/v1/admin/promo-codes/:id` | 删除 | path | 未确认 | admin.go:527 |
| GET | `/api/v1/admin/promo-codes/:id/usages` | 使用记录 | path | 未确认 | admin.go:528 |

---

## 17. 公告管理（`/api/v1/admin/announcements`）

来源：`routes/admin.go:421-431`；实现 `announcement_handler.go`。

| 方法 | 路径 | 功能 | 请求参数 | 返回示例 | 来源 |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/announcements` | 列表 | 参数未确认 | 未确认 | admin.go:422 |
| POST | `/api/v1/admin/announcements` | 创建 | body：`title`(必填)、`content`(必填)、`status`(draft/active/archived)、`starts_at?`、`ends_at?`(Unix秒) | 未确认 | admin.go:423 |
| GET | `/api/v1/admin/announcements/:id` | 详情 | path | 未确认 | admin.go:424 |
| PUT | `/api/v1/admin/announcements/:id` | 更新 | body：`title*`、`content*`、`status*`、`starts_at*`、`ends_at*` | 未确认 | admin.go:425 |
| DELETE | `/api/v1/admin/announcements/:id` | 删除 | path | 未确认 | admin.go:426 |
| GET | `/api/v1/admin/announcements/:id/read-status` | 已读状态列表 | path | 未确认 | admin.go:427 |

---

## 18. 使用记录（`/api/v1/admin/usage`）

来源：`routes/admin.go:666-677`；实现 `usage_handler.go`。

| 方法 | 路径 | 功能 | 请求参数 | 返回示例 | 来源 |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/usage` | 用量分页列表 | query：`page/page_size`、user/group/key 筛选、时间范围等（未逐一确认） | 分页 | admin.go:667 |
| GET | `/api/v1/admin/usage/stats` | 用量统计 | 参数未确认 | 未确认 | admin.go:668 |
| GET | `/api/v1/admin/usage/search-users` | 搜索用户 | 参数未确认 | 未确认 | admin.go:669 |
| GET | `/api/v1/admin/usage/search-api-keys` | 搜索 API Key | 参数未确认 | 未确认 | admin.go:670 |
| GET | `/api/v1/admin/usage/cleanup-tasks` | 清理任务列表 | 无 | 未确认 | admin.go:671 |
| POST | `/api/v1/admin/usage/cleanup-tasks` | 创建清理任务 | 参数未确认 | 未确认 | admin.go:672 |
| POST | `/api/v1/admin/usage/cleanup-tasks/:id/cancel` | 取消清理任务 | path | 未确认 | admin.go:673 |

---

## 19. 仪表盘 / 统计（`/api/v1/admin/dashboard`）

来源：`routes/admin.go:272-289`；实现 `dashboard_handler.go`、`dashboard_snapshot_v2_handler.go`；前端 `frontend/src/api/admin/dashboard.ts`。

| 方法 | 路径 | 功能 | 请求参数 | 返回示例 | 来源 |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/dashboard/snapshot-v2` | 聚合快照 | query：`start_date/end_date/granularity/include_stats/include_trend/include_model_stats/include_group_stats/users_trend_limit` 等 | `{code:0,data:{generated_at,start_date,end_date,granularity,stats?,trend?,models?,groups?,users_trend?}}`（stats 含 uptime） | admin.go:273；dashboard.ts:142-150 |
| GET | `/api/v1/admin/dashboard/stats` | 基础统计 | 无 | `DashboardStats`（users/keys/accounts/token 用量） | dashboard.ts:24 |
| GET | `/api/v1/admin/dashboard/realtime` | 实时指标 | 无 | `{requests_per_minute,average_response_time,error_rate,...}` | dashboard.ts:40-44 |
| GET | `/api/v1/admin/dashboard/trend` | 用量趋势 | query：`TrendParams`（时间/粒度） | `TrendResponse` | dashboard.ts:74-77 |
| GET | `/api/v1/admin/dashboard/models` | 模型统计 | query：`ModelStatsParams` | `ModelStatsResponse` | dashboard.ts:105-108 |
| GET | `/api/v1/admin/dashboard/groups` | 分组统计 | query：`GroupStatsParams` | `GroupStatsResponse` | dashboard.ts:159+ |
| GET | `/api/v1/admin/dashboard/api-keys-trend` | API Key 用量趋势 | query：`ApiKeyTrendParams` | `ApiKeyTrendResponse` | dashboard.ts:223-229 |
| GET | `/api/v1/admin/dashboard/users-trend` | 用户用量趋势 | query：`UserTrendParams` | `UserTrendResponse` | dashboard.ts:253-257 |
| GET | `/api/v1/admin/dashboard/users-ranking` | 用户消费排行 | query：`UserSpendingRankingParams` | `UserSpendingRankingResponse` | dashboard.ts:265-271 |
| POST | `/api/v1/admin/dashboard/users-usage` | 批量用户用量 | body：`user_ids[]` | `BatchUsersUsageResponse` | dashboard.ts:296-299 |
| POST | `/api/v1/admin/dashboard/api-keys-usage` | 批量 Key 用量 | body：`api_key_ids[]` | `BatchApiKeysUsageResponse` | dashboard.ts:319-326 |
| GET | `/api/v1/admin/dashboard/user-breakdown` | 用户维度细分 | query：`start_date/end_date/group_id...` | `UserBreakdownResponse` | dashboard.ts:190-194 |
| POST | `/api/v1/admin/dashboard/aggregation/backfill` | 聚合回填 | 参数未确认 | 未确认 | admin.go:288 |

---

## 20. 运维监控 Ops（`/api/v1/admin/ops`）

来源：`routes/admin.go:182-270`（registerOpsRoutes）；实现 `ops_handler.go`、`ops_dashboard_handler.go`、`ops_realtime_handler.go`、`ops_ws_handler.go`、`ops_alerts_handler.go`、`ops_system_log_handler.go` 等。
> 受 `ops_monitoring_enabled` 开关影响；关闭时相关端点返回 404「Ops monitoring is disabled」。

### 20.1 实时 / 信号

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/ops/concurrency` | 并发统计 |
| GET | `/ops/user-concurrency` | 用户并发统计 |
| GET | `/ops/account-availability` | 账号可用性 |
| GET | `/ops/realtime-traffic` | 实时流量汇总 |

### 20.2 告警规则 / 事件

| 方法 | 路径 | 功能 |
|---|---|---|
| GET/POST | `/ops/alert-rules` | 告警规则列表 / 创建 |
| PUT/DELETE | `/ops/alert-rules/:id` | 更新 / 删除规则 |
| GET | `/ops/alert-events` | 告警事件列表 |
| GET | `/ops/alert-events/:id` | 告警事件详情 |
| PUT | `/ops/alert-events/:id/status` | 更新事件状态 |
| POST | `/ops/alert-silences` | 创建告警静默 |

### 20.3 通知 / 运行时 / 高级配置

| 方法 | 路径 | 功能 |
|---|---|---|
| GET/PUT | `/ops/email-notification/config` | 邮件通知配置 |
| GET/PUT | `/ops/runtime/alert` | 告警运行时设置 |
| GET/PUT | `/ops/runtime/logging` | 日志运行时配置 |
| POST | `/ops/runtime/logging/reset` | 重置日志配置 |
| GET/PUT | `/ops/advanced-settings` | 高级设置 |
| GET/PUT | `/ops/settings/metric-thresholds` | 指标阈值 |
| GET(WS) | `/ops/ws/qps` | WebSocket 实时 QPS/TPS（`Sec-WebSocket-Protocol: sub2api-admin, jwt.<TOKEN>`，README_CN.md:697） |

### 20.4 错误日志

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/ops/errors` | 错误日志列表（legacy） |
| GET | `/ops/errors/:id` | 错误日志详情 |
| PUT | `/ops/errors/:id/resolve` | 标记错误已解决 |
| GET | `/ops/request-errors` | 客户端可见请求错误列表 |
| GET | `/ops/request-errors/:id` | 请求错误详情 |
| GET | `/ops/request-errors/:id/upstream-errors` | 请求错误关联的上游错误 |
| PUT | `/ops/request-errors/:id/resolve` | 解决请求错误 |
| GET | `/ops/ingress-rejections` | 入口准入拒绝聚合 |
| GET | `/ops/ingress-rejections/health` | 拒绝聚合健康 |
| GET | `/ops/auth-cache-invalidation/health` | 认证缓存失效健康 |
| GET | `/ops/upstream-errors` | 独立上游错误列表 |
| GET | `/ops/upstream-errors/:id` | 上游错误详情 |
| PUT | `/ops/upstream-errors/:id/resolve` | 解决上游错误 |
| GET | `/ops/requests` | 请求钻取（成功+错误） |
| GET | `/ops/system-logs` | 索引化系统日志 |
| POST | `/ops/system-logs/cleanup` | 清理系统日志 |
| GET | `/ops/system-logs/health` | 系统日志摄入健康 |

### 20.5 Ops 仪表盘（vNext）

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/ops/dashboard/snapshot-v2` | 快照 v2 |
| GET | `/ops/dashboard/overview` | 概览 |
| GET | `/ops/dashboard/throughput-trend` | 吞吐趋势 |
| GET | `/ops/dashboard/latency-histogram` | 延迟直方图 |
| GET | `/ops/dashboard/error-trend` | 错误趋势 |
| GET | `/ops/dashboard/error-distribution` | 错误分布 |
| GET | `/ops/dashboard/openai-token-stats` | OpenAI token 统计 |

---

## 21. 注意事项 / 已知差异

1. **参数未确认**：本文档中标注「参数未确认」的端点，其请求/响应 schema 未在上游源码与前端类型中逐一核验，实际调用前请以 `backend/internal/handler/admin/**` 中的请求 struct 或前端 `frontend/src/api/admin/**` 类型为准。
2. **无 root 角色**：本仓库仅 `admin`/`user` 两种角色；任何文档提到的 `root` 均不存在，传入 `role:"root"` 会被拒绝。
3. **管理端认证**：所有 `/api/v1/admin/*` 端点统一经过 `AdminAuthMiddleware` + 面板限流 + 审计 + 合规门；`step-up_enabled` 开启后部分敏感操作还需 step-up 2FA。
4. **支付管理**：`/api/v1/admin/payment/*` 额外经过 `auditLog` 与 `AdminComplianceGuard`（`routes/payment.go:96-132`），写接口建议携带 `Idempotency-Key`。
5. **响应信封差异**：大多数端点使用 `{code,message,data}` 信封；Ops、Dashboard 部分端点直接返回裸数据或 `gin.H`，前端经 `client.ts` 拦截器统一解包。
6. **端点规模**：`/api/v1/admin/*` 下注册了 200+ 路由（含 Ops、支付、渠道监控等），本文档覆盖全部已确认类别。

---

## 22. 来源与维护

- 上游仓库：https://github.com/Wei-Shaw/sub2api
- 本文档整理对应 commit：`10a4c6e`（2026-08-10）
- 主要上游文档：`docs/ADMIN_PAYMENT_INTEGRATION_API.md`、`docs/PAYMENT_CN.md`、`docs/PAYMENT.md`、`docs/legal/admin-compliance.zh.md`
- 主要上游源码：`backend/internal/server/routes/admin.go`、`routes/payment.go`、`handler/admin/**`、`server/middleware/admin_auth.go`、`middleware/step_up.go`、`pkg/response/response.go`
- 前端类型：`frontend/src/api/admin/**`（channels.ts、dashboard.ts、types.ts 等）
- 维护约定：上游 API 变动后，按 §21 的已知差异逐项核对更新本文件。
