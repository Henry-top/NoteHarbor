export interface HelpTopic {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  tips?: string[];
  keywords: string[];
}

export const ONBOARDING_STORAGE_KEY = "noteharbor:onboarding:v1";

export const helpTopics: HelpTopic[] = [
  {
    id: "quick-start",
    title: "快速开始",
    summary: "从添加资料库到写下第一篇笔记。",
    steps: [
      "点击左侧“资料库”旁的加号，选择一个本地文件夹。这个文件夹就是资料库。",
      "点击左下角“新建笔记”，输入内容后会自动保存，不需要手动点击保存。",
      "笔记默认保存为标准 .md 文件，可以继续使用其他 Markdown 软件打开。",
      "需要查找内容时，点击顶部搜索按钮，或使用快捷键打开全局搜索。"
    ],
    tips: [
      "资料库只是普通文件夹，移除资料库不会删除其中的文件。",
      "新建笔记时不需要输入 .md，软件会自动保留扩展名。"
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
      "粘贴或拖入图片时，图片会保存到当前资料库的 assets 文件夹。"
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
      "全局搜索可以查找所有已登记资料库中的 Markdown 内容以及 Word 文件名。",
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
      "点击资料库旁的导入按钮，可以选择一个或多个 .docx 或 .doc 文件。",
      "软件会把原文件完整复制到资料库的 documents 文件夹，不会转换或改写原文件。",
      ".docx 可以在软件内预览；旧式 .doc 暂时需要使用本地默认软件打开。",
      "存在外部来源时，墨岛笔记会把外部文件的更新单向同步到资料库副本。"
    ],
    tips: ["删除资料库中的 Word 副本不会删除外部原文件。", "预览只在本地进行，文档不会上传。"],
    keywords: ["Word", "docx", "doc", "导入", "预览", "同步", "原文件", "documents"]
  },
  {
    id: "files",
    title: "文件与数据安全",
    summary: "了解文件位置、删除规则、历史和本地优先原则。",
    steps: [
      "Markdown 和 Word 副本始终保存在你选择的资料库中，内容不依赖墨岛笔记数据库。",
      "图片和附件统一保存在资料库根目录的 assets 文件夹。",
      "删除文件会进入系统废纸篓或回收站；移除资料库只取消登记。",
      "历史快照和搜索索引保存在系统应用数据目录，不会向资料库写入私有数据库。"
    ],
    tips: ["定期备份资料库文件夹即可备份主要内容。", "未来云同步也会以资料库中的原始文件为基础。"],
    keywords: ["文件", "路径", "删除", "废纸篓", "回收站", "备份", "本地", "隐私", "历史"]
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
