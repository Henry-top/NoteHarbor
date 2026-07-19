import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FileText,
  FileType2,
  Import,
  Folder,
  FolderOpen,
  Heart,
  MoreHorizontal,
  PanelLeftClose,
  Pin,
  Plus,
  Search
} from "lucide-react";
import { useMemo, useState } from "react";
import { t } from "../i18n";
import type { LibraryItemSummary, Vault } from "../types";

interface SidebarProps {
  vaults: Vault[];
  items: LibraryItemSummary[];
  activeVaultId?: string;
  activePath?: string;
  indexProgress: Record<string, number>;
  onSelectItem: (item: LibraryItemSummary) => void;
  onActivateVault: (vaultId: string) => void;
  onAddVault: () => void;
  onImportWord: (vaultId: string) => void;
  onNewNote: (vaultId: string, kind?: "regular" | "daily") => void;
  onSearch: () => void;
  onHide: () => void;
  onVaultMenu: (vault: Vault, anchor: HTMLElement) => void;
}

type TreeNode = {
  name: string;
  path: string;
  folders: Map<string, TreeNode>;
  items: LibraryItemSummary[];
};

export function Sidebar({
  vaults,
  items,
  activeVaultId,
  activePath,
  indexProgress,
  onSelectItem,
  onActivateVault,
  onAddVault,
  onImportWord,
  onNewNote,
  onSearch,
  onHide,
  onVaultMenu
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [section, setSection] = useState<"all" | "recent" | "favorites" | "pinned">("all");

  const filteredNotes = useMemo(() => {
    const sorted = [...items];
    if (section === "recent") {
      return sorted
        .filter((note) => note.lastOpened)
        .sort((a, b) => (b.lastOpened || "").localeCompare(a.lastOpened || ""))
        .slice(0, 20);
    }
    if (section === "favorites") return sorted.filter((note) => note.isFavorite);
    if (section === "pinned") return sorted.filter((note) => note.isPinned);
    return sorted;
  }, [items, section]);

  const toggle = (key: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <aside className="sidebar">
      <div className="window-drag sidebar-titlebar" data-tauri-drag-region>
        <div className="brand-mark" aria-hidden="true">
          <span />
        </div>
        <strong>{t("appName")}</strong>
        <button className="icon-button sidebar-hide" onClick={onHide} title="隐藏侧栏">
          <PanelLeftClose size={17} />
        </button>
      </div>

      <button className="search-trigger" onClick={onSearch}>
        <Search size={16} />
        <span>{t("search")}</span>
        <kbd>⌘K</kbd>
      </button>

      <nav className="quick-nav" aria-label="笔记筛选">
        <QuickNav icon={<BookOpen />} label={t("allContent")} active={section === "all"} onClick={() => setSection("all")} />
        <QuickNav icon={<CalendarDays />} label={t("recent")} active={section === "recent"} onClick={() => setSection("recent")} />
        <QuickNav icon={<Pin />} label={t("pinned")} active={section === "pinned"} onClick={() => setSection("pinned")} />
        <QuickNav icon={<Heart />} label={t("favorites")} active={section === "favorites"} onClick={() => setSection("favorites")} />
      </nav>

      <div className="sidebar-section-heading">
        <span>{t("library")}</span>
        <button className="icon-button" onClick={() => activeVaultId && onImportWord(activeVaultId)} disabled={!activeVaultId} title={t("importWord")}>
          <Import size={16} />
        </button>
        <button className="icon-button" onClick={onAddVault} title={t("addVault")}>
          <Plus size={16} />
        </button>
      </div>

      <div className="vault-list">
        {vaults.map((vault) => {
          const key = `vault:${vault.id}`;
          const isCollapsed = collapsed.has(key);
          const vaultNotes = filteredNotes.filter((note) => note.vaultId === vault.id);
          const tree = buildTree(vaultNotes);
          const progress = indexProgress[vault.id];
          return (
            <section className={`vault ${activeVaultId === vault.id ? "active-vault" : ""}`} key={vault.id}>
              <div
                className="vault-row"
                onClick={() => {
                  onActivateVault(vault.id);
                  toggle(key);
                }}
              >
                <button className="disclosure" aria-label={isCollapsed ? "展开" : "折叠"}>
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
                {isCollapsed ? <Folder size={16} /> : <FolderOpen size={16} />}
                <span className="vault-name">{vault.name}</span>
                <span className="vault-count">{vaultNotes.length}</span>
                <button
                  className="icon-button vault-more"
                  onClick={(event) => {
                    event.stopPropagation();
                    onVaultMenu(vault, event.currentTarget);
                  }}
                  aria-label="资料库菜单"
                >
                  <MoreHorizontal size={15} />
                </button>
              </div>
              {progress !== undefined && progress < 1 && (
                <div className="index-line"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
              )}
              {!isCollapsed && (
                <Tree
                  node={tree}
                  depth={0}
                  collapsed={collapsed}
                  toggle={toggle}
                  activePath={activeVaultId === vault.id ? activePath : undefined}
                  onSelect={onSelectItem}
                />
              )}
              {!isCollapsed && vaultNotes.length === 0 && (
                <button className="empty-vault" onClick={() => onNewNote(vault.id)}>
                  <Plus size={14} /> {t("newNote")}
                </button>
              )}
            </section>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <button onClick={() => activeVaultId && onNewNote(activeVaultId, "daily")} disabled={!activeVaultId}>
          <CalendarDays size={16} />
          <span>{t("dailyNote")}</span>
        </button>
        <button className="new-note-button" onClick={() => activeVaultId && onNewNote(activeVaultId)} disabled={!activeVaultId}>
          <Plus size={16} />
          <span>{t("newNote")}</span>
        </button>
      </div>
    </aside>
  );
}

function QuickNav({
  icon,
  label,
  active,
  onClick
}: {
  icon: React.ReactElement;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Tree({
  node,
  depth,
  collapsed,
  toggle,
  activePath,
  onSelect
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  toggle: (key: string) => void;
  activePath?: string;
  onSelect: (item: LibraryItemSummary) => void;
}) {
  return (
    <div className="note-tree">
      {[...node.folders.values()].map((folder) => {
        const key = `folder:${folder.path}`;
        const isCollapsed = collapsed.has(key);
        return (
          <div key={folder.path}>
            <button
              className="tree-folder"
              style={{ paddingLeft: `${16 + depth * 14}px` }}
              onClick={() => toggle(key)}
            >
              {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              <span>{folder.name}</span>
            </button>
            {!isCollapsed && (
              <Tree
                node={folder}
                depth={depth + 1}
                collapsed={collapsed}
                toggle={toggle}
                activePath={activePath}
                onSelect={onSelect}
              />
            )}
          </div>
        );
      })}
      {node.items.map((item) => (
        <button
          className={`tree-note ${activePath === item.path ? "active" : ""}`}
          style={{ paddingLeft: `${34 + depth * 14}px` }}
          key={`${item.vaultId}:${item.path}`}
          onClick={() => onSelect(item)}
        >
          {item.kind === "markdown" ? <FileText size={14} /> : <FileType2 className="word-file-icon" size={14} />}
          <span>{item.title}</span>
          {item.isPinned && <Pin className="note-indicator" size={11} />}
        </button>
      ))}
    </div>
  );
}

function buildTree(items: LibraryItemSummary[]): TreeNode {
  const root: TreeNode = { name: "", path: "", folders: new Map(), items: [] };
  for (const item of [...items].sort((a, b) => a.path.localeCompare(b.path, "zh-CN"))) {
    const parts = item.path.split("/");
    let node = root;
    for (const folder of parts.slice(0, -1)) {
      const path = node.path ? `${node.path}/${folder}` : folder;
      if (!node.folders.has(folder)) {
        node.folders.set(folder, { name: folder, path, folders: new Map(), items: [] });
      }
      node = node.folders.get(folder)!;
    }
    node.items.push(item);
  }
  return root;
}
