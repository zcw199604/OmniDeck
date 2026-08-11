# 项目技术约定

---

## 技术栈

- OmniDeck 桌面应用：前端 Vite + TypeScript，桌面壳 Tauri/Rust（src/、src-tauri/）。
- 知识库文档主体为 Markdown，编码使用 UTF-8 无 BOM。

---

## 开发约定

- 外部工具 API 参考文档统一存放于 `wiki/external/`，文件命名 `<tool>-api.md`。
- 每个外部 API 文档必须声明：上游仓库、对应版本/commit、整理日期、内容来源。
- 外部 API 端点条目尽量标注来源（上游文件路径:行号 或文档路径），便于对照上游更新。
- 无法确认的请求/返回参数明确标注「未确认」，不猜测。
- 中文自然语言输出；代码标识符、命令、端点路径保持原样。

---

## 错误与日志

- 本知识库记录的两个外部工具错误格式不同：CC Hub 使用 RFC 9457 `application/problem+json`；Sub2API 使用 `{code,message,data}` 统一信封。两者不可混淆。

---

## 测试与流程

- 本知识库当前无代码测试；外部 API 文档的准确性校验依赖对照上游源码抽查。
