# OmniDeck

适用于 Windows 的本地集成控制台。项目使用 **Tauri 2 + React + TypeScript + Rust** 构建，目前提供基础 Hello World 界面。

## 开发环境

- Node.js 22 或更高版本
- Rust stable（Windows 上请安装 `x86_64-pc-windows-msvc` 工具链）
- Windows 开发/打包时需要 [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) 与 WebView2 Runtime

## 本地运行

```bash
npm install
npm run tauri:dev
```

## 验证与构建

```bash
npm test
npm run lint
npm run build
npm run tauri:build
```

`npm run tauri:build` 在 Windows 上会生成 NSIS (`.exe`) 和 MSI (`.msi`) 安装包。

## CI 打包

`.github/workflows/windows-package.yml` 会在推送到 `main` 或手动触发时，在 GitHub-hosted Windows runner 上构建安装包，并将其作为 Actions artifact 上传，供开发验证使用。

## 下载与发布

面向用户的安装包发布在仓库的 [Releases](https://github.com/zcw199604/OmniDeck/releases) 页面，可直接下载 NSIS (`.exe`) 或 MSI (`.msi`) 安装程序。

维护者为发布版本，确认 `main` 已包含待发布内容后创建并推送以 `v` 开头的版本标签：

```bash
git tag v0.1.0
git push origin v0.1.0
```

标签工作流会先构建 Windows 安装包，再自动创建同名 GitHub Release 并上传两个安装程序。发布版本号应同时更新 `package.json` 和 `src-tauri/tauri.conf.json`。
