# 领域语言

本文件记录项目内稳定使用的业务术语、缩写、角色、状态、流程名和禁用叫法。命名、需求描述、测试名称和文档应优先使用本表术语。

| 术语 | 定义 | 同义词/禁用叫法 | 适用模块 | 状态 | 来源 |
|------|------|----------------|----------|------|------|
| provider | 上游模型供应商实例（CC Hub 中承载上游 API 凭据与调度权重的实体） | 渠道(channel) | claude-code-hub-api | ✅已确认 | CC Hub 源码 |
| vendor | 供应商品牌实体（CC Hub 中 provider 的品牌聚合，下挂 endpoint） | - | claude-code-hub-api | ✅已确认 | CC Hub 源码 |
| endpoint | 供应商的具体 API 端点（vendor 下的可测活单元） | - | claude-code-hub-api | ✅已确认 | CC Hub 源码 |
| circuit breaker | 熔断器（provider/endpoint 连续失败后的自动熔断机制） | 熔断 | claude-code-hub-api | ✅已确认 | CC Hub 源码 |
| AuthTier | CC Hub v1 管理 API 的访问层级（public/read/admin） | - | claude-code-hub-api | ✅已确认 | CC Hub 文档 |
| ADMIN_TOKEN | CC Hub 管理员令牌，Bearer 携带即视为 admin | - | claude-code-hub-api | ✅已确认 | CC Hub 文档 |
| Admin API Key | Sub2API 的管理员静态密钥（`admin-<64hex>`，`x-api-key` 头携带） | - | sub2api-api | ✅已确认 | Sub2API 源码 |
| step-up | Sub2API 对敏感操作的二次 2FA 门控（TOTP） | 二次验证 | sub2api-api | ✅已确认 | Sub2API 源码 |
| group | 模型分组（Sub2API 中按模型/平台聚合账号与定价的单位；CC Hub 中 provider 分组） | - | sub2api-api / claude-code-hub-api | ✅已确认 | 上游源码 |
| account | Sub2API 中的上游供应商账号（Anthropic/OpenAI/Gemini 等） | 上游账号 | sub2api-api | ✅已确认 | Sub2API 源码 |
| channel | Sub2API 的计费渠道实体（定义对外模型定价） | - | sub2api-api | ✅已确认 | Sub2API 源码 |
| redeem code | 卡密/兑换码（Sub2API 用于发放余额/并发/订阅） | 兑换码 | sub2api-api | ✅已确认 | Sub2API 源码 |
| promo code | 优惠码（Sub2API 注册/充值赠送余额） | - | sub2api-api | ✅已确认 | Sub2API 源码 |
| Ops | 运维监控（Sub2API 的运维面板/实时监控模块） | - | sub2api-api | ✅已确认 | Sub2API 源码 |
| root 角色 | 不存在的角色：Sub2API 仅有 admin/user 两种角色 | 禁用: root | sub2api-api | ✅已确认 | Sub2API 源码（测试拒绝） |

## 维护规则

- 新领域、新模块或重大功能设计前，先读取本文件。
- 用户确认的新术语优先写入本文件后再进入方案包。
- 待确认术语不得强制用于代码命名。
- 如果代码事实与术语表冲突，先依据代码事实更新术语表。
