import {
  BookOpen,
  FileDown,
  FileText,
  FileType2,
  Keyboard,
  Library,
  Link2,
  Paperclip,
  PanelsTopLeft,
  Search,
  ShieldCheck,
  Sparkles,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { filterHelpTopics, platformHelpTopics } from "../lib/help";

const topicIcons = {
  "quick-start": Sparkles,
  writing: FileText,
  links: Link2,
  organize: Library,
  word: FileType2,
  "drag-import": FileDown,
  attachments: Paperclip,
  pdf: PanelsTopLeft,
  files: ShieldCheck,
  shortcuts: Keyboard
} as const;

export function HelpCenter({
  open,
  platform,
  onClose,
  onStartTour
}: {
  open: boolean;
  platform: string;
  onClose: () => void;
  onStartTour: () => void;
}) {
  const topics = useMemo(() => platformHelpTopics(platform), [platform]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("quick-start");
  const filtered = filterHelpTopics(topics, query);
  const selected = filtered.find((topic) => topic.id === selectedId) || filtered[0];

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedId("quick-start");
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="overlay help-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="help-center" role="dialog" aria-modal="true" aria-labelledby="help-center-title">
        <header className="help-header">
          <div className="help-title">
            <span><BookOpen size={20} /></span>
            <div>
              <h2 id="help-center-title">使用帮助</h2>
              <p>墨岛笔记当前本地版操作指南</p>
            </div>
          </div>
          <label className="help-search">
            <Search size={16} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索功能或问题…"
            />
          </label>
          <button className="icon-button" onClick={onClose} aria-label="关闭使用帮助"><X size={18} /></button>
        </header>

        <div className="help-layout">
          <nav className="help-nav" aria-label="帮助主题">
            {filtered.map((topic) => {
              const Icon = topicIcons[topic.id as keyof typeof topicIcons] || BookOpen;
              return (
                <button
                  className={selected?.id === topic.id ? "active" : ""}
                  key={topic.id}
                  onClick={() => setSelectedId(topic.id)}
                >
                  <Icon size={16} />
                  <span>{topic.title}</span>
                </button>
              );
            })}
            {filtered.length === 0 && <p>没有找到相关说明</p>}
            <div className="help-tour-card">
              <Sparkles size={17} />
              <strong>想重新熟悉一遍？</strong>
              <span>再次查看七步新手引导。</span>
              <button onClick={onStartTour}>重新开始引导</button>
            </div>
          </nav>

          <article className="help-content">
            {selected ? (
              <>
                <div className="help-topic-heading">
                  <span>{selected.title}</span>
                  <h3>{selected.summary}</h3>
                </div>
                <ol className="help-steps">
                  {selected.steps.map((step, index) => (
                    <li key={step}>
                      <span>{index + 1}</span>
                      <p>{step}</p>
                    </li>
                  ))}
                </ol>
                {selected.tips && selected.tips.length > 0 && (
                  <section className="help-tips">
                    <h4>小提示</h4>
                    {selected.tips.map((tip) => <p key={tip}>{tip}</p>)}
                  </section>
                )}
              </>
            ) : (
              <div className="help-no-results">
                <Search size={28} />
                <h3>没有找到“{query}”</h3>
                <p>可以尝试搜索“拖拽”“附件”“PDF”“Word”或“快捷键”。</p>
              </div>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
