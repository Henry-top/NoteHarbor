<p align="center">
  <img src="./src/assets/app-icon.svg" width="104" height="104" alt="墨岛笔记图标">
</p>

<h1 align="center">墨岛笔记 NoteHarbor</h1>

<p align="center"><strong>写作应该沉浸，文件应该自由。</strong></p>

<p align="center">
  一个真正本地优先的 Markdown 与文档桌面工作台。<br>
  当前本地版无需登录，打开一个文件夹就能开始，也不会主动上传你的文字。
</p>

<p align="center">
  <img alt="Version 0.3.2" src="https://img.shields.io/badge/version-0.3.2-3f7f99?style=flat-square">
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&logo=tauri&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-TypeScript-3178C6?style=flat-square&logo=react&logoColor=white">
  <img alt="Local first" src="https://img.shields.io/badge/data-local--first-5D876E?style=flat-square">
</p>

<p align="center">
  <a href="../../releases/latest"><strong>下载安装包</strong></a>
  ·
  <a href="./docs/USER_GUIDE.md">使用说明</a>
  ·
  <a href="#本地开发">参与开发</a>
</p>

---

## 你的笔记，不该被困在某个软件里

墨岛笔记直接读写你选择的本地文件夹。每一篇 Markdown 笔记都是普通的 `.md` 文件，图片和文档也按清晰的目录保存。即使有一天不再使用墨岛笔记，你仍然可以用任何编辑器打开、整理和迁移自己的内容。

但“文件自由”不代表要牺牲体验。三种编辑模式、跨资料库搜索、双向链接、自动保存、历史恢复、Word 预览和精心打磨的主题，都已经装进这个安静的桌面工作台。

| 文件始终属于你 | 写作足够顺手 | 笔记与文档共处 |
| --- | --- | --- |
| 标准 Markdown、本地文件夹，不创建专有内容格式 | Markdown 原文、即时渲染、左右分栏随时切换 | Markdown、DOCX 和 DOC 在同一资料库中管理 |
| 当前本地版无需登录，核心编辑功能不依赖网络 | 自动保存、历史快照、冲突保护 | DOCX 本地预览，原始 Word 文件不转换 |

## 不只是“能写 Markdown”

### 写得舒服

- Markdown 原文、即时渲染、左右分栏三种模式，共用同一份内容
- 表格、任务列表、脚注、代码高亮、KaTeX 数学公式和 Mermaid 图表
- 约 500 毫秒防抖自动保存，外部修改时停止覆盖并提示处理
- 现代克制、温暖纸张、通透玻璃三套主题，支持明亮与深色模式

### 找得到，也连得起来

- 同时登记多个本地资料库，一次搜索全部内容
- 使用 `[[笔记链接]]` 和 `[[目标|显示文字]]` 建立关联
- 自动收集反向链接，笔记改名后同步更新本库内引用
- 标签、收藏、置顶、最近笔记、每日笔记和快速新建

### Word 不必先变成 Markdown

- `.docx` 在软件内本地预览，尽量保留页面、图片、表格和页眉页脚
- `.doc` 和 `.docx` 都可以交给 Word、WPS 等系统默认软件打开
- 导入时保留原文件，并在资料库 `documents/` 中保存可备份的镜像
- 外部原文件发生变化后，资料库副本可以继续接收单向同步

### 第一次打开也不会迷路

- 鼠标停留在主要按钮上即可查看功能说明和快捷键
- 按 `F1` 或点击问号，打开完全离线、可搜索的帮助中心
- 五步新手引导快速说明资料库、编辑模式、链接和文档功能
- macOS 使用 Command，Windows 自动映射为 Control

## 资料库就是一个普通文件夹

没有隐藏的内容数据库，也没有必须通过墨岛笔记才能读取的笔记格式。

```text
我的资料库/
├── 欢迎来到墨岛.md
├── 每日记录/
│   └── 2026-07-20.md
├── assets/
│   ├── 20260720-a3f82c.png
│   └── 20260720-f701bd.pdf
└── documents/
    ├── 项目方案.docx
    └── 会议记录.doc
```

- Markdown 文件是笔记内容的唯一真实来源
- 图片与附件统一放在资料库根目录的 `assets/`
- Word 镜像放在 `documents/`，不会被转换或改写
- 搜索索引、偏好设置和历史快照只保存在系统应用数据目录
- 移除资料库不会删除文件；删除内容会进入系统废纸篓或回收站

## 下载与安装

当前版本为 **0.3.2**，安装包可在 [Releases](../../releases/latest) 页面下载：

- Apple 芯片 Mac：下载 `.dmg`，打开后把“墨岛笔记”拖入“应用程序”
- Windows x64：普通用户建议下载 `.exe` 安装程序，也可以使用 `.msi`
- 首版暂未进行代码签名；如果系统阻止首次启动，请确认文件来自本项目的 Releases 页面后按系统提示放行

安装完成后，选择一个本地文件夹作为资料库即可开始写作。

## 当前边界

墨岛笔记目前专注于个人、本地的笔记与文档管理。`0.3.2` 暂不包含账户、云同步、多人协作、插件、移动端和知识图谱。

未来加入云同步后，使用同步服务将需要账号；现有本地资料库和 Markdown 格式不会因此改变。同步功能会建立在稳定笔记 ID 和原始文件之上，不会要求把现有 Markdown 迁移为私有格式。

## 本地开发

需要 Node.js 24、pnpm、Rust stable，以及 Tauri 2 对应平台的系统依赖。

```bash
pnpm install
pnpm desktop:dev
```

浏览器中预览界面：

```bash
pnpm dev
```

运行测试与构建：

```bash
pnpm test
pnpm build
pnpm desktop:build
```

更多资料：

- [使用说明](./docs/USER_GUIDE.md)
- [构建说明](./docs/BUILDING.md)
- [测试说明](./docs/TESTING.md)

---

<p align="center">
  <strong>让灵感停泊，让文件自由。</strong><br>
  墨岛笔记 · NoteHarbor
</p>
