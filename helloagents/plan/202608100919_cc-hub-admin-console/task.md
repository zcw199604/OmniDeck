# 任务清单: CC Hub 管理控制台

目录: `helloagents/plan/202608100919_cc-hub-admin-console/`

## 0. 方案边界确认

- [√] 0.1 确认实施范围只覆盖一个 CC Hub 实例中的 `provider` 管理、用户额度只读汇总和使用详情轮询，不将 `vendor`、endpoint、Sub2API 或额度写入混入本次实现，验证 [why.md#范围边界](why.md#范围边界)。
  - 执行模式: AFK
  - 涉及文件: `why.md`, `how.md`, `task.md`
  - 完成标准: 三份方案文件对范围内、范围外、术语和三个页面的描述一致。
  - 验证方式: 只读核对方案包三件套。

- [√] 0.2 确认宿主适配器是唯一 CC Hub 网络出口，渲染层不保存 token、不直接 `fetch`，验证 [how.md#架构设计](how.md#架构设计)。
  - 执行模式: AFK
  - 涉及文件: `how.md`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`
  - 完成标准: 实施任务中没有要求放宽 CSP、加入前端 Bearer token 或暴露通用 HTTP 命令。
  - 验证方式: 只读核对设计边界和任务清单。

- [√] 0.3 确认本次不进行无关的路由、构建、Tauri capability 或样式重构，验证 [how.md#设计边界](how.md#设计边界)。
  - 执行模式: AFK
  - 涉及文件: `how.md`, `task.md`
  - 完成标准: 所有后续任务均直接服务于 CC Hub 管理控制台。
  - 验证方式: 实施前后审查 `git diff --stat` 与任务清单。

## 1. 核验 CC Hub 上游契约

- [√] 1.1 在拥有测试 CC Hub 管理员授权的环境中执行连接探测，并保存脱敏 OpenAPI 和最小响应夹具，验证 [why.md#需求-建立受保护的-cc-hub-管理连接](why.md#需求-建立受保护的-cc-hub-管理连接)。
  - 执行模式: HITL
  - 涉及文件: `tests/fixtures/cc-hub/openapi.json`, `tests/fixtures/cc-hub/providers-statistics.json`, `tests/fixtures/cc-hub/usage-logs.json`
  - 完成标准: 已确认 API 版本、管理员授权、provider statistics 的今日调用字段、usage log 的稳定 ID/时间/排序/筛选字段；夹具不含 token、API key、真实用户名或原始 `detail`。
  - 验证方式: 用已配置的测试实例请求 `/api/v1/health`、`/api/v1/openapi.json`、`/api/v1/providers?include=statistics` 和 `/api/v1/usage-logs`；人工检查脱敏夹具。

- [√] 1.2 核验 provider 启停与用户额度的完整契约，验证 [why.md#需求-查看和控制供应商实例](why.md#需求-查看和控制供应商实例) 和 [why.md#需求-查看限额用户的额度情况](why.md#需求-查看限额用户的额度情况)；读取型额度核验与 provider PATCH 的线上可逆核验均已完成。
  - 执行模式: HITL
  - 涉及文件: `tests/fixtures/cc-hub/provider-patch.json`, `tests/fixtures/cc-hub/limit-usage-all.json`, `tests/fixtures/cc-hub/users-usage-batch.json`
  - 完成标准: 已确认最小 `{is_enabled:boolean}` PATCH body/返回 `isEnabled`/operation header，且 `limitTotal`、`limitDaily`、`limitMonthly` 的 usage/limit、无限额语义和 `users:usageBatch` 覆盖度可复核。
  - 验证方式: 在获许可的非关键 provider 上完成一次可恢复的开关核验；请求用户列表、单用户 `limit-usage:all` 与批量端点；记录脱敏响应和字段映射。
  - 当前证据: OpenAPI 已确认 PATCH 字段/响应 header；已在授权的停用、零调用非关键 provider 上发送相同 `is_enabled:false`，返回 `200` 且响应/复读状态均为 `false`。用户、额度桶与 batch 均已在测试实例只读核验。

- [√] 1.3 当目标实例与知识库 API 手册不一致时，先更新方案与外部 API 文档，再继续编码。
  - 执行模式: AFK
  - 涉及文件: `helloagents/wiki/external/claude-code-hub-api.md`, `why.md`, `how.md`
  - 完成标准: 实现依赖的每个上游字段都有真实实例或 OpenAPI 证据；不保留未经说明的字段假设。
  - 验证方式: 对照 fixture、OpenAPI 和本地 API 手册的端点/字段/认证层级。

## 2. 建立受保护的宿主适配层

- [√] 2.1 RED: 为 URL 规范化、固定 endpoint、token 不可回读和 RFC 9457 错误脱敏写出失败测试，验证 [why.md#需求-建立受保护的-cc-hub-管理连接](why.md#需求-建立受保护的-cc-hub-管理连接)。
  - 执行模式: AFK
  - 涉及文件: `src-tauri/src/cc_hub/client_tests.rs`, `src-tauri/src/cc_hub/contracts_tests.rs`, `tests/fixtures/cc-hub/problem-forbidden.json`
  - 完成标准: 测试在实现前失败，失败原因分别对应无效 URL、越界请求路径、凭据泄露、错误映射和 fixture 解析目标。
  - 验证方式: `cargo test --manifest-path src-tauri/Cargo.toml cc_hub`，记录预期失败摘要。

- [√] 2.2 GREEN: 实现非敏感连接元数据和 OS credential store 封装。
  - 执行模式: AFK
  - 涉及文件: `src-tauri/Cargo.toml`, `src-tauri/src/cc_hub/config.rs`, `src-tauri/src/cc_hub/credentials.rs`
  - 完成标准: 配置保存 base URL、传输安全确认和校验时间但不保存 token；token 只由 credential 封装读写；依赖版本兼容 Windows 和 Rust 1.77.2。
  - 验证方式: 运行任务 2.1 的相关测试；`cargo check --manifest-path src-tauri/Cargo.toml`。

- [√] 2.3 GREEN: 实现受限 CC Hub HTTP client 与严格上游 DTO/错误映射。
  - 执行模式: AFK
  - 涉及文件: `src-tauri/src/cc_hub/client.rs`, `src-tauri/src/cc_hub/contracts.rs`, `src-tauri/src/cc_hub/contracts_tests.rs`
  - 完成标准: client 只接受规范化的配置 origin 和固定相对路径，具有固定请求超时且 TLS 校验未被关闭；DTO 与错误只接受已核验 fixture 字段。
  - 验证方式: `cargo test --manifest-path src-tauri/Cargo.toml cc_hub`；验证契约 fixture 解析和错误脱敏断言。

- [√] 2.4 GREEN: 注册精确 Tauri commands，并让保存连接在 Rust 侧校验成功后才持久化。
  - 执行模式: AFK
  - 涉及文件: `src-tauri/src/cc_hub/commands.rs`, `src-tauri/src/cc_hub/mod.rs`, `src-tauri/src/lib.rs`
  - 完成标准: commands 只覆盖 how.md 所列业务操作；`save_cc_hub_connection` 在写 credential 前完成健康、管理员权限和必需能力校验；`set_provider_enabled` 只提交已核验的最小 patch；错误不含上游 `detail`、token 或明文 key。
  - 验证方式: `cargo test --manifest-path src-tauri/Cargo.toml cc_hub`；审查 command 输入/输出没有通用 URL、header 或 raw body。

- [√] 2.5 REFACTOR: 整理宿主模块边界和共享错误类型，不改变已通过的连接与 DTO 行为。
  - 执行模式: AFK
  - 涉及文件: `src-tauri/src/cc_hub/mod.rs`, `src-tauri/src/cc_hub/client.rs`, `src-tauri/src/cc_hub/contracts.rs`
  - 完成标准: 配置、凭据、HTTP、契约和 commands 单向依赖清晰；不存在重复的认证头或错误解析逻辑。
  - 验证方式: 重跑 Rust 相关测试和 `cargo check --manifest-path src-tauri/Cargo.toml`。

- [?] 2.6 VERIFY: 验证 Windows credential store 的写入、替换和删除行为不会使 token 经由 Tauri 返回给前端。
  - 执行模式: HITL
  - 涉及文件: `src-tauri/src/cc_hub/credentials.rs`, `src-tauri/src/cc_hub/commands.rs`
  - 完成标准: `get_cc_hub_connection_state` 只返回脱敏字段；无效连接不会写入元数据或 credential；删除连接后无法再发起上游管理员请求。
  - 验证方式: 在 Windows `npm run tauri:dev` 中保存、重启、替换、删除测试凭据；检查开发日志和 command 返回值。
## 3. 实现应用壳与连接设置

- [√] 3.1 RED: 为未连接引导、已连接标签导航、连接失败重试和 token 不回显写出组件失败测试，验证 [why.md#需求-建立受保护的-cc-hub-管理连接](why.md#需求-建立受保护的-cc-hub-管理连接)。
  - 执行模式: AFK
  - 涉及文件: `src/App.test.tsx`, `src/features/cc-hub/connection.test.tsx`, `src/features/cc-hub/api.test.ts`
  - 完成标准: 测试覆盖初始无连接、成功配置、失败连接不显示已配置状态、错误状态与移除连接；在 RED 阶段因组件/调用尚未实现而失败。
  - 验证方式: `npm test -- src/App.test.tsx src/features/cc-hub/connection.test.tsx src/features/cc-hub/api.test.ts`，记录预期失败原因。

- [√] 3.2 GREEN: 实现 Tauri invoke 客户端、连接状态 hook 和连接设置组件。
  - 执行模式: AFK
  - 涉及文件: `src/features/cc-hub/api.ts`, `src/features/cc-hub/useConnection.ts`, `src/features/cc-hub/components/ConnectionSettings.tsx`
  - 完成标准: 前端只在保存时传入 token 和显式的非 HTTPS 确认，随后只消费脱敏状态；失败信息按稳定错误类别显示；连接通过前不加载管理数据。
  - 验证方式: 运行任务 3.1 测试并确认通过。

- [√] 3.3 GREEN: 将初始化欢迎页替换为可访问的桌面应用壳、主标签和连接设置入口。
  - 执行模式: AFK
  - 涉及文件: `src/App.tsx`, `src/App.css`, `src/index.css`
  - 完成标准: 供应商、限额管理、使用详情是可切换的主视图；小窗口下文本不溢出；工具型图标控件有可访问名称和 tooltip。
  - 验证方式: `npm test`、`npm run build`；在 640px 与默认 Tauri 窗口尺寸手工检查布局。

- [√] 3.4 REFACTOR/VERIFY: 整理应用壳状态并验证不存在历史 Hello World 文案、前端 token 存储或直接 CC Hub `fetch`。
  - 执行模式: AFK
  - 涉及文件: `src/App.tsx`, `src/features/cc-hub/api.ts`, `src/App.test.tsx`
  - 完成标准: 新旧界面行为不混杂；所有前端请求均为 Tauri `invoke`；相关组件测试通过。
  - 验证方式: `rg -n "localStorage|sessionStorage|fetch\\(" src`；`npm test`；`npm run lint`。

## 4. 实现供应商实例页面

- [√] 4.1 RED: 为 provider 查询参数、状态筛选、今日调用显示和开关失败回滚写出失败测试，验证 [why.md#需求-查看和控制供应商实例](why.md#需求-查看和控制供应商实例)。
  - 执行模式: AFK
  - 涉及文件: `src/features/cc-hub/normalizers.test.ts`, `src/features/cc-hub/ProviderView.test.tsx`, `tests/fixtures/cc-hub/providers-statistics.json`
  - 完成标准: 测试分别验证服务端 `q/providerType`、本地 enabled 筛选、今日调用的已确认字段映射、pending 锁定和失败回滚；实现前测试失败。
  - 验证方式: `npm test -- src/features/cc-hub/normalizers.test.ts src/features/cc-hub/ProviderView.test.tsx`。

- [√] 4.2 GREEN: 实现 provider DTO、查询 hook 和单项启停调用。
  - 执行模式: AFK
  - 涉及文件: `src/features/cc-hub/types.ts`, `src/features/cc-hub/normalizers.ts`, `src/features/cc-hub/useProviders.ts`
  - 完成标准: DTO 只包含已核验字段；名称搜索防抖；同一行开关不会重复提交；成功后以服务端 `isEnabled` 为准。
  - 验证方式: 运行任务 4.1 的测试并确认通过。

- [√] 4.3 GREEN: 实现供应商表、筛选控件和行级状态。
  - 执行模式: AFK
  - 涉及文件: `src/features/cc-hub/components/ProviderView.tsx`, `src/features/cc-hub/components/ProviderTable.tsx`, `src/App.css`
  - 完成标准: 可查看多个 provider、按名称/类型/状态筛选、切换单行开关并显示今日调用次数；加载、空态、错误和字段不可用状态互不混淆。
  - 验证方式: `npm test`；在目标测试 Hub 中手工筛选并完成一次可恢复的单行启停。

- [√] 4.4 REFACTOR/VERIFY: 清理 provider 显示与写操作的重复状态逻辑并验证上游操作结果。
  - 执行模式: AFK
  - 涉及文件: `src/features/cc-hub/useProviders.ts`, `src/features/cc-hub/components/ProviderTable.tsx`, `src/features/cc-hub/ProviderView.test.tsx`
  - 完成标准: 只有一条状态更新路径；网络错误不遗留乐观状态；今日调用不是由当前日志页长度计算。
  - 验证方式: `npm test`；检查目标实例的返回状态和应用行状态一致。

## 5. 实现限额管理页面

- [√] 5.1 RED: 为额度桶映射、剩余额度、无限额/未知/超额和分页错误状态写出失败测试，验证 [why.md#需求-查看限额用户的额度情况](why.md#需求-查看限额用户的额度情况)。
  - 执行模式: AFK
  - 涉及文件: `src/features/cc-hub/quota.test.ts`, `src/features/cc-hub/QuotaView.test.tsx`, `tests/fixtures/cc-hub/limit-usage-all.json`
  - 完成标准: 测试要求 `limitTotal`、`limitDaily`、`limitMonthly` 正确生成五列；未经确认的 limit 语义不会被显示为“不限”；实现前测试失败。
  - 验证方式: `npm test -- src/features/cc-hub/quota.test.ts src/features/cc-hub/QuotaView.test.tsx`。

- [√] 5.2 GREEN: 实现用户额度分页加载、批量优化选择和有界回退并发。
  - 执行模式: AFK
  - 涉及文件: `src-tauri/src/cc_hub/contracts.rs`, `src-tauri/src/cc_hub/commands.rs`, `src/features/cc-hub/useQuotaUsers.ts`
  - 完成标准: 先加载 `users` 分页；只有已核验完整的 batch response 才走批量；回退路径最多同时四个 `limit-usage:all` 请求，且筛选/分页变化会使旧结果失效。
  - 验证方式: Rust fixture 测试、前端额度测试和网络 mock 并发断言。

- [√] 5.3 GREEN: 实现限额用户表、分页和显示格式。
  - 执行模式: AFK
  - 涉及文件: `src/features/cc-hub/components/QuotaView.tsx`, `src/features/cc-hub/components/QuotaTable.tsx`, `src/App.css`
  - 完成标准: 每行显示已用额度、总额度、今日使用额度、当月使用额度、剩余额度；默认页大小为 25；不会提供额度编辑或重置入口。
  - 验证方式: 运行任务 5.1 测试；在测试 Hub 上与 `limit-usage:all` 原始脱敏响应逐字段抽样比对。

- [√] 5.4 REFACTOR/VERIFY: 整理额度缓存、结果失效和单位格式化逻辑。
  - 执行模式: AFK
  - 涉及文件: `src/features/cc-hub/useQuotaUsers.ts`, `src/features/cc-hub/normalizers.ts`, `src/features/cc-hub/quota.test.ts`
  - 完成标准: 当前页缓存至多 30 秒；手动刷新和条件变化正确失效；服务端时区/显示设置缺失时采用保守显示而不换算。
  - 验证方式: `npm test`；手动切换筛选、分页和刷新，确认不显示陈旧页数据。

## 6. 实现使用详情与定时刷新

- [√] 6.1 RED: 为使用记录过滤、稳定键、可见性轮询、请求结果失效和丢弃陈旧响应写出失败测试，验证 [why.md#需求-查看持续刷新的使用详情](why.md#需求-查看持续刷新的使用详情)。
  - 执行模式: AFK
  - 涉及文件: `src/features/cc-hub/useUsageLogs.test.ts`, `src/features/cc-hub/UsageView.test.tsx`, `tests/fixtures/cc-hub/usage-logs.json`
  - 完成标准: fake timer 测试证明最新页可见时每 10 秒刷新、存在在途请求时不重叠、离开页面/窗口隐藏/筛选变化时停止后续调度并使结果失效，且旧响应不能覆盖新条件。
  - 验证方式: `npm test -- src/features/cc-hub/useUsageLogs.test.ts src/features/cc-hub/UsageView.test.tsx`。

- [√] 6.2 GREEN: 实现 usage logs DTO、筛选项读取和轮询 hook。
  - 执行模式: AFK
  - 涉及文件: `src-tauri/src/cc_hub/contracts.rs`, `src/features/cc-hub/useUsageLogs.ts`, `src/features/cc-hub/useUsageFilterOptions.ts`
  - 完成标准: 只发出契约已确认的 query；默认按服务器时区请求今天的最新页；日志 ID 或经过核验的组合键可稳定去重；错误不会泄露上游原始内容。
  - 验证方式: 运行任务 6.1 测试；Rust usage log fixture 测试通过。

- [√] 6.3 GREEN: 实现使用详情表、分页、手动刷新、自动刷新开关和刷新时间状态。
  - 执行模式: AFK
  - 涉及文件: `src/features/cc-hub/components/UsageView.tsx`, `src/features/cc-hub/components/UsageTable.tsx`, `src/App.css`
  - 完成标准: 页面可显示当前使用记录、已确认筛选和分页；只有最新页的自动刷新可用；历史页不会被后台轮询意外替换。
  - 验证方式: 运行任务 6.1 测试；在测试 Hub 产生或等待新记录后观察一次刷新更新。

- [√] 6.4 REFACTOR/VERIFY: 统一三类页面的结果失效、错误和刷新状态模型并验证没有 N+1 日志补查。
  - 执行模式: AFK
  - 涉及文件: `src/features/cc-hub/useUsageLogs.ts`, `src/features/cc-hub/api.ts`, `src/features/cc-hub/UsageView.test.tsx`
  - 完成标准: 轮询生命周期集中且可测；日志渲染只使用行字段或已有名称映射；组件卸载后不存在 pending state update。
  - 验证方式: `npm test`；浏览器测试 mock 断言；Tauri 开发模式手工检查刷新。

## 7. 安全检查、知识库同步与交付验证

- [√] 7.1 执行安全检查，重点核对管理员令牌、CSP、TLS、固定 endpoint 和 provider 写操作范围。
  - 执行模式: AFK
  - 涉及文件: `src-tauri/src/cc_hub/**`, `src/features/cc-hub/**`, `src-tauri/tauri.conf.json`
  - 完成标准: 无 token 回显、前端持久化或测试明文；无通用请求代理；没有放宽 CSP 或禁用 TLS；仅单 provider 的 `isEnabled` PATCH 能写上游。
  - 验证方式: `git diff --check`；审查 Rust command 清单、凭据封装和前端 API 层；检查 fixture 与日志输出。

- [√] 7.2 更新 CC Hub 管理控制台的模块知识库和索引，并仅在运行时契约确有变化时修订外部 API 手册。
  - 执行模式: AFK
  - 涉及文件: `helloagents/wiki/modules/cc-hub-admin-console.md`, `helloagents/wiki/overview.md`, `helloagents/wiki/external/claude-code-hub-api.md`
  - 完成标准: 模块职责、连接安全边界、用户可见场景、上游 endpoint 映射和已确认 schema 事实与实现一致；不把 token 或真实用户数据写入文档。
  - 验证方式: 只读对照实现、契约 fixture 和 how.md。

- [√] 7.3 VERIFY: 执行自动化质量门并记录 TDD 证据。
  - 执行模式: AFK
  - 涉及文件: `src/**/*.test.tsx`, `src/**/*.test.ts`, `src-tauri/src/cc_hub/**/*_tests.rs`
  - 完成标准: 新增可观察行为均有 RED/GREEN/REFACTOR/VERIFY 证据；无阻断性测试、类型、lint 或 Rust 编译错误。
  - 验证方式: `npm test`；`npm run lint`；`npm run build`；`cargo test --manifest-path src-tauri/Cargo.toml`；`cargo check --manifest-path src-tauri/Cargo.toml`。

- [?] 7.4 HITL: 在 Windows 与非生产 CC Hub 环境完成端到端验收。
  - 执行模式: HITL
  - 涉及文件: `helloagents/plan/202608100919_cc-hub-admin-console/task.md`
  - 完成标准: 可保存/移除连接；provider 筛选和一次可恢复开关成功；限额五列与上游抽样一致；使用详情自动刷新一次且停止条件生效；管理员凭据未进入日志或版本库。
  - 验证方式: `npm run tauri:dev` 手工验收；随后执行 `npm run tauri:build` 或 Windows CI 打包验证。
