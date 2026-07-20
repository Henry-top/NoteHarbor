import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  FileText,
  FileType2,
  FolderOpen,
  Link2,
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
    title: "选择喜欢的编辑方式",
    description: "Markdown 原文、即时渲染和左右分栏共用同一份内容，可以随时切换。",
    icon: BookOpen,
    points: [
      { icon: FileText, text: "输入内容后自动保存，无需手动操作" },
      { icon: BookOpen, text: "标题、表格、数学公式和图表都能预览" }
    ]
  },
  {
    eyebrow: "第三步",
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
    title: "文档、帮助和数据安全",
    description: "Word 文档可以保留原文件并在软件内预览。需要帮助时，随时点击右上角问号或按 F1。",
    icon: FileType2,
    points: [
      { icon: FileType2, text: "DOCX 本地预览，原文件不会转换" },
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
