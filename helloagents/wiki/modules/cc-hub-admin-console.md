# CC Hub 管理控制台

## 模块职责

CC Hub 管理控制台面向单个已配置的 Claude Code Hub 实例，提供三个管理员视图：

- `Providers`: 查看多个 CC Hub `provider`，按名称、`providerType` 和启用状态筛选，展示顶层 `todayCallCount`。
- `Quota management`: 分页读取用户，并以 `limit-usage:all` 为额度正确性基线展示总额度、已用额度、日/月用量和剩余额度。
- `Usage details`: 按已核验字段查询 usage logs，使用稳定数值 `id`，在最新 cursor 页可见时每 10 秒受控刷新。

本模块不负责 `vendor`、endpoint 管理、Sub2API、多实例配置、额度写入、日志导出或实时订阅。

## 安全边界

- CC Hub 网络请求只能从 `src-tauri/src/cc_hub/` 发出；React 只调用固定 Tauri commands。
- 管理员 token 只作为保存连接时的瞬时 command 输入，随后由 Windows credential store 管理；本地 JSON 只保存 base URL 和非敏感连接元数据。
- Rust HTTP client 只拼接已规范化 base URL 下的固定相对路径，拒绝 userinfo、query、fragment 和未确认的明文 HTTP；重定向策略关闭。
- RFC 9457 错误只映射为稳定 code/status/errorCode，原始 `detail`、token 和 key 不返回前端。
- provider PATCH 的请求/响应字段契约已由 OpenAPI 确认，并已在授权的停用、零调用非关键 provider 上以相同 `is_enabled` 完成可逆核验：返回 `200`、`isEnabled:false`，`X-CCH-Undo-Token` 与 `X-CCH-Operation-Id` 存在，复读状态未改变。`providerPatchRuntimeVerified` 当前为 `true`，页面开关可用。

## 命令边界

| Command | 用途 |
|---|---|
| `get_cc_hub_connection_state` | 读取脱敏连接状态 |
| `save_cc_hub_connection` | 在健康、admin 读取和必要 schema 检查成功后保存连接 |
| `test_cc_hub_connection` | 重新执行连接能力检查 |
| `remove_cc_hub_connection` | 删除 credential 和连接元数据 |
| `list_providers` | 固定 provider 列表查询和本地启用状态筛选 |
| `set_provider_enabled` | 发送单 provider 的 `{is_enabled:boolean}` PATCH；仅供授权后的 UI 使用 |
| `list_quota_users` | 用户分页与最多四并发的逐用户额度读取 |
| `list_usage_logs` | cursor、毫秒时间范围及已确认筛选字段查询 |
| `get_usage_filter_options` | 读取模型、状态码、endpoint、时区和显示设置 |

## 已确认数据规则

- provider 读取字段使用 camelCase，今日调用次数来自顶层 `todayCallCount`；PATCH 请求字段使用 snake_case `is_enabled`，PATCH 响应只作为 `isEnabled` patch result 解析。
- `limitDaily`、`limitMonthly`、`limitTotal` 都是 `{usage, limit}`；`limit:null` 表示未配置上限，页面显示 `Unlimited`。
- `users:usageBatch` 只提供按 key 的今日统计，不覆盖额度页所需桶，因此不作为额度主数据源。
- usage logs 使用 `cursorCreatedAt`、`cursorId`、`limit` 分页；响应的 `pageInfo.nextCursor` 使用已确认的 `createdAt|id` 夹具形状解析，无法解析时不回退到未确认的分页参数。
- “今天”按 CC Hub `/api/v1/system/timezone` 计算为 Unix 毫秒范围；无法确认时不擅自换算。

## 验证状态

- 前端 Vitest、lint 和 Vite production build 已通过。
- Rust 1.77.2 `cargo check --tests --no-default-features` 已通过临时 pkg-config shim 的类型检查；完整 Rust test link 和 Tauri GUI 构建需要 GTK/WebKit 或 Windows 工具链。
- provider PATCH 已完成授权的状态保持核验；Windows credential store 手工验收仍是 HITL 项，不在脱敏 fixture 中伪造完成状态。
