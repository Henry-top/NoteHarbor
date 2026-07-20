import { Trash2 } from "lucide-react";
import type { LibraryItemSummary } from "../types";

export function DeleteItemDialog({
  item,
  actionLabel,
  busy,
  error,
  referenceCount = 0,
  onCancel,
  onConfirm
}: {
  item: LibraryItemSummary | null;
  actionLabel: string;
  busy: boolean;
  error?: string;
  referenceCount?: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!item) return null;
  return (
    <div className="overlay">
      <section className="dialog delete-item-dialog" role="alertdialog" aria-modal="true">
        <div className="dialog-icon danger-icon"><Trash2 size={21} /></div>
        <h2>{actionLabel}</h2>
        <p>“{item.title}”可以从系统的{actionLabel.includes("废纸篓") ? "废纸篓" : "回收站"}恢复。</p>
        {referenceCount > 0 && (
          <p className="delete-reference-warning">它仍被 {referenceCount} 篇笔记引用，删除后这些链接会失效。</p>
        )}
        {error && <div className="rename-error" role="alert">{error}</div>}
        <div className="dialog-actions">
          <button disabled={busy} onClick={onCancel}>取消</button>
          <button className="danger-confirm" disabled={busy} onClick={onConfirm}>
            {busy ? "正在处理…" : actionLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
