# Changelog

本文件记录项目所有重要变更。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.1.1] - 2026-08-11

### 新增
- 界面全面中文化：连接设置、服务商、额度管理、用量明细各视图的界面文案、状态提示与 API 错误信息改为简体中文（含页面标题与窗口标题）。
- 界面美化：重写全局样式为现代卡片化设计——圆角卡片与柔和阴影、渐变侧边栏、胶囊导航、圆角表格与开关、聚焦光环、中文友好字体栈；保留全部类名与 DOM 结构，不影响既有逻辑。
- 初始化本工作区知识库骨架（`helloagents/`）。
- 新增 `wiki/external/claude-code-hub-api.md`：Claude Code Hub（ding113/claude-code-hub，v0.9.2）管理员可用 REST API 手册，含认证/层级/错误格式、`/api/v1/*`、`/api/admin/*`、legacy `/api/actions/*`、公共状态/健康端点与返回示例。
- 新增 `wiki/external/sub2api-api.md`：Sub2API（Wei-Shaw/sub2api）管理员可用 REST API 手册，含认证/权限模型、`/api/v1/admin/*` 全部管理端点类别（用户/分组/账号/代理/渠道/设置/备份/系统/订阅/支付/卡密/优惠码/公告/用量/仪表盘/Ops）与返回示例。
- 新增 `wiki/glossary.md` 领域语言表，收录两个外部工具的核心术语（provider、vendor、endpoint、circuit breaker、Admin API Key、step-up、group、account、channel、redeem code、promo code、Ops 等）。

### 变更
- 版本号提升至 0.1.1（package.json、tauri.conf.json、Cargo.toml、Cargo.lock）。

### 测试
- 同步更新依赖界面文案的测试断言；`npm run test`（24 用例）、`npm run build`、`npm run lint` 全部通过。
