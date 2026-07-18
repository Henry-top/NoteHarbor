import {
  Clock3,
  Command,
  Heart,
  Menu,
  MoreHorizontal,
  PanelRight,
  Palette,
  Pin,
  Search,
  Trash2,
  X
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppearancePopover } from "./components/AppearancePopover";
import { ConflictDialog } from "./components/ConflictDialog";
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
  NoteDocument,
  NoteSummary,
  OpenTab,
  SearchHit,
  ThemeStyle,
  Vault
} from "./types";

type SaveState = "saved" | "saving" | "error";

export default function App() {
  const initialAppearance = useRef(readAppearance());
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [current, setCurrent] = useState<NoteDocument | null>(null);
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

  const refreshNotes = useCallback(async () => {
    try {
      const next = await api.listNotes();
      setNotes(next);
      setVaults((items) =>
        items.map((vault) => ({
          ...vault,
          noteCount: next.filter((note) => note.vaultId === vault.id).length
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
        if (!cancelled) setNotes(scanned.flat());
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
      window.setTimeout(() => void refreshNotes(), 200);
    }).then((unlisten) => { unlistenChanged = unlisten; });

    return () => {
      cancelled = true;
      unlistenProgress?.();
      unlistenChanged?.();
    };
  }, [refreshNotes]);

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

  const openNote = useCallback(async (summary: Pick<NoteSummary, "vaultId" | "path" | "title">) => {
    try {
      if (dirty && currentRef.current) {
        await saveNowRef.current(currentRef.current, draftRef.current, true);
      }
      const document = await api.readNote(summary.vaultId, summary.path);
      setCurrent(document);
      setDraft(document.content);
      setDirty(false);
      setSaveState("saved");
      setActiveVaultId(document.vaultId);
      const storedMode = localStorage.getItem(`noteharbor:mode:${document.vaultId}:${document.path}`) as EditorMode | null;
      setMode(storedMode || "live");
      setTabs((existing) => {
        const tab = { vaultId: document.vaultId, path: document.path, title: document.title };
        return existing.some((item) => item.vaultId === tab.vaultId && item.path === tab.path)
          ? existing
          : [...existing, tab];
      });
      const [nextBacklinks, nextHistory] = await Promise.all([
        api.backlinks(document.vaultId, document.path),
        api.listHistory(document.vaultId, document.path)
      ]);
      setBacklinks(nextBacklinks);
      setHistory(nextHistory);
      void refreshNotes();
    } catch (error) {
      showError(error, setToast);
    }
  }, [dirty, refreshNotes]);

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
        void refreshNotes();
      }
    } catch (error) {
      setSaveState("error");
      showError(error, setToast);
    }
  }, [refreshNotes]);
  saveNowRef.current = saveNow;

  useEffect(() => {
    if (!current || !dirty || conflict) return;
    const timer = window.setTimeout(() => void saveNow(current, draft), 500);
    return () => window.clearTimeout(timer);
  }, [current, draft, dirty, conflict, saveNow]);

  useEffect(() => {
    if (!current || dirty) return;
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
      if (!selected || Array.isArray(selected)) return;
      const vault = await api.registerVault(selected);
      setVaults((items) => [...items.filter((item) => item.id !== vault.id), vault]);
      setActiveVaultId(vault.id);
      const scanned = await api.scanVault(vault.id);
      setNotes((items) => [...items.filter((note) => note.vaultId !== vault.id), ...scanned]);
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function createNote(vaultId: string, kind: "regular" | "daily" = "regular") {
    try {
      const document = await api.createNote(vaultId, kind);
      await refreshNotes();
      await openNote(document);
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function closeTab(tab: OpenTab) {
    if (current?.vaultId === tab.vaultId && current.path === tab.path && dirty) {
      await saveNow(current, draft, true);
    }
    setTabs((items) => items.filter((item) => item.vaultId !== tab.vaultId || item.path !== tab.path));
    if (current?.vaultId === tab.vaultId && current.path === tab.path) {
      const remaining = tabs.filter((item) => item.vaultId !== tab.vaultId || item.path !== tab.path);
      const next = remaining.at(-1);
      if (next) await openNote(next);
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
    const next = window.prompt("新的笔记名称", current.title);
    if (!next || next.trim() === current.title) return;
    try {
      const renamed = await api.renameNote(current.vaultId, current.path, next.trim());
      setCurrent(renamed);
      setDraft(renamed.content);
      setTabs((items) => items.map((tab) =>
        tab.vaultId === current.vaultId && tab.path === current.path
          ? { vaultId: renamed.vaultId, path: renamed.path, title: renamed.title }
          : tab
      ));
      await refreshNotes();
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function deleteCurrent() {
    if (!current || !window.confirm(`将“${current.title}”移到废纸篓？`)) return;
    try {
      await api.deleteNote(current.vaultId, current.path);
      const tab = { vaultId: current.vaultId, path: current.path, title: current.title };
      await closeTab(tab);
      await refreshNotes();
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function removeVault(vault: Vault) {
    if (!window.confirm(`从墨岛笔记中移除“${vault.name}”？\n文件不会被删除。`)) return;
    try {
      await api.removeVault(vault.id);
      setVaults((items) => items.filter((item) => item.id !== vault.id));
      setNotes((items) => items.filter((note) => note.vaultId !== vault.id));
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
    await refreshNotes();
  }

  async function openWikiLink(target: string) {
    if (!current) return;
    const normalized = target.replace(/\.md$/i, "");
    const note = notes.find((item) =>
      item.vaultId === current.vaultId &&
      (item.title === normalized || item.path.replace(/\.md$/i, "") === normalized)
    );
    if (note) await openNote(note);
    else setToast(`本资料库中没有找到“${target}”`);
  }

  async function importAttachment(file: File) {
    if (!current) throw new Error("请先打开一篇笔记");
    const bytes = [...new Uint8Array(await file.arrayBuffer())];
    const stored = await api.importAttachment(current.vaultId, file.name || "image.png", bytes);
    const depth = Math.max(0, current.path.split("/").length - 1);
    return `${"../".repeat(depth)}${stored}`;
  }

  function selectSearchHit(hit: SearchHit) {
    setSearchOpen(false);
    setSearchQuery("");
    void openNote({
      vaultId: hit.vaultId,
      path: hit.path,
      title: hit.title
    });
  }

  function changeMode(next: EditorMode) {
    setMode(next);
    if (current) localStorage.setItem(`noteharbor:mode:${current.vaultId}:${current.path}`, next);
  }

  const currentSummary = current
    ? notes.find((note) => note.vaultId === current.vaultId && note.path === current.path)
    : undefined;
  const statusText = saveState === "saving" ? t("saving") : saveState === "error" ? t("saveFailed") : t("saved");
  const activeVault = vaults.find((vault) => vault.id === activeVaultId);
  const totalLines = draft ? draft.split("\n").length : 0;
  const showRightPanel = Boolean(current && rightPanelOpen);

  return (
    <div className={`app-shell ${runningInTauri && navigator.platform.toLowerCase().includes("mac") ? "native-macos" : ""} ${sidebarOpen ? "" : "sidebar-closed"} ${showRightPanel ? "" : "right-closed"}`}>
      {sidebarOpen && (
        <Sidebar
          vaults={vaults}
          notes={notes}
          activeVaultId={activeVaultId}
          activePath={current?.path}
          indexProgress={indexProgress}
          onSelectNote={(note) => void openNote(note)}
          onActivateVault={setActiveVaultId}
          onAddVault={() => void addVault()}
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
            {current && (
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
              <button className={`tab ${active ? "active" : ""}`} key={`${tab.vaultId}:${tab.path}`} onClick={() => void openNote(tab)}>
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
                <span className={`save-status ${saveState}`}>{statusText}</span>
              </div>
              <div className="document-actions">
                <ModeSwitcher mode={mode} onChange={changeMode} />
                <span className="toolbar-divider" />
                <button className={`icon-button ${current.isPinned ? "active" : ""}`} onClick={() => void toggleFlag("pinned")} title={t("pinned")}><Pin size={16} /></button>
                <button className={`icon-button ${current.isFavorite ? "active" : ""}`} onClick={() => void toggleFlag("favorite")} title={t("favorites")}><Heart size={16} /></button>
                <DocumentMenu onRename={() => void renameCurrent()} onDelete={() => void deleteCurrent()} />
              </div>
            </div>

            <div className={`document-stage mode-${mode}`}>
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
            </div>

            <footer className="statusbar">
              <span>{current.path}</span>
              <div>
                <span>{wordCount(draft)} {t("words")}</span>
                <span>{totalLines} {t("lines")}</span>
                <span>Markdown</span>
              </div>
            </footer>
          </>
        )}
      </main>

      {rightPanelOpen && current && (
        <RightPanel
          document={{ ...current, content: draft, ...(currentSummary || {}) }}
          backlinks={backlinks}
          history={history}
          onClose={() => setRightPanelOpen(false)}
          onOpenBacklink={(backlink) => void openNote({
            vaultId: backlink.vaultId,
            path: backlink.path,
            title: backlink.title
          })}
          onRestore={(entry) => void api.restoreHistory(entry.id).then((restored) => {
            setCurrent(restored);
            setDraft(restored.content);
            setDirty(false);
            setToast("已恢复历史版本");
            void refreshNotes();
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
          if (!conflict || !current) return;
          setDraft(conflict.diskContent);
          setCurrent({ ...current, content: conflict.diskContent, revision: conflict.actualRevision });
          setDirty(false);
          setConflict(null);
          setSaveState("saved");
        }}
        onKeepMine={() => {
          if (!current) return;
          setConflict(null);
          void saveNow(current, draft, false, true);
        }}
        onSaveCopy={() => {
          if (!current) return;
          void api.saveCopy(current.vaultId, current.path, draft).then((copy) => {
            setConflict(null);
            void refreshNotes();
            void openNote(copy);
          }).catch((error) => showError(error, setToast));
        }}
      />

      {vaultMenu && (
        <>
          <div className="menu-scrim" onClick={() => setVaultMenu(null)} />
          <div className="context-menu" style={{ left: vaultMenu.x - 178, top: vaultMenu.y + 4 }}>
            <button onClick={() => void createNote(vaultMenu.vault.id)}><PlusMenuIcon />{t("newNote")}</button>
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

function DocumentMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="document-menu-wrap">
      <button className="icon-button" onClick={() => setOpen((value) => !value)}><MoreHorizontal size={17} /></button>
      {open && (
        <div className="context-menu document-context">
          <button onClick={() => { setOpen(false); onRename(); }}>重命名</button>
          <button className="danger" onClick={() => { setOpen(false); onDelete(); }}><Trash2 size={14} />移到废纸篓</button>
        </div>
      )}
    </div>
  );
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
