import { FilePenLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LibraryItemKind } from "../types";

export function RenameDialog({
  open,
  currentName,
  kind,
  busy,
  error,
  onCancel,
  onSubmit
}: {
  open: boolean;
  currentName: string;
  kind: LibraryItemKind;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const [value, setValue] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue(currentName);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentName, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel, open]);

  if (!open) return null;

  const trimmed = value.trim();
  const normalizedCurrent = normalizeName(currentName, kind);
  const normalizedNext = normalizeName(trimmed, kind);
  const unchanged = normalizedNext === normalizedCurrent;

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <form
        className="dialog rename-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (!trimmed || unchanged || busy) return;
          onSubmit(trimmed);
        }}
      >
        <div className="dialog-icon"><FilePenLine size={21} /></div>
        <h2 id="rename-dialog-title">重命名</h2>
        <p>文件扩展名会自动保留。</p>
        <label>
          <span>新的文件名称</span>
          <input
            ref={inputRef}
            value={value}
            disabled={busy}
            maxLength={180}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        {error && <div className="rename-error" role="alert">{error}</div>}
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onCancel}>取消</button>
          <button className="primary" type="submit" disabled={!trimmed || unchanged || busy}>
            {busy ? "正在重命名…" : "确认"}
          </button>
        </div>
      </form>
    </div>
  );
}

function normalizeName(value: string, kind: LibraryItemKind) {
  const extension = kind === "markdown" ? ".md" : `.${kind}`;
  const trimmed = value.trim();
  return trimmed.toLocaleLowerCase().endsWith(extension)
    ? trimmed.slice(0, -extension.length).trim()
    : trimmed;
}
