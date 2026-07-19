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

Word 导入、源文件监听、`.docx` 预览以及“使用本地默认软件打开”依赖 Tauri 原生能力，必须用 `pnpm desktop:dev` 验证；浏览器预览不能代表这些能力可用。

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

Markdown、`assets/` 和导入的 Word 副本位于用户选择的资料库；Word 副本统一保存在根目录 `documents/`。SQLite 索引、历史快照、应用偏好以及 Word 外部源路径位于操作系统的应用数据目录：

- macOS：`~/Library/Application Support/com.noteharbor.desktop/`
- Windows：`%APPDATA%/com.noteharbor.desktop/`

删除应用数据目录不会删除资料库中的 Markdown、附件或 Word 副本，但会清除索引、收藏/置顶状态、历史快照，以及用于继续单向同步 Word 的外部源路径记录。

## Word 预览资源

`.docx` 由 WebView 中的预览组件使用内存和 Blob URL 渲染，不会在磁盘生成 DOCX 解包目录、HTML、PDF、PNG 或 LibreOffice 配置。关闭预览、切换文件和组件卸载时必须释放 Blob URL 及关联的内存资源。

构建或手工验收若额外使用第三方渲染工具，产物只能放入任务专用临时目录，并在验收结束后删除；这些文件不是墨岛笔记运行时生成的内容。读取、列目录和核对文件是否存在不会损伤磁盘，也不需要为了核验而扫描整个磁盘。
