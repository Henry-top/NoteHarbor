import {
  Copy,
  FilePlus2,
  FolderPlus,
  FolderSearch,
  Import,
  Pencil,
  Trash2
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { VaultFolder } from "../types";

interface FolderContextMenuProps {
  folder: VaultFolder;
  x: number;
  y: number;
  onClose: () => void;
  onNewNote: () => void;
  onNewFolder: () => void;
  onImport: () => void;
  onRename: () => void;
  onCopyPath: () => void;
  onReveal: () => void;
  onDelete: () => void;
}
export function FolderContextMenu({
  folder,
  x,
  y,
  onClose,
  onNewNote,
  onNewFolder,
  onImport,
  onRename,
  onCopyPath,
  onReveal,
  onDelete
}: FolderContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const timer = window.setTimeout(() => window.addEventListener("pointerdown", close), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", close);
    };
  }, [onClose]);

  const run = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <div
      ref={menuRef}
      className="item-context-menu folder-context-menu"
      style={{ left: x, top: y }}
      role="menu"
      aria-label={`${folder.name} 文件夹操作`}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button onClick={() => run(onNewNote)}><FilePlus2 size={15} /> 新建笔记</button>
      <button onClick={() => run(onNewFolder)}><FolderPlus size={15} /> 新建子文件夹</button>
      <button onClick={() => run(onImport)}><Import size={15} /> 导入文件</button>
      <span className="context-menu-separator" />
      <button disabled={folder.protected} onClick={() => run(onRename)}><Pencil size={15} /> 重命名</button>
      <button onClick={() => run(onCopyPath)}><Copy size={15} /> 复制相对路径</button>
      <button onClick={() => run(onReveal)}><FolderSearch size={15} /> 在文件管理器中显示</button>
      <span className="context-menu-separator" />
      <button className="danger" disabled={folder.protected} onClick={() => run(onDelete)}>
        <Trash2 size={15} /> 移到系统废纸篓
      </button>
    </div>
  );
}
