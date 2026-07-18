# 构建墨岛笔记

## 环境

- macOS 12 或更高版本，或 Windows 10/11
- Node.js 24
- pnpm 11.9
- Rust 1.97.1（项目中的 `rust-toolchain.toml` 会固定版本）
- macOS：Xcode Command Line Tools
- Windows：Microsoft C++ Build Tools 与 WebView2

## 本地开发

```bash
pnpm install --frozen-lockfile
pnpm desktop:dev
```

仅预览界面时运行 `pnpm dev`。浏览器预览使用内置示例资料，不会访问真实文件。

## 打包

macOS：

```bash
pnpm tauri build --bundles app,dmg
```

Windows：

```powershell
pnpm tauri build --bundles nsis,msi
```

产物位于 `src-tauri/target/release/bundle/`。当前版本使用本机临时签名，公开分发前需配置 Apple Developer ID 公证和 Windows 代码签名证书。

## 数据目录

Markdown 和 `assets/` 位于用户选择的资料库。SQLite 索引、历史快照与应用偏好位于操作系统的应用数据目录：

- macOS：`~/Library/Application Support/com.noteharbor.desktop/`
- Windows：`%APPDATA%/com.noteharbor.desktop/`

删除应用数据目录不会删除资料库中的 Markdown 文件，但会清除索引、收藏/置顶状态和历史快照。
