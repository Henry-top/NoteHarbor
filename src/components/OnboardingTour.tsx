import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  FileDown,
  FileText,
  FileType2,
  FolderOpen,
  Link2,
  Paperclip,
  Search,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { useEffect, useState } from "react";

const steps = [
  {
    eyebrow: "欢迎来到墨岛笔记",
    title: "你的文字，停泊在自己手中",
    description: "墨岛笔记当前以本地文件为中心，本地版无需账户，也不会把笔记上传到网络。",
    icon: Sparkles,
    points: [
      { icon: ShieldCheck, text: "内容保存在你选择的本地文件夹" },
      { icon: FileText, text: "使用标准 Markdown 文件，不锁定数据" }
    ]
  },
  {
    eyebrow: "第一步",
    title: "添加一个资料库",
    description: "资料库就是存放笔记的普通文件夹。你可以同时添加多个资料库。",
    icon: FolderOpen,
    points: [
      { icon: FolderOpen, text: "点击左侧“资料库”旁的加号选择文件夹" },
      { icon: ShieldCheck, text: "移除资料库不会删除文件夹中的内容" }
    ]
  },
  {
    eyebrow: "第二步",
    title: "用 Markdown 或 TXT 记录",
    description: "Markdown 和 TXT 都能自动保存，也能在原文、即时渲染和左右分栏之间随时切换。",
    icon: BookOpen,
    points: [
      { icon: FileText, text: "点击编辑区顶部的笔记名即可直接重命名" },
      { icon: BookOpen, text: "TXT 保留 .txt，不写入 YAML 或标签" }
    ]
  },
  {
    eyebrow: "第三步",
    title: "拖到哪里，就整理到哪里",
    description: "从访达或文件资源管理器拖入文件，落点会决定它成为资料库文件还是当前笔记的附件。",
    icon: FileDown,
    points: [
      { icon: FolderOpen, text: "拖到资料库或文件夹：导入为正式文件" },
      { icon: Paperclip, text: "拖到编辑器：插入文字或建立附件链接" }
    ]
  },
  {
    eyebrow: "第四步",
    title: "在软件内阅读常用文档",
    description: "PDF、DOCX 和普通文件都保留原始格式，需要时仍可交给本地默认软件打开。",
    icon: FileType2,
    points: [
      { icon: FileType2, text: "PDF 支持连续翻页、缩放、跳页和查找" },
      { icon: FileType2, text: "DOCX 本地预览，外部原文件不会转换" }
    ]
  },
  {
    eyebrow: "第五步",
    title: "链接并快速找到笔记",
    description: "复制笔记链接并粘贴到其他笔记，即可建立关联；全局搜索可以跨资料库查找。",
    icon: Link2,
    points: [
      { icon: Link2, text: "右键笔记，选择“复制笔记链接”" },
      { icon: Search, text: "使用搜索按钮或快捷键查找全部内容" }
    ]
  },
  {
    eyebrow: "最后一步",
    title: "整理文件，也保留掌控",
    description: "附件页能查看实际位置和引用数量；需要更多说明时，点击右上角问号或按 F1。",
    icon: ShieldCheck,
    points: [
      { icon: Paperclip, text: "附件可转为资料库文件，不移动文件、不破坏链接" },
      { icon: BookOpen, text: "使用帮助可搜索，也能重新打开本引导" }
    ]
  }
];

export function OnboardingTour({
  open,
  onFinish
}: {
  open: boolean;
  onFinish: () => void;
}) {
  const [index, setIndex] = useState(0);
  const step = steps[index];

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  if (!open) return null;
  const Icon = step.icon;
  const last = index === steps.length - 1;

  return (
    <div className="overlay onboarding-overlay">
      <section className="onboarding-tour" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <div className="onboarding-visual" aria-hidden="true">
          <span className="onboarding-orbit orbit-one" />
          <span className="onboarding-orbit orbit-two" />
          <div className="onboarding-icon"><Icon size={46} /></div>
          <div className="onboarding-brand-mark"><span /></div>
        </div>
        <div className="onboarding-content">
          <span className="onboarding-eyebrow">{step.eyebrow}</span>
          <h2 id="onboarding-title">{step.title}</h2>
          <p>{step.description}</p>
          <div className="onboarding-points">
            {step.points.map(({ icon: PointIcon, text }) => (
              <div key={text}>
                <span><PointIcon size={17} /></span>
                <strong>{text}</strong>
              </div>
            ))}
          </div>
          <div className="onboarding-progress" aria-label={`第 ${index + 1} 步，共 ${steps.length} 步`}>
            {steps.map((item, itemIndex) => (
              <span className={itemIndex === index ? "active" : itemIndex < index ? "done" : ""} key={item.title} />
            ))}
          </div>
          <footer>
            <button className="onboarding-skip" onClick={onFinish}>{last ? "稍后再说" : "跳过引导"}</button>
            <div>
              {index > 0 && (
                <button onClick={() => setIndex((value) => value - 1)}>
                  <ArrowLeft size={15} />上一步
                </button>
              )}
              <button
                className="primary"
                onClick={() => last ? onFinish() : setIndex((value) => value + 1)}
              >
                {last ? "开始使用" : "下一步"}
                {!last && <ArrowRight size={15} />}
              </button>
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
}
