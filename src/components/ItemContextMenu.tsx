import {
  Copy,
  ExternalLink,
  FilePenLine,
  FolderSearch,
  Heart,
  Link2,
  Pin,
  RefreshCw,
  Trash2,
  Unlink
} from "lucide-react";
import type { PlatformFileLabels } from "../lib/platform";
import type { LibraryItemSummary } from "../types";

export type ItemContextActions = {
  onRename: () => void;
  onDuplicate?: () => void;
  onCopyWikiLink?: () => void;
  onCopyPath: () => void;
  onTogglePinned: () => void;
  onToggleFavorite: () => void;
  onReveal: () => void;
  onOpenExternal?: () => void;
  onSync?: () => void;
  onRelink?: () => void;
  onDelete: () => void;
};

export function ItemContextMenu({
  item,
  x,
  y,
  labels,
  actions,
  onClose
}: {
  item: LibraryItemSummary;
  x: number;
  y: number;
  labels: PlatformFileLabels;
  actions: ItemContextActions;
  onClose: () => void;
}) {
  const run = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <>
      <div className="menu-scrim item-menu-scrim" onMouseDown={onClose} />
      <div
        className="context-menu item-context-menu"
        role="menu"
        aria-label={`${item.title} 文件操作`}
        style={{ left: x, top: y }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {actions.onOpenExternal && (
          <button role="menuitem" onClick={() => run(actions.onOpenExternal!)}>
            <ExternalLink size={14} />使用本地默认软件打开
          </button>
        )}
        {actions.onSync && (
          <button role="menuitem" onClick={() => run(actions.onSync!)}>
            <RefreshCw size={14} />从源文件重新同步
          </button>
        )}
        {actions.onRelink && (
          <button role="menuitem" onClick={() => run(actions.onRelink!)}>
            <Unlink size={14} />重新关联源文件
          </button>
        )}
        {(actions.onOpenExternal || actions.onSync || actions.onRelink) && <div className="context-separator" />}
        <button role="menuitem" onClick={() => run(actions.onRename)}>
          <FilePenLine size={14} />重命名
        </button>
        {actions.onDuplicate && (
          <button role="menuitem" onClick={() => run(actions.onDuplicate!)}>
            <Copy size={14} />复制笔记
          </button>
        )}
        {actions.onCopyWikiLink && (
          <button role="menuitem" onClick={() => run(actions.onCopyWikiLink!)}>
            <Link2 size={14} />复制笔记链接
          </button>
        )}
        <button role="menuitem" onClick={() => run(actions.onCopyPath)}>
          <Copy size={14} />复制相对路径
        </button>
        <div className="context-separator" />
        <button role="menuitem" onClick={() => run(actions.onTogglePinned)}>
          <Pin size={14} />{item.isPinned ? "取消置顶" : "置顶"}
        </button>
        <button role="menuitem" onClick={() => run(actions.onToggleFavorite)}>
          <Heart size={14} />{item.isFavorite ? "取消收藏" : "收藏"}
        </button>
        <button role="menuitem" onClick={() => run(actions.onReveal)}>
          <FolderSearch size={14} />{labels.reveal}
        </button>
        <div className="context-separator" />
        <button className="danger" role="menuitem" onClick={() => run(actions.onDelete)}>
          <Trash2 size={14} />{labels.trash}
        </button>
      </div>
    </>
  );
}
