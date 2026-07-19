# 墨岛笔记 NoteHarbor

墨岛笔记是一款本地优先的个人笔记与文档应用。Markdown 笔记始终保存为普通 `.md` 文件；Word 文档保留原始格式，应用只在系统数据目录维护搜索索引、偏好设置、历史快照与本机源文件关联。

## 首版能力

- 同时打开多个本地资料库并跨库搜索
- 源码、即时渲染、左右分栏三种编辑模式
- YAML 元数据、标签、收藏、置顶、每日笔记
- 双向链接、反向链接、自动更新改名后的链接
- 图片粘贴与统一 `assets/` 附件目录
- `.docx` 本地预览、`.doc` 系统打开与外部源文件单向镜像
- 自动保存、外部修改冲突保护、本地历史恢复
- GFM、脚注、KaTeX 数学公式、Mermaid 图表、代码高亮
- 现代、纸张、玻璃三套主题与明暗模式

## 开发

需要 Node.js 24、pnpm、Rust stable 和 Tauri 2 的平台依赖。

```bash
pnpm install
pnpm desktop:dev
```

浏览器界面预览：

```bash
pnpm dev
```

测试与打包：

```bash
pnpm test
pnpm build
pnpm desktop:build
```

详细说明见 [使用说明](docs/USER_GUIDE.md)、[构建说明](docs/BUILDING.md)和[测试说明](docs/TESTING.md)。

## 文件兼容

新建笔记使用 YAML 保存稳定 ID、时间和标签；导入的既有 Markdown 不会仅因打开或索引而被改写。Word 文件会原样复制到资料库 `documents/`，不转换成 Markdown。跨资料库搜索不会生成专用跨库链接，确保每个资料库可以独立移动和使用。

当前版本不包含云同步、账户、协作、插件、移动端或知识图谱。
