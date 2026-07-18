import { Clock3, Link2, ListTree, Plus, Tag, X } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "../i18n";
import { extractOutline, splitFrontmatter } from "../lib/markdown";
import type { Backlink, HistoryEntry, NoteDocument } from "../types";

type RightSection = "outline" | "backlinks" | "history";

interface RightPanelProps {
  document: NoteDocument;
  backlinks: Backlink[];
  history: HistoryEntry[];
  onClose: () => void;
  onOpenBacklink: (backlink: Backlink) => void;
  onRestore: (entry: HistoryEntry) => void;
  onUpdateTags: (tags: string[]) => void;
}

export function RightPanel({
  document,
  backlinks,
  history,
  onClose,
  onOpenBacklink,
  onRestore,
  onUpdateTags
}: RightPanelProps) {
  const [section, setSection] = useState<RightSection>("outline");
  const [tagInput, setTagInput] = useState("");
  const outline = extractOutline(document.content);
  const tags = splitFrontmatter(document.content).frontmatter.tags;

  useEffect(() => setTagInput(""), [document.path]);

  const addTag = () => {
    const value = tagInput.trim().replace(/^#/, "");
    if (!value || tags.includes(value)) return;
    onUpdateTags([...tags, value]);
    setTagInput("");
  };

  return (
    <aside className="right-panel">
      <div className="right-panel-header">
        <div className="right-tabs">
          <button className={section === "outline" ? "active" : ""} onClick={() => setSection("outline")} title={t("outline")}>
            <ListTree size={16} />
          </button>
          <button className={section === "backlinks" ? "active" : ""} onClick={() => setSection("backlinks")} title={t("backlinks")}>
            <Link2 size={16} />
            {backlinks.length > 0 && <span>{backlinks.length}</span>}
          </button>
          <button className={section === "history" ? "active" : ""} onClick={() => setSection("history")} title={t("history")}>
            <Clock3 size={16} />
          </button>
        </div>
        <button className="icon-button" onClick={onClose} title={t("close")}><X size={16} /></button>
      </div>

      <div className="tag-editor">
        <div className="panel-label"><Tag size={14} /> {t("tags")}</div>
        <div className="tag-list">
          {tags.map((tag) => (
            <span className="tag-chip" key={tag}>
              {tag}
              <button onClick={() => onUpdateTags(tags.filter((item) => item !== tag))}><X size={11} /></button>
            </span>
          ))}
          <div className="tag-input">
            <Plus size={12} />
            <input
              value={tagInput}
              placeholder={t("addTag")}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addTag();
              }}
              onBlur={addTag}
            />
          </div>
        </div>
      </div>

      <div className="right-panel-content">
        {section === "outline" && (
          <div className="outline-list">
            <div className="panel-label">{t("outline")}</div>
            {outline.length === 0 && <p className="panel-empty">{t("noOutline")}</p>}
            {outline.map((item, index) => (
              <button
                key={`${item.line}:${index}`}
                style={{ paddingLeft: `${12 + (item.level - 1) * 12}px` }}
                onClick={() => {
                  const line = window.document.querySelector(`.cm-line:nth-child(${item.line})`);
                  line?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                {item.text}
              </button>
            ))}
          </div>
        )}

        {section === "backlinks" && (
          <div className="backlink-list">
            <div className="panel-label">{t("backlinks")}</div>
            {backlinks.length === 0 && <p className="panel-empty">{t("noBacklinks")}</p>}
            {backlinks.map((backlink) => (
              <button key={`${backlink.vaultId}:${backlink.path}`} onClick={() => onOpenBacklink(backlink)}>
                <strong>{backlink.title}</strong>
                <span>{backlink.context}</span>
              </button>
            ))}
          </div>
        )}

        {section === "history" && (
          <div className="history-list">
            <div className="panel-label">{t("history")}</div>
            {history.length === 0 && <p className="panel-empty">{t("emptyHistory")}</p>}
            {history.map((entry) => (
              <div className="history-entry" key={entry.id}>
                <div>
                  <strong>{formatHistoryTime(entry.createdAt)}</strong>
                  <span>{formatBytes(entry.byteSize)}</span>
                </div>
                <button onClick={() => onRestore(entry)}>{t("restore")}</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function formatHistoryTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
