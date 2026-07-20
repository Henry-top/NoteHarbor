export interface HelpTopic {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  tips?: string[];
  keywords: string[];
}

export const ONBOARDING_STORAGE_KEY = "noteharbor:onboarding:v2";

export const helpTopics: HelpTopic[] = [
  {
    id: "quick-start",
    title: "快速开始",
    summary: "从添加资料库到写下第一篇笔记。",
    steps: [
      "点击左侧“资料库”旁的加号，选择一个本地文件夹。这个文件夹就是资料库。",
      "点击左下角“新建笔记”，输入内容后会自动保存，不需要手动点击保存。",
      "点击编辑区顶部、“已保存”前面的笔记名，可以直接重命名；不需要手动输入 .md。",
      "需要查找内容时，点击顶部搜索按钮，或使用快捷键打开全局搜索。"
    ],
    tips: [
      "资料库只是普通文件夹，移除资料库不会删除其中的文件。",
      "笔记默认保存为标准 .md 文件，可以继续使用其他 Markdown 软件打开。"
    ],
    keywords: ["开始", "资料库", "文件夹", "新建", "保存", "Markdown"]
  },
  {
    id: "writing",
    title: "编辑与预览",
    summary: "了解 Markdown 原文、即时渲染和分栏三种编辑模式。",
    steps: [
      "Markdown 模式完整显示文件原文和格式标记，适合精确编辑。",
      "即时渲染模式会在编辑器中呈现标题、强调等效果，光标进入时仍可编辑语法。",
      "分栏模式左侧编辑、右侧预览，并会跟随编辑位置同步滚动。",
      "TXT 同样支持三种模式、搜索、自动保存和历史，但会保留 .txt，且不会写入 YAML、标签或其他私有格式。"
    ],
    tips: ["编辑内容约 500 毫秒后自动保存。", "外部软件修改同一文件时，墨岛笔记会先询问保留哪个版本。"],
    keywords: ["编辑", "Markdown", "原文", "即时渲染", "分栏", "预览", "图片", "附件", "自动保存"]
  },
  {
    id: "links",
    title: "笔记链接与反向链接",
    summary: "在笔记之间建立可以来回追踪的关联。",
    steps: [
      "在侧栏右键一篇笔记并选择“复制笔记链接”，会复制形如 [[笔记名称]] 的链接。",
      "把链接粘贴到另一篇笔记中，预览时点击它即可跳转到目标笔记。",
      "右侧“反向链接”会列出哪些笔记链接到了当前笔记。",
      "笔记改名或移动时，同一资料库内受影响的链接会自动更新。"
    ],
    tips: ["可以使用 [[目标|显示文字]] 为链接设置别名。", "笔记链接只在当前资料库内解析。"],
    keywords: ["链接", "笔记链接", "双向链接", "反向链接", "引用", "别名", "改名"]
  },
  {
    id: "organize",
    title: "整理与查找",
    summary: "使用搜索、标签、收藏、置顶和每日笔记管理内容。",
    steps: [
      "全局搜索可以查找所有已登记资料库中的 Markdown/TXT 内容以及文档文件名。",
      "右侧面板可以添加标签，也可以查看大纲和历史版本。",
      "收藏适合长期保留的重要内容，置顶适合最近需要频繁打开的内容。",
      "“每日笔记”会在当前资料库中创建以当天日期命名的笔记。"
    ],
    tips: ["侧栏的“最近、置顶、收藏”可以快速过滤内容。", "Markdown 文件可以搜索正文，Word 首版只搜索文件名和路径。"],
    keywords: ["搜索", "标签", "收藏", "置顶", "每日笔记", "大纲", "历史"]
  },
  {
    id: "word",
    title: "Word 文档",
    summary: "导入、预览并与外部原文件保持同步。",
    steps: [
      "点击侧栏“资料库”标题旁的 Word 导入按钮，或在资料库菜单中选择“导入 Word 文档”。",
      "软件会把原文件完整复制到资料库的 documents 文件夹，不会转换或改写原文件。",
      ".docx 可以在软件内预览；旧式 .doc 暂时需要使用本地默认软件打开。",
      "存在外部来源时，墨岛笔记会把外部文件的更新单向同步到资料库副本。"
    ],
    tips: ["删除资料库中的 Word 副本不会删除外部原文件。", "预览只在本地进行，文档不会上传。"],
    keywords: ["Word", "docx", "doc", "导入", "预览", "同步", "原文件", "documents"]
  },
  {
    id: "drag-import",
    title: "拖拽与导入",
    summary: "拖到不同位置，决定文件如何进入资料库。",
    steps: [
      "拖到资料库或侧栏文件夹时，文件会作为正式资料库文件导入该位置。",
      "拖到普通工作区时，文件会导入当前活动资料库的根目录。",
      "拖到 Markdown/TXT 编辑器时，图片、PDF、Word 和普通文件会成为附件并插入相对链接；Markdown/TXT 文件则直接插入其中的文字内容。",
      "拖入文件夹时，确认后会把它登记为新资料库，不复制或移动；文件与文件夹需要分开拖入。"
    ],
    tips: [
      "拖拽时覆盖层会显示真实资料库和目标文件夹，请松手前确认落点。",
      "危险脚本、可执行文件、安装包和超过限制的文件会被拒绝导入。"
    ],
    keywords: ["拖拽", "导入", "访达", "资源管理器", "资料库", "文件夹", "落点", "附件"]
  },
  {
    id: "attachments",
    title: "附件管理",
    summary: "查看附件位置、引用数量，并在不破坏链接的情况下整理文件。",
    steps: [
      "打开 Markdown 或 TXT 笔记，再展开右侧信息面板并选择“附件”。",
      "附件页会列出当前笔记引用的本地文件、实际位置、文件角色和引用它的笔记数量。",
      "选择“转为资料库文件”只会让附件出现在文件树中，不会移动磁盘文件，也不需要改写链接。",
      "确实需要改变目录时使用“移动到……”，软件会创建快照并更新所有受影响笔记中的相对链接。"
    ],
    tips: [
      "assets 只是外部附件的默认存放位置，不等于所有 assets 文件都必须隐藏。",
      "“移除当前引用”只删掉当前笔记中的链接；删除实际文件前会显示引用数量并再次确认。"
    ],
    keywords: ["附件", "assets", "引用", "转为资料库文件", "移动到", "相对路径", "删除文件"]
  },
  {
    id: "pdf",
    title: "PDF 阅读",
    summary: "在正常标签页或临时附件标签页中阅读本地 PDF。",
    steps: [
      "把 PDF 拖到资料库或文件夹，它会作为正式文件显示在侧栏；点击即可在主区域打开。",
      "把 PDF 拖到编辑器，它会作为附件保存；可从右侧“附件”页打开临时预览标签。",
      "预览支持连续分页、50%–200% 缩放、页码跳转、文字选择和文内查找。",
      "需要打印、填写表单或处理复杂 PDF 时，点击“默认软件打开”。"
    ],
    tips: [
      "PDF 预览完全使用本地组件，不会上传文件或访问 CDN。",
      "超过 50MB、损坏或受密码保护的 PDF 会保留文件信息，并引导使用默认软件。"
    ],
    keywords: ["PDF", "预览", "缩放", "跳页", "查找", "临时标签", "默认软件"]
  },
  {
    id: "files",
    title: "文件与数据安全",
    summary: "了解文件位置、删除规则、历史和本地优先原则。",
    steps: [
      "Markdown、TXT、PDF 和 Word 副本始终保存在你选择的资料库中，内容不依赖墨岛笔记数据库。",
      "外部附件默认复制到 assets；资料库内已有文件保留原位置，附件角色只记录在本地索引中。",
      "右键文件夹可以新建笔记或子文件夹、导入、重命名、复制路径、在系统文件管理器中显示或移到废纸篓/回收站。",
      "删除文件会进入系统废纸篓或回收站；移除资料库只取消登记，资料库根目录及 assets/documents 文件夹受到保护。",
      "历史快照和搜索索引保存在系统应用数据目录，不会向资料库写入私有数据库。"
    ],
    tips: ["定期备份资料库文件夹即可备份主要内容。", "未来云同步也会以资料库中的原始文件为基础。"],
    keywords: ["文件", "路径", "删除", "废纸篓", "回收站", "备份", "本地", "隐私", "历史"]
  },
  {
    id: "appearance",
    title: "外观与主题",
    summary: "切换主题、明暗模式和系统通透材质。",
    steps: [
      "点击窗口右上角的调色盘按钮，选择现代克制、温暖纸张或通透玻璃。",
      "现代克制强调清晰和稳定；温暖纸张使用暖色与衬线字体；通透玻璃会显示系统背景材质。",
      "可以跟随系统明暗模式，也可以固定为明亮或深色。",
      "点击外观面板以外的区域、按 Esc，或切换到其他窗口，面板会自动收起。"
    ],
    tips: [
      "macOS 使用原生通透材质，Windows 11 使用 Mica。",
      "系统开启“减少透明度”后，玻璃主题会自动使用不透明回退，以保证可读性。"
    ],
    keywords: ["外观", "主题", "现代", "纸张", "玻璃", "透明", "明亮", "深色", "Mica"]
  },
  {
    id: "shortcuts",
    title: "快捷键",
    summary: "在 macOS 使用 Command，在 Windows 使用 Control。",
    steps: [
      "{mod}K：打开全局搜索。",
      "{mod}N：在当前资料库中新建笔记。",
      "{mod}\\：显示或隐藏侧栏。",
      "F1：打开使用帮助。",
      "Esc：关闭当前弹窗或菜单。"
    ],
    tips: ["界面中的快捷键会自动按照当前操作系统显示。"],
    keywords: ["快捷键", "Command", "Control", "Ctrl", "搜索", "新建", "侧栏", "F1", "Esc"]
  }
];

export function platformHelpTopics(platform: string): HelpTopic[] {
  const modifier = platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl+";
  return helpTopics.map((topic) => ({
    ...topic,
    steps: topic.steps.map((step) => step.replaceAll("{mod}", modifier))
  }));
}

export function filterHelpTopics(topics: HelpTopic[], query: string): HelpTopic[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return topics;
  return topics
    .map((topic) => {
      const title = topic.title.toLocaleLowerCase();
      const keywords = topic.keywords.join(" ").toLocaleLowerCase();
      const content = [topic.summary, ...topic.steps, ...(topic.tips || [])]
        .join(" ")
        .toLocaleLowerCase();
      const score = title.includes(needle) ? 3 : keywords.includes(needle) ? 2 : content.includes(needle) ? 1 : 0;
      return { topic, score };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((result) => result.topic);
}

export function shouldShowOnboarding(
  storage: Pick<Storage, "getItem"> = localStorage
): boolean {
  return storage.getItem(ONBOARDING_STORAGE_KEY) !== "completed";
}

export function completeOnboarding(
  storage: Pick<Storage, "setItem"> = localStorage
): void {
  storage.setItem(ONBOARDING_STORAGE_KEY, "completed");
}
