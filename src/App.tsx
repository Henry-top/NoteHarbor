import {
  Clock3,
  Command,
  ExternalLink,
  FileType2,
  Heart,
  Import,
  Link2,
  Menu,
  MoreHorizontal,
  PanelRight,
  Palette,
  Pin,
  RefreshCw,
  Search,
  Trash2,
  X
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppearancePopover } from "./components/AppearancePopover";
import { ConflictDialog } from "./components/ConflictDialog";
import { DocxPreview } from "./components/DocxPreview";
import { EditorPane } from "./components/EditorPane";
import { MarkdownPreview } from "./components/MarkdownPreview";
import { ModeSwitcher } from "./components/ModeSwitcher";
import { RightPanel } from "./components/RightPanel";
import { SearchPalette } from "./components/SearchPalette";
import { Sidebar } from "./components/Sidebar";
import { t } from "./i18n";
import { api, runningInTauri } from "./lib/api";
import { applyAppearance, readAppearance, storeAppearance } from "./lib/appearance";
import { updateTags, wordCount } from "./lib/markdown";
import type {
  Backlink,
  ColorMode,
  EditorMode,
  FileConflict,
  HistoryEntry,
  IndexProgress,
  LibraryItemSummary,
  NoteDocument,
  OpenItem,
  OpenTab,
  SearchHit,
  ThemeStyle,
  Vault
} from "./types";

type SaveState = "saved" | "saving" | "error";

export default function App() {
  const initialAppearance = useRef(readAppearance());
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [items, setItems] = useState<LibraryItemSummary[]>([]);
  const [current, setCurrent] = useState<OpenItem | null>(null);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeVaultId, setActiveVaultId] = useState<string>();
  const [mode, setMode] = useState<EditorMode>("live");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [conflict, setConflict] = useState<FileConflict | null>(null);
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [indexProgress, setIndexProgress] = useState<Record<string, number>>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeStyle>(initialAppearance.current.theme);
  const [colorMode, setColorMode] = useState<ColorMode>(initialAppearance.current.colorMode);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [vaultMenu, setVaultMenu] = useState<{ vault: Vault; x: number; y: number } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef(draft);
  const currentRef = useRef(current);
  const saveNowRef = useRef<(
    document: NoteDocument,
    content: string,
    quiet?: boolean,
    force?: boolean
  ) => Promise<void>>(async () => undefined);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    if (!current || current.kind === "markdown") return;
    const latest = items.find((item) => item.vaultId === current.vaultId && item.path === current.path);
    if (!latest || latest.kind === "markdown") return;
    const previewChanged = latest.modifiedAt !== current.modifiedAt || latest.lastSyncedAt !== current.lastSyncedAt;
    const metadataChanged = previewChanged
      || latest.syncStatus !== current.syncStatus
      || latest.sourcePath !== current.sourcePath
      || latest.title !== current.title
      || latest.sizeBytes !== current.sizeBytes
      || latest.isFavorite !== current.isFavorite
      || latest.isPinned !== current.isPinned;
    if (!metadataChanged) return;
    setCurrent(latest as OpenItem);
    if (previewChanged && latest.kind === "docx") setPreviewRevision((value) => value + 1);
  }, [current, items]);

  const refreshItems = useCallback(async () => {
    try {
      const next = await api.listLibraryItems();
      setItems(next);
      setVaults((items) =>
        items.map((vault) => ({
          ...vault,
          noteCount: next.filter((item) => item.vaultId === vault.id).length
        }))
      );
    } catch (error) {
      showError(error, setToast);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loadedVaults = await api.listVaults();
        if (cancelled) return;
        setVaults(loadedVaults);
        setActiveVaultId(loadedVaults[0]?.id);
        const scanned = await Promise.all(
          loadedVaults.filter((vault) => vault.available).map((vault) => api.scanVault(vault.id))
        );
        if (!cancelled) setItems(scanned.flat());
      } catch (error) {
        showError(error, setToast);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    let unlistenProgress: (() => void) | undefined;
    let unlistenChanged: (() => void) | undefined;
    void api.onIndexProgress((progress: IndexProgress) => {
      setIndexProgress((state) => ({
        ...state,
        [progress.vaultId]: progress.finished ? 1 : progress.total ? progress.scanned / progress.total : 0
      }));
    }).then((unlisten) => { unlistenProgress = unlisten; });
    void api.onVaultChanged(() => {
      window.setTimeout(() => void refreshItems(), 200);
    }).then((unlisten) => { unlistenChanged = unlisten; });

    return () => {
      cancelled = true;
      unlistenProgress?.();
      unlistenChanged?.();
    };
  }, [refreshItems]);

  useEffect(() => {
    const root = window.document.documentElement;
    const systemScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyAppearance(root, theme, colorMode, systemScheme.matches);
    update();
    storeAppearance(localStorage, theme, colorMode);
    systemScheme.addEventListener("change", update);
    return () => systemScheme.removeEventListener("change", update);
  }, [theme, colorMode]);

  const changeTheme = useCallback((nextTheme: ThemeStyle) => {
    applyAppearance(
      document.documentElement,
      nextTheme,
      colorMode,
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
    setTheme(nextTheme);
  }, [colorMode]);

  const changeColorMode = useCallback((nextColorMode: ColorMode) => {
    applyAppearance(
      document.documentElement,
      theme,
      nextColorMode,
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
    setColorMode(nextColorMode);
  }, [theme]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const modifier = navigator.platform.toLowerCase().includes("mac") ? event.metaKey : event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (modifier && event.key.toLowerCase() === "n" && activeVaultId) {
        event.preventDefault();
        void createNote(activeVaultId);
      }
      if (modifier && event.key === "\\") {
        event.preventDefault();
        setSidebarOpen((value) => !value);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setAppearanceOpen(false);
        setVaultMenu(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const openItem = useCallback(async (summary: LibraryItemSummary) => {
    try {
      if (dirty && currentRef.current?.kind === "markdown") {
        await saveNowRef.current(currentRef.current, draftRef.current, true);
      }
      const document: OpenItem = summary.kind === "markdown"
        ? await api.readNote(summary.vaultId, summary.path)
        : { ...summary, kind: summary.kind };
      setCurrent(document);
      setDraft(document.kind === "markdown" ? document.content : "");
      setDirty(false);
      setSaveState("saved");
      setActiveVaultId(document.vaultId);
      if (document.kind === "markdown") {
        const storedMode = localStorage.getItem(`noteharbor:mode:${document.vaultId}:${document.path}`) as EditorMode | null;
        setMode(storedMode || "live");
      }
      setTabs((existing) => {
        const tab = { vaultId: document.vaultId, path: document.path, title: document.title, kind: document.kind };
        return existing.some((item) => item.vaultId === tab.vaultId && item.path === tab.path)
          ? existing
          : [...existing, tab];
      });
      if (document.kind === "markdown") {
        const [nextBacklinks, nextHistory] = await Promise.all([
          api.backlinks(document.vaultId, document.path),
          api.listHistory(document.vaultId, document.path)
        ]);
        setBacklinks(nextBacklinks);
        setHistory(nextHistory);
      } else {
        setBacklinks([]);
        setHistory([]);
      }
      void refreshItems();
    } catch (error) {
      showError(error, setToast);
    }
  }, [dirty, refreshItems]);

  const saveNow = useCallback(async (
    document: NoteDocument,
    content: string,
    quiet = false,
    force = false
  ) => {
    try {
      if (!quiet) setSaveState("saving");
      const result = await api.saveNote(
        document.vaultId,
        document.path,
        content,
        document.revision,
        force
      );
      if (result.status === "conflict" && result.conflict) {
        setConflict(result.conflict);
        setSaveState("error");
        return;
      }
      if (result.document) {
        setCurrent((value) => {
          if (!value || value.vaultId !== document.vaultId || value.path !== document.path) return value;
          return result.document!;
        });
        if (draftRef.current === content) setDirty(false);
        setSaveState("saved");
        void refreshItems();
      }
    } catch (error) {
      setSaveState("error");
      showError(error, setToast);
    }
  }, [refreshItems]);
  saveNowRef.current = saveNow;

  useEffect(() => {
    if (!current || current.kind !== "markdown" || !dirty || conflict) return;
    const timer = window.setTimeout(() => void saveNow(current, draft), 500);
    return () => window.clearTimeout(timer);
  }, [current, draft, dirty, conflict, saveNow]);

  useEffect(() => {
    if (!current || current.kind !== "markdown" || dirty) return;
    const timer = window.setTimeout(() => {
      void api.createSnapshot(current.vaultId, current.path, current.content).then(() =>
        api.listHistory(current.vaultId, current.path).then(setHistory)
      );
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [current, dirty]);

  useEffect(() => {
    if (!searchOpen || !searchQuery.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void api.search(searchQuery, vaults.map((vault) => vault.id))
        .then(setSearchResults)
        .catch((error) => showError(error, setToast))
        .finally(() => setSearching(false));
    }, 160);
    return () => window.clearTimeout(timer);
  }, [searchOpen, searchQuery, vaults]);

  async function addVault() {
    try {
      const selected = runningInTauri
        ? await open({ directory: true, multiple: false, title: "选择 Markdown 资料库" })
        : window.prompt("浏览器预览模式：输入资料库路径", "~/我的笔记");
      if (typeof selected !== "string") return;
      const vault = await api.registerVault(selected);
      setVaults((items) => [...items.filter((item) => item.id !== vault.id), vault]);
      setActiveVaultId(vault.id);
      const scanned = await api.scanVault(vault.id);
      setItems((items) => [...items.filter((item) => item.vaultId !== vault.id), ...scanned]);
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function createNote(vaultId: string, kind: "regular" | "daily" = "regular") {
    try {
      const document = await api.createNote(vaultId, kind);
      await refreshItems();
      await openItem(document);
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function importWord(vaultId: string) {
    try {
      if (!runningInTauri) throw new Error("请在桌面应用中导入 Word 文档");
      const selected = await open({
        directory: false,
        multiple: true,
        title: "选择要导入的 Word 文档",
        filters: [{ name: "Word 文档", extensions: ["docx", "doc"] }]
      });
      if (!selected) return;
      const sourcePaths = Array.isArray(selected) ? selected : [selected];
      if (!sourcePaths.length) return;
      const imported = await api.importWordDocuments(vaultId, sourcePaths);
      await refreshItems();
      if (imported[0]) await openItem(imported[0]);
      setToast(`已导入 ${imported.length} 个 Word 文档`);
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function openCurrentInDefaultApp() {
    if (!current || current.kind === "markdown") return;
    try {
      await api.openLibraryFile(current.vaultId, current.path);
      await refreshItems();
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function syncCurrentWord() {
    if (!current || current.kind === "markdown") return;
    try {
      const synced = await api.syncLibraryFile(current.vaultId, current.path);
      setCurrent(synced as OpenItem);
      setItems((existing) => existing.map((item) =>
        item.vaultId === synced.vaultId && item.path === synced.path ? synced : item
      ));
      setPreviewRevision((value) => value + 1);
      setToast("已从源文件重新同步");
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function relinkCurrentWord() {
    if (!current || current.kind === "markdown") return;
    try {
      if (!runningInTauri) throw new Error("请在桌面应用中重新关联源文件");
      const selected = await open({
        directory: false,
        multiple: false,
        title: "选择新的 Word 源文件",
        filters: [{ name: "Word 文档", extensions: [current.kind] }]
      });
      if (typeof selected !== "string") return;
      const confirmed = window.confirm("重新关联后，新源文件会覆盖资料库中的当前副本。是否继续？");
      if (!confirmed) return;
      const relinked = await api.relinkLibraryFile(current.vaultId, current.path, selected);
      setCurrent(relinked as OpenItem);
      setItems((existing) => existing.map((item) =>
        item.vaultId === relinked.vaultId && item.path === relinked.path ? relinked : item
      ));
      setPreviewRevision((value) => value + 1);
      setToast("已重新关联并同步源文件");
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function closeTab(tab: OpenTab) {
    if (current?.kind === "markdown" && current.vaultId === tab.vaultId && current.path === tab.path && dirty) {
      await saveNow(current, draft, true);
    }
    setTabs((items) => items.filter((item) => item.vaultId !== tab.vaultId || item.path !== tab.path));
    if (current?.vaultId === tab.vaultId && current.path === tab.path) {
      const remaining = tabs.filter((item) => item.vaultId !== tab.vaultId || item.path !== tab.path);
      const next = remaining.at(-1);
      const nextItem = next && items.find((item) => item.vaultId === next.vaultId && item.path === next.path);
      if (nextItem) await openItem(nextItem);
      else {
        setCurrent(null);
        setDraft("");
        setBacklinks([]);
        setHistory([]);
      }
    }
  }

  async function renameCurrent() {
    if (!current) return;
    const next = window.prompt("新的文件名称", current.title);
    if (!next || next.trim() === current.title) return;
    try {
      const renamed = current.kind === "markdown"
        ? await api.renameNote(current.vaultId, current.path, next.trim())
        : await api.renameLibraryFile(current.vaultId, current.path, next.trim());
      setCurrent(renamed as OpenItem);
      if (renamed.kind === "markdown") setDraft((renamed as NoteDocument).content);
      setTabs((items) => items.map((tab) =>
        tab.vaultId === current.vaultId && tab.path === current.path
          ? { vaultId: renamed.vaultId, path: renamed.path, title: renamed.title, kind: renamed.kind }
          : tab
      ));
      await refreshItems();
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function deleteCurrent() {
    if (!current || !window.confirm(`将“${current.title}”移到废纸篓？`)) return;
    try {
      if (current.kind === "markdown") await api.deleteNote(current.vaultId, current.path);
      else await api.deleteLibraryFile(current.vaultId, current.path);
      const tab = { vaultId: current.vaultId, path: current.path, title: current.title, kind: current.kind };
      await closeTab(tab);
      await refreshItems();
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function removeVault(vault: Vault) {
    if (!window.confirm(`从墨岛笔记中移除“${vault.name}”？\n文件不会被删除。`)) return;
    try {
      await api.removeVault(vault.id);
      setVaults((items) => items.filter((item) => item.id !== vault.id));
      setItems((items) => items.filter((item) => item.vaultId !== vault.id));
      setTabs((items) => items.filter((tab) => tab.vaultId !== vault.id));
      if (current?.vaultId === vault.id) {
        setCurrent(null);
        setDraft("");
      }
      setActiveVaultId((value) => value === vault.id ? vaults.find((item) => item.id !== vault.id)?.id : value);
      setVaultMenu(null);
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function toggleFlag(flag: "favorite" | "pinned") {
    if (!current) return;
    const value = flag === "favorite" ? !current.isFavorite : !current.isPinned;
    await api.setNoteFlag(current.vaultId, current.path, flag, value);
    setCurrent({ ...current, [flag === "favorite" ? "isFavorite" : "isPinned"]: value });
    await refreshItems();
  }

  async function openWikiLink(target: string) {
    if (!current || current.kind !== "markdown") return;
    const normalized = target.replace(/\.md$/i, "");
    const note = items.find((item) =>
      item.kind === "markdown" &&
      item.vaultId === current.vaultId &&
      (item.title === normalized || item.path.replace(/\.md$/i, "") === normalized)
    );
    if (note) await openItem(note);
    else setToast(`本资料库中没有找到“${target}”`);
  }

  async function importAttachment(file: File) {
    if (!current || current.kind !== "markdown") throw new Error("请先打开一篇 Markdown 笔记");
    const bytes = [...new Uint8Array(await file.arrayBuffer())];
    const stored = await api.importAttachment(current.vaultId, file.name || "image.png", bytes);
    const depth = Math.max(0, current.path.split("/").length - 1);
    return `${"../".repeat(depth)}${stored}`;
  }

  function selectSearchHit(hit: SearchHit) {
    setSearchOpen(false);
    setSearchQuery("");
    const item = items.find((candidate) => candidate.vaultId === hit.vaultId && candidate.path === hit.path);
    if (item) void openItem(item);
    else setToast("文件列表正在更新，请稍后重试");
  }

  function changeMode(next: EditorMode) {
    setMode(next);
    if (current?.kind === "markdown") localStorage.setItem(`noteharbor:mode:${current.vaultId}:${current.path}`, next);
  }

  const currentSummary = current
    ? items.find((item) => item.vaultId === current.vaultId && item.path === current.path)
    : undefined;
  const statusText = saveState === "saving" ? t("saving") : saveState === "error" ? t("saveFailed") : t("saved");
  const activeVault = vaults.find((vault) => vault.id === activeVaultId);
  const totalLines = draft ? draft.split("\n").length : 0;
  const showRightPanel = Boolean(current?.kind === "markdown" && rightPanelOpen);

  return (
    <div className={`app-shell ${runningInTauri && navigator.platform.toLowerCase().includes("mac") ? "native-macos" : ""} ${sidebarOpen ? "" : "sidebar-closed"} ${showRightPanel ? "" : "right-closed"}`}>
      {sidebarOpen && (
        <Sidebar
          vaults={vaults}
          items={items}
          activeVaultId={activeVaultId}
          activePath={current?.path}
          indexProgress={indexProgress}
          onSelectItem={(item) => void openItem(item)}
          onActivateVault={setActiveVaultId}
          onAddVault={() => void addVault()}
          onImportWord={(vaultId) => void importWord(vaultId)}
          onNewNote={(vaultId, kind) => void createNote(vaultId, kind)}
          onSearch={() => setSearchOpen(true)}
          onHide={() => setSidebarOpen(false)}
          onVaultMenu={(vault, anchor) => {
            const rect = anchor.getBoundingClientRect();
            setVaultMenu({ vault, x: rect.right, y: rect.bottom });
          }}
        />
      )}

      <main className="workspace">
        <header className="workspace-topbar window-drag" data-tauri-drag-region>
          {!sidebarOpen && (
            <button className="icon-button" onClick={() => setSidebarOpen(true)} title="显示侧栏">
              <Menu size={18} />
            </button>
          )}
          <div className="breadcrumbs">
            {activeVault && <span>{activeVault.name}</span>}
            {current && <><i>/</i><strong>{current.title}</strong></>}
          </div>
          <div className="topbar-actions">
            <button className="icon-button" onClick={() => setSearchOpen(true)} title={t("search")}><Search size={17} /></button>
            <button
              className={`icon-button ${appearanceOpen ? "active" : ""}`}
              aria-expanded={appearanceOpen}
              onClick={() => setAppearanceOpen((value) => !value)}
              title={t("appearance")}
            >
              <Palette size={17} />
            </button>
            {current?.kind === "markdown" && (
              <button className={`icon-button ${rightPanelOpen ? "active" : ""}`} onClick={() => setRightPanelOpen((value) => !value)} title={t("outline")}>
                <PanelRight size={17} />
              </button>
            )}
          </div>
          <AppearancePopover
            open={appearanceOpen}
            theme={theme}
            colorMode={colorMode}
            onThemeChange={changeTheme}
            onColorModeChange={changeColorMode}
            onClose={() => setAppearanceOpen(false)}
          />
        </header>

        <div className="tab-strip">
          {tabs.map((tab) => {
            const active = current?.vaultId === tab.vaultId && current.path === tab.path;
            return (
              <button className={`tab ${active ? "active" : ""}`} key={`${tab.vaultId}:${tab.path}`} onClick={() => {
                const item = items.find((candidate) => candidate.vaultId === tab.vaultId && candidate.path === tab.path);
                if (item) void openItem(item);
              }}>
                <span>{tab.title}</span>
                <i onClick={(event) => { event.stopPropagation(); void closeTab(tab); }}><X size={13} /></i>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="loading-state"><div className="harbor-loader"><span /></div><p>正在打开墨岛笔记…</p></div>
        ) : !current ? (
          <Welcome
            hasVaults={vaults.length > 0}
            activeVaultId={activeVaultId}
            onAddVault={() => void addVault()}
            onNewNote={() => activeVaultId && void createNote(activeVaultId)}
          />
        ) : (
          <>
            <div className="document-toolbar">
              <div className="document-title">
                <h1>{current.title}</h1>
                {current.kind === "markdown" ? (
                  <span className={`save-status ${saveState}`}>{statusText}</span>
                ) : (
                  <WordSyncBadge item={current} />
                )}
              </div>
              <div className="document-actions">
                {current.kind === "markdown" ? (
                  <>
                    <ModeSwitcher mode={mode} onChange={changeMode} />
                    <span className="toolbar-divider" />
                  </>
                ) : (
                  <button className="word-open-button" onClick={() => void openCurrentInDefaultApp()}>
                    <ExternalLink size={15} /> {t("openWithDefaultApp")}
                  </button>
                )}
                <button className={`icon-button ${current.isPinned ? "active" : ""}`} onClick={() => void toggleFlag("pinned")} title={t("pinned")}><Pin size={16} /></button>
                <button className={`icon-button ${current.isFavorite ? "active" : ""}`} onClick={() => void toggleFlag("favorite")} title={t("favorites")}><Heart size={16} /></button>
                <DocumentMenu
                  onRename={() => void renameCurrent()}
                  onDelete={() => void deleteCurrent()}
                  onSync={current.kind === "markdown" ? undefined : () => void syncCurrentWord()}
                  onRelink={current.kind === "markdown" ? undefined : () => void relinkCurrentWord()}
                />
              </div>
            </div>

            <div className={`document-stage ${current.kind === "markdown" ? `mode-${mode}` : "mode-document"}`}>
              {current.kind === "markdown" ? (
                <>
                  <EditorPane
                    value={draft}
                    mode={mode}
                    onChange={(value) => {
                      setDraft(value);
                      setDirty(value !== current.content);
                    }}
                    onScrollRatio={(ratio) => {
                      const element = previewRef.current;
                      if (!element) return;
                      element.scrollTop = ratio * (element.scrollHeight - element.clientHeight);
                    }}
                    onImportAttachment={importAttachment}
                  />
                  {mode === "split" && (
                    <MarkdownPreview
                      content={draft}
                      onOpenWikiLink={(target) => void openWikiLink(target)}
                      scrollRef={previewRef}
                      vaultPath={activeVault?.path}
                      notePath={current.path}
                    />
                  )}
                </>
              ) : current.kind === "docx" ? (
                <DocxPreview
                  vaultId={current.vaultId}
                  path={current.path}
                  revision={previewRevision}
                  onLoaded={refreshItems}
                />
              ) : (
                <LegacyDocPlaceholder onOpen={() => void openCurrentInDefaultApp()} />
              )}
            </div>

            <footer className="statusbar">
              <span>{current.path}</span>
              <div>
                {current.kind === "markdown" ? (
                  <>
                    <span>{wordCount(draft)} {t("words")}</span>
                    <span>{totalLines} {t("lines")}</span>
                    <span>Markdown</span>
                  </>
                ) : (
                  <>
                    {typeof current.sizeBytes === "number" && <span>{formatBytes(current.sizeBytes)}</span>}
                    <span>{current.kind.toUpperCase()}</span>
                  </>
                )}
              </div>
            </footer>
          </>
        )}
      </main>

      {rightPanelOpen && current?.kind === "markdown" && (
        <RightPanel
          document={{
            ...current,
            content: draft,
            isFavorite: currentSummary?.isFavorite ?? current.isFavorite,
            isPinned: currentSummary?.isPinned ?? current.isPinned
          }}
          backlinks={backlinks}
          history={history}
          onClose={() => setRightPanelOpen(false)}
          onOpenBacklink={(backlink) => {
            const item = items.find((candidate) => candidate.vaultId === backlink.vaultId && candidate.path === backlink.path);
            if (item) void openItem(item);
          }}
          onRestore={(entry) => void api.restoreHistory(entry.id).then((restored) => {
            setCurrent(restored);
            setDraft(restored.content);
            setDirty(false);
            setToast("已恢复历史版本");
            void refreshItems();
          }).catch((error) => showError(error, setToast))}
          onUpdateTags={(tags) => {
            const next = updateTags(draft, tags);
            setDraft(next);
            setDirty(true);
          }}
        />
      )}

      <SearchPalette
        open={searchOpen}
        query={searchQuery}
        results={searchResults}
        searching={searching}
        vaults={vaults}
        onQueryChange={setSearchQuery}
        onSelect={selectSearchHit}
        onClose={() => setSearchOpen(false)}
      />

      <ConflictDialog
        conflict={conflict}
        onClose={() => setConflict(null)}
        onLoadDisk={() => {
          if (!conflict || current?.kind !== "markdown") return;
          setDraft(conflict.diskContent);
          setCurrent({ ...current, content: conflict.diskContent, revision: conflict.actualRevision });
          setDirty(false);
          setConflict(null);
          setSaveState("saved");
        }}
        onKeepMine={() => {
          if (current?.kind !== "markdown") return;
          setConflict(null);
          void saveNow(current, draft, false, true);
        }}
        onSaveCopy={() => {
          if (current?.kind !== "markdown") return;
          void api.saveCopy(current.vaultId, current.path, draft).then((copy) => {
            setConflict(null);
            void refreshItems();
            void openItem(copy);
          }).catch((error) => showError(error, setToast));
        }}
      />

      {vaultMenu && (
        <>
          <div className="menu-scrim" onClick={() => setVaultMenu(null)} />
          <div className="context-menu" style={{ left: vaultMenu.x - 178, top: vaultMenu.y + 4 }}>
            <button onClick={() => void createNote(vaultMenu.vault.id)}><PlusMenuIcon />{t("newNote")}</button>
            <button onClick={() => { setVaultMenu(null); void importWord(vaultMenu.vault.id); }}><Import size={15} />{t("importWord")}</button>
            <button className="danger" onClick={() => void removeVault(vaultMenu.vault)}><Trash2 size={15} />{t("removeVault")}</button>
          </div>
        </>
      )}

      {toast && <div className="toast" onAnimationEnd={() => setToast("")}>{toast}</div>}
    </div>
  );
}

function Welcome({
  hasVaults,
  activeVaultId,
  onAddVault,
  onNewNote
}: {
  hasVaults: boolean;
  activeVaultId?: string;
  onAddVault: () => void;
  onNewNote: () => void;
}) {
  return (
    <div className="welcome">
      <div className="welcome-mark"><span /><i /></div>
      <h1>{t("appName")}</h1>
      <p>{hasVaults ? t("noNote") : t("noVault")}</p>
      <div>
        {!hasVaults && <button className="primary" onClick={onAddVault}>添加本地资料库</button>}
        {hasVaults && activeVaultId && <button className="primary" onClick={onNewNote}>写一篇新笔记</button>}
        <button onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}>
          <Command size={15} /> 打开搜索
        </button>
      </div>
      <small>{t("appTagline")}</small>
    </div>
  );
}

function DocumentMenu({
  onRename,
  onDelete,
  onSync,
  onRelink
}: {
  onRename: () => void;
  onDelete: () => void;
  onSync?: () => void;
  onRelink?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="document-menu-wrap">
      <button className="icon-button" onClick={() => setOpen((value) => !value)}><MoreHorizontal size={17} /></button>
      {open && (
        <div className="context-menu document-context">
          {onSync && <button onClick={() => { setOpen(false); onSync(); }}><RefreshCw size={14} />{t("syncFromSource")}</button>}
          {onRelink && <button onClick={() => { setOpen(false); onRelink(); }}><Link2 size={14} />{t("relinkSource")}</button>}
          <button onClick={() => { setOpen(false); onRename(); }}>重命名</button>
          <button className="danger" onClick={() => { setOpen(false); onDelete(); }}><Trash2 size={14} />移到废纸篓</button>
        </div>
      )}
    </div>
  );
}

function LegacyDocPlaceholder({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="legacy-doc-placeholder">
      <div className="legacy-doc-icon"><FileType2 size={36} /></div>
      <h2>{t("docPreviewUnsupported")}</h2>
      <p>{t("docPreviewHint")}</p>
      <button className="word-open-button" onClick={onOpen}>
        <ExternalLink size={15} /> {t("openWithDefaultApp")}
      </button>
    </div>
  );
}

function WordSyncBadge({ item }: { item: LibraryItemSummary }) {
  if (item.kind === "markdown" || item.syncStatus === "synced") return <span className="word-sync-badge synced">已同步</span>;
  const label = item.syncStatus === "sourceMissing"
    ? t("sourceMissing")
    : item.syncStatus === "outOfSync"
      ? t("outOfSync")
      : item.syncStatus === "unlinked"
        ? t("unlinkedSource")
        : "同步状态异常";
  return <span className={`word-sync-badge ${item.syncStatus || "unknown"}`}>{label}</span>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function PlusMenuIcon() {
  return <Clock3 size={15} />;
}

function showError(error: unknown, setter: (value: string) => void) {
  if (typeof error === "object" && error && "message" in error) {
    setter(String((error as { message: unknown }).message));
  } else if (typeof error === "string") {
    try {
      const parsed = JSON.parse(error) as { message?: string };
      setter(parsed.message || error);
    } catch {
      setter(error);
    }
  } else {
    setter("发生了一个未预期的问题");
  }
}
