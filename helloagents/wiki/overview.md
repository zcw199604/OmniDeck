# OmniDeck 知识库

> 本文件包含项目级别的核心信息。详细的模块文档见 `modules/` 目录，外部工具 API 参考见 `external/` 目录。

---

## 1. 项目概述

### 目标与背景
OmniDeck 是一个 Tauri 桌面应用项目（前端 Vite + TypeScript，桌面壳 Tauri/Rust），当前处于初始化阶段（v0.x）。本知识库同时承担本项目自身约定与外部工具 API 参考的记录职责。

### 范围
- **范围内:** OmniDeck 桌面应用开发相关约定；外部工具（Claude Code Hub、Sub2API）管理员 API 参考
- **范围外:** 外部工具的源码维护；本知识库不收录与项目无关的个人笔记

---

## 2. 内容索引

| 文档 | 说明 |
|---|---|
| [外部工具：Claude Code Hub 管理员 API](external/claude-code-hub-api.md) | CC Hub（Claude Code 网关管理平台）管理员可用 REST API 手册 |
| [模块：CC Hub 管理控制台](modules/cc-hub-admin-console.md) | OmniDeck 内的单实例 CC Hub provider、额度和 usage 管理视图 |
| [外部工具：Sub2API 管理员 API](external/sub2api-api.md) | Sub2API（AI API 网关管理平台）管理员可用 REST API 手册 |
| [API 手册](api.md) | 本项目自身 API（如有） |
| [数据模型](data.md) | 本项目数据模型（如有） |
| [领域语言](glossary.md) | 领域术语表 |
| [架构设计](arch.md) | 架构设计（如有） |
| [技术约定](../project.md) | 项目技术约定 |

---

## 3. 快速链接
- [技术约定](../project.md)
- [变更历史](../history/index.md)
