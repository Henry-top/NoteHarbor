import { useEffect, useRef, useState } from "react";
import type { LibraryItemKind } from "../types";

export function InlineTitleEditor({
  title,
  kind,
  busy,
  error,
  onRename
}: {
  title: string;
  kind: LibraryItemKind;
  busy: boolean;
  error?: string;
  onRename: (name: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const committingRef = useRef(false);

  useEffect(() => {
    if (!editing) {
      setValue(title);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editing, title]);

  function cancel() {
    if (busy || committingRef.current) return;
    setValue(title);
    setEditing(false);
  }

  async function commit() {
    if (busy || committingRef.current) return;
    const nextName = value.trim();
    if (!nextName || normalizeName(nextName, kind) === normalizeName(title, kind)) {
      setValue(title);
      setEditing(false);
      return;
    }

    committingRef.current = true;
    const renamed = await onRename(nextName);
    committingRef.current = false;
    if (renamed) {
      setEditing(false);
      return;
    }
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="document-title-input"
        aria-label="笔记名称"
        aria-invalid={Boolean(error)}
        title={error || "按回车或点击其他位置保存，按 Esc 取消"}
        value={value}
        maxLength={180}
        disabled={busy}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="document-title-button"
      aria-label={`重命名“${title}”`}
      title="点击修改名称"
      disabled={busy}
      onClick={() => setEditing(true)}
    >
      {title}
    </button>
  );
}

function normalizeName(value: string, kind: LibraryItemKind) {
  const extension = kind === "markdown" ? ".md" : `.${kind}`;
  const trimmed = value.trim();
  return trimmed.toLocaleLowerCase().endsWith(extension)
    ? trimmed.slice(0, -extension.length).trim()
    : trimmed;
}
