# Changelog

本文件记录项目所有重要变更。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增
- 初始化本工作区知识库骨架（`helloagents/`）。
- 新增 `wiki/external/claude-code-hub-api.md`：Claude Code Hub（ding113/claude-code-hub，v0.9.2）管理员可用 REST API 手册，含认证/层级/错误格式、`/api/v1/*`、`/api/admin/*`、legacy `/api/actions/*`、公共状态/健康端点与返回示例。
- 新增 `wiki/external/sub2api-api.md`：Sub2API（Wei-Shaw/sub2api）管理员可用 REST API 手册，含认证/权限模型、`/api/v1/admin/*` 全部管理端点类别（用户/分组/账号/代理/渠道/设置/备份/系统/订阅/支付/卡密/优惠码/公告/用量/仪表盘/Ops）与返回示例。
- 新增 `wiki/glossary.md` 领域语言表，收录两个外部工具的核心术语（provider、vendor、endpoint、circuit breaker、Admin API Key、step-up、group、account、channel、redeem code、promo code、Ops 等）。
