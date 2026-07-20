import { Clock3, Copy, ExternalLink, FileSearch, FolderInput, Link2, Link2Off, ListTree, Paperclip, Plus, Tag, Trash2, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "../i18n";
import { extractOutline, splitFrontmatter } from "../lib/markdown";
import type { Backlink, FileReference, HistoryEntry, NoteDocument } from "../types";

type RightSection = "outline" | "backlinks" | "attachments" | "history";

interface RightPanelProps {
  document: NoteDocument;
  backlinks: Backlink[];
  history: HistoryEntry[];
  fileReferences: FileReference[];
  onClose: () => void;
  onOpenBacklink: (backlink: Backlink) => void;
  onRestore: (entry: HistoryEntry) => void;
  onUpdateTags: (tags: string[]) => void;
  onOpenAttachment: (reference: FileReference) => void;
  onRevealAttachment: (reference: FileReference) => void;
  onPromoteAttachment: (reference: FileReference) => void;
  onMoveAttachment: (reference: FileReference) => void;
  onCopyAttachmentPath: (reference: FileReference) => void;
  onRemoveReference: (reference: FileReference) => void;
  onDeleteAttachment: (reference: FileReference) => void;
}

export function RightPanel({
  document,
  backlinks,
  history,
  fileReferences,
  onClose,
  onOpenBacklink,
  onRestore,
  onUpdateTags,
  onOpenAttachment,
  onRevealAttachment,
  onPromoteAttachment,
  onMoveAttachment,
  onCopyAttachmentPath,
  onRemoveReference,
  onDeleteAttachment
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
          <button className={section === "outline" ? "active" : ""} onClick={() => setSection("outline")} title="大纲：按标题快速浏览当前笔记">
            <ListTree size={16} />
          </button>
          <button className={section === "backlinks" ? "active" : ""} onClick={() => setSection("backlinks")} title="反向链接：查看哪些笔记链接到这里">
            <Link2 size={16} />
            {backlinks.length > 0 && <span>{backlinks.length}</span>}
          </button>
          <button className={section === "attachments" ? "active" : ""} onClick={() => setSection("attachments")} title="附件：查看当前笔记引用的本地文件">
            <Paperclip size={16} />
            {fileReferences.length > 0 && <span>{fileReferences.length}</span>}
          </button>
          <button className={section === "history" ? "active" : ""} onClick={() => setSection("history")} title="历史版本：查看并恢复自动快照">
            <Clock3 size={16} />
          </button>
        </div>
        <button className="icon-button" onClick={onClose} title={t("close")}><X size={16} /></button>
      </div>

      {document.kind === "markdown" && <div className="tag-editor">
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
      </div>}

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

        {section === "attachments" && (
          <div className="attachment-list">
            <div className="panel-label">附件</div>
            {fileReferences.length === 0 && <p className="panel-empty">当前笔记没有引用本地文件</p>}
            {fileReferences.map((reference) => (
              <article key={`${reference.targetPath}:${reference.rawTarget}`}>
                <div>
                  <strong>{reference.targetPath.split("/").at(-1)}</strong>
                  <span>{reference.targetPath}</span>
                  <small>
                    {reference.role === "attachment" ? "附件" : "资料库文件"}
                    {" · "}被 {reference.referenceCount} 篇笔记引用
                  </small>
                </div>
                <div className="attachment-actions">
                  <button title="预览或打开" onClick={() => onOpenAttachment(reference)}><ExternalLink size={14} /></button>
                  <button title="在文件管理器中显示" onClick={() => onRevealAttachment(reference)}><FileSearch size={14} /></button>
                  <button title="移动到其他文件夹并更新引用" onClick={() => onMoveAttachment(reference)}><FolderInput size={14} /></button>
                  <button title="复制相对路径" onClick={() => onCopyAttachmentPath(reference)}><Copy size={14} /></button>
                  <button title="从当前笔记移除这条引用" onClick={() => onRemoveReference(reference)}><Link2Off size={14} /></button>
                  {reference.role === "attachment" && (
                    <button title="转为资料库文件（不移动文件）" onClick={() => onPromoteAttachment(reference)}><Upload size={14} /></button>
                  )}
                  <button className="danger" title="删除实际文件" onClick={() => onDeleteAttachment(reference)}><Trash2 size={14} /></button>
                </div>
              </article>
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
