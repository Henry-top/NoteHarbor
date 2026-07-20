import {
  CircleHelp,
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
import { DeleteItemDialog } from "./components/DeleteItemDialog";
import { DocxPreview } from "./components/DocxPreview";
import { EditorPane } from "./components/EditorPane";
import { HelpCenter } from "./components/HelpCenter";
import { HoverTip } from "./components/HoverTip";
import { ItemContextMenu } from "./components/ItemContextMenu";
import { MarkdownPreview } from "./components/MarkdownPreview";
import { ModeSwitcher } from "./components/ModeSwitcher";
import { OnboardingTour } from "./components/OnboardingTour";
import { RenameDialog } from "./components/RenameDialog";
import { RightPanel } from "./components/RightPanel";
import { SearchPalette } from "./components/SearchPalette";
import { Sidebar } from "./components/Sidebar";
import { t } from "./i18n";
import { api, runningInTauri } from "./lib/api";
import { applyAppearance, readAppearance, storeAppearance } from "./lib/appearance";
import { completeOnboarding, shouldShowOnboarding } from "./lib/help";
import { updateTags, wordCount } from "./lib/markdown";
import { platformFileLabels } from "./lib/platform";
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeStyle>(initialAppearance.current.theme);
  const [colorMode, setColorMode] = useState<ColorMode>(initialAppearance.current.colorMode);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [vaultMenu, setVaultMenu] = useState<{ vault: Vault; x: number; y: number } | null>(null);
  const [itemMenu, setItemMenu] = useState<{ item: LibraryItemSummary; x: number; y: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibraryItemSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [renameTarget, setRenameTarget] = useState<OpenItem | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
  const appearanceButtonRef = useRef<HTMLButtonElement>(null);
  const draftRef = useRef(draft);
  const currentRef = useRef(current);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const autoSaveTimerRef = useRef<number | null>(null);
  const renameActiveRef = useRef(false);
  const onboardingCheckedRef = useRef(false);
  const saveNowRef = useRef<(
    document: NoteDocument,
    content: string,
    quiet?: boolean,
    force?: boolean
  ) => Promise<NoteDocument | null>>(async () => null);

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

  const enqueueFileOperation = useCallback(<T,>(operation: () => Promise<T>) => {
    const task = operationQueueRef.current.then(operation, operation);
    operationQueueRef.current = task.then(
      () => undefined,
      () => undefined
    );
    return task;
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
    const reducedTransparency = window.matchMedia("(prefers-reduced-transparency: reduce)");
    const update = () => {
      applyAppearance(root, theme, colorMode, systemScheme.matches);
      const dark = colorMode === "system" ? systemScheme.matches : colorMode === "dark";
      void api.setWindowEffect(theme === "glass" && !reducedTransparency.matches, dark)
        .catch((error) => console.warn("无法切换窗口材质", error));
    };
    update();
    storeAppearance(localStorage, theme, colorMode);
    systemScheme.addEventListener("change", update);
    reducedTransparency.addEventListener("change", update);
    return () => {
      systemScheme.removeEventListener("change", update);
      reducedTransparency.removeEventListener("change", update);
    };
  }, [theme, colorMode]);

  useEffect(() => {
    if (loading || onboardingCheckedRef.current) return;
    onboardingCheckedRef.current = true;
    if (shouldShowOnboarding()) setOnboardingOpen(true);
  }, [loading]);

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
      if (event.key === "F1") {
        event.preventDefault();
        setAppearanceOpen(false);
        setHelpOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setAppearanceOpen(false);
        setHelpOpen(false);
        setVaultMenu(null);
        setItemMenu(null);
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

  const saveNow = useCallback((
    document: NoteDocument,
    content: string,
    quiet = false,
    force = false
  ): Promise<NoteDocument | null> => enqueueFileOperation(async () => {
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
          return null;
        }
        if (result.document) {
          setCurrent((value) => {
            if (!value || value.vaultId !== document.vaultId || value.path !== document.path) return value;
            currentRef.current = result.document!;
            return result.document!;
          });
          if (draftRef.current === content) setDirty(false);
          setSaveState("saved");
          void refreshItems();
          return result.document;
        }
        return null;
      } catch (error) {
        setSaveState("error");
        showError(error, setToast);
        return null;
      }
    }), [enqueueFileOperation, refreshItems]);
  saveNowRef.current = saveNow;

  useEffect(() => {
    if (!current || current.kind !== "markdown" || !dirty || conflict) return;
    const timer = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      if (!renameActiveRef.current) void saveNow(current, draft);
    }, 500);
    autoSaveTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (autoSaveTimerRef.current === timer) autoSaveTimerRef.current = null;
    };
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

  function openRenameDialog() {
    if (!current) return;
    setRenameTarget(current);
    setRenameError("");
    setRenameBusy(false);
  }

  async function openRenameDialogForItem(item: LibraryItemSummary) {
    try {
      const active = currentRef.current;
      const target = active?.vaultId === item.vaultId && active.path === item.path
        ? active
        : item.kind === "markdown"
          ? await api.readNote(item.vaultId, item.path)
          : item as OpenItem;
      setRenameTarget(target);
      setRenameError("");
      setRenameBusy(false);
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function renameCurrent(nextName: string) {
    const target = renameTarget;
    if (!target) return;
    const active = currentRef.current;
    const targetIsCurrent = active?.vaultId === target.vaultId && active.path === target.path;
    if (targetIsCurrent) {
      renameActiveRef.current = true;
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    }
    setRenameBusy(true);
    setRenameError("");
    try {
      const renamed = await enqueueFileOperation(async () => {
        if (target.kind === "markdown") {
          const active = currentRef.current;
          if (active?.kind === "markdown"
            && active.vaultId === target.vaultId
            && active.path === target.path) {
            const diskDocument = await api.readNote(target.vaultId, target.path);
            const latestDraft = draftRef.current;
            if (latestDraft !== diskDocument.content) {
              const saved = await api.saveNote(
                diskDocument.vaultId,
                diskDocument.path,
                latestDraft,
                diskDocument.revision
              );
              if (saved.status === "conflict" && saved.conflict) {
                throw {
                  code: "FILE_CONFLICT",
                  message: "文件已在其他软件中修改，请先处理内容冲突再重命名"
                };
              }
              if (!saved.document) {
                throw { code: "SAVE_FAILED", message: "保存当前内容失败，未执行重命名" };
              }
            }
          }
          return api.renameNote(target.vaultId, target.path, nextName);
        }
        return api.renameLibraryFile(target.vaultId, target.path, nextName);
      });

      if (targetIsCurrent) {
        setCurrent(renamed as OpenItem);
        currentRef.current = renamed as OpenItem;
      }
      if (targetIsCurrent && renamed.kind === "markdown") {
        const document = renamed as NoteDocument;
        setDraft(document.content);
        draftRef.current = document.content;
        setDirty(false);
        setSaveState("saved");
        const [nextBacklinks, nextHistory] = await Promise.all([
          api.backlinks(document.vaultId, document.path),
          api.listHistory(document.vaultId, document.path)
        ]);
        setBacklinks(nextBacklinks);
        setHistory(nextHistory);
      }
      setTabs((items) => items.map((tab) =>
        tab.vaultId === target.vaultId && tab.path === target.path
          ? { vaultId: renamed.vaultId, path: renamed.path, title: renamed.title, kind: renamed.kind }
          : tab
      ));
      setRenameTarget(null);
      setToast(`已重命名为“${renamed.title}”`);
      await refreshItems();
    } catch (error) {
      setRenameError(errorMessage(error));
    } finally {
      if (targetIsCurrent) renameActiveRef.current = false;
      setRenameBusy(false);
    }
  }

  function requestDelete(item: LibraryItemSummary) {
    setDeleteTarget(item);
    setDeleteError("");
    setDeleteBusy(false);
  }

  async function confirmDeleteItem() {
    const target = deleteTarget;
    if (!target) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      const active = currentRef.current;
      const targetIsCurrent = active?.vaultId === target.vaultId && active.path === target.path;
      if (targetIsCurrent && active?.kind === "markdown" && draftRef.current !== active.content) {
        const saved = await saveNow(active, draftRef.current, true);
        if (!saved) throw new Error("保存当前内容失败，未执行删除");
      }
      if (target.kind === "markdown") await api.deleteNote(target.vaultId, target.path);
      else await api.deleteLibraryFile(target.vaultId, target.path);

      const remainingTabs = tabs.filter((tab) =>
        tab.vaultId !== target.vaultId || tab.path !== target.path
      );
      setTabs(remainingTabs);
      if (targetIsCurrent) {
        setCurrent(null);
        currentRef.current = null;
        setDraft("");
        draftRef.current = "";
        setDirty(false);
        setBacklinks([]);
        setHistory([]);
        const next = remainingTabs.at(-1);
        const nextItem = next && items.find((item) =>
          item.vaultId === next.vaultId && item.path === next.path
        );
        if (nextItem) await openItem(nextItem);
      }
      setDeleteTarget(null);
      setToast(`已${platformFileLabels(navigator.platform).trash}“${target.title}”`);
      await refreshItems();
    } catch (error) {
      setDeleteError(errorMessage(error));
    } finally {
      setDeleteBusy(false);
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

  async function duplicateNote(item: LibraryItemSummary) {
    if (item.kind !== "markdown") return;
    try {
      const active = currentRef.current;
      let document: NoteDocument;
      if (active?.kind === "markdown" && active.vaultId === item.vaultId && active.path === item.path) {
        document = active;
        if (draftRef.current !== active.content) {
          const saved = await saveNow(active, draftRef.current, true);
          if (!saved) throw new Error("保存当前内容失败，未复制笔记");
          document = saved;
        }
      } else {
        document = await api.readNote(item.vaultId, item.path);
      }
      const copy = await api.saveCopy(document.vaultId, document.path, document.content);
      await refreshItems();
      await openItem(copy);
      setToast(`已创建“${copy.title}”`);
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function copyItemText(text: string, successMessage: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        try {
          textarea.select();
          if (!document.execCommand("copy")) throw new Error("系统拒绝了复制操作");
        } finally {
          textarea.remove();
        }
      }
      setToast(successMessage);
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function toggleItemFlag(item: LibraryItemSummary, flag: "favorite" | "pinned") {
    try {
      const field = flag === "favorite" ? "isFavorite" : "isPinned";
      const value = !item[field];
      await api.setNoteFlag(item.vaultId, item.path, flag, value);
      setItems((existing) => existing.map((candidate) =>
        candidate.vaultId === item.vaultId && candidate.path === item.path
          ? { ...candidate, [field]: value }
          : candidate
      ));
      setCurrent((active) => {
        if (!active || active.vaultId !== item.vaultId || active.path !== item.path) return active;
        const updated = { ...active, [field]: value };
        currentRef.current = updated;
        return updated;
      });
      setToast(value ? `已${flag === "favorite" ? "收藏" : "置顶"}` : `已取消${flag === "favorite" ? "收藏" : "置顶"}`);
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function revealItem(item: LibraryItemSummary) {
    try {
      await api.revealLibraryItem(item.vaultId, item.path);
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function openWordItem(item: LibraryItemSummary) {
    if (item.kind === "markdown") return;
    try {
      await api.openLibraryFile(item.vaultId, item.path);
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function syncWordItem(item: LibraryItemSummary) {
    if (item.kind === "markdown") return;
    try {
      const synced = await api.syncLibraryFile(item.vaultId, item.path);
      setItems((existing) => existing.map((candidate) =>
        candidate.vaultId === synced.vaultId && candidate.path === synced.path ? synced : candidate
      ));
      setCurrent((active) => {
        if (!active || active.vaultId !== synced.vaultId || active.path !== synced.path) return active;
        const updated = synced as OpenItem;
        currentRef.current = updated;
        return updated;
      });
      setPreviewRevision((value) => value + 1);
      setToast("已从源文件重新同步");
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function relinkWordItem(item: LibraryItemSummary) {
    if (item.kind === "markdown") return;
    try {
      if (!runningInTauri) throw new Error("请在桌面应用中重新关联源文件");
      const selected = await open({
        directory: false,
        multiple: false,
        title: "选择新的 Word 源文件",
        filters: [{ name: "Word 文档", extensions: [item.kind] }]
      });
      if (typeof selected !== "string") return;
      const confirmed = window.confirm("重新关联后，新源文件会覆盖资料库中的当前副本。是否继续？");
      if (!confirmed) return;
      const relinked = await api.relinkLibraryFile(item.vaultId, item.path, selected);
      setItems((existing) => existing.map((candidate) =>
        candidate.vaultId === relinked.vaultId && candidate.path === relinked.path ? relinked : candidate
      ));
      setCurrent((active) => {
        if (!active || active.vaultId !== relinked.vaultId || active.path !== relinked.path) return active;
        const updated = relinked as OpenItem;
        currentRef.current = updated;
        return updated;
      });
      setPreviewRevision((value) => value + 1);
      setToast("已重新关联并同步源文件");
    } catch (error) {
      showError(error, setToast);
    }
  }

  async function toggleFlag(flag: "favorite" | "pinned") {
    if (!current) return;
    await toggleItemFlag(current, flag);
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
  const primaryShortcut = navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl+";

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
          onItemContextMenu={(item, position) => {
            const menuWidth = 218;
            const menuHeight = item.kind === "markdown" ? 330 : 390;
            setItemMenu({
              item,
              x: Math.max(8, Math.min(position.x, window.innerWidth - menuWidth - 8)),
              y: Math.max(8, Math.min(position.y, window.innerHeight - menuHeight - 8))
            });
          }}
        />
      )}

      <main className="workspace">
        <header className="workspace-topbar window-drag" data-tauri-drag-region>
          {!sidebarOpen && (
            <HoverTip label="显示侧栏" detail="打开资料库和文件列表" shortcut={`${primaryShortcut}\\`}>
              <button className="icon-button" onClick={() => setSidebarOpen(true)}>
                <Menu size={18} />
              </button>
            </HoverTip>
          )}
          <div className="breadcrumbs">
            {activeVault && <span>{activeVault.name}</span>}
            {current && <><i>/</i><strong>{current.title}</strong></>}
          </div>
          <div className="topbar-actions">
            <HoverTip label="搜索全部资料库" detail="查找笔记内容、标签和文件" shortcut={`${primaryShortcut}K`}>
              <button className="icon-button" onClick={() => setSearchOpen(true)}><Search size={17} /></button>
            </HoverTip>
            <HoverTip label="使用帮助" detail="搜索操作说明或重新查看新手引导" shortcut="F1">
              <button
                className={`icon-button ${helpOpen ? "active" : ""}`}
                onClick={() => {
                  setAppearanceOpen(false);
                  setHelpOpen(true);
                }}
              >
                <CircleHelp size={17} />
              </button>
            </HoverTip>
            <HoverTip label="外观" detail="切换主题以及明亮、深色模式">
              <button
                ref={appearanceButtonRef}
                className={`icon-button ${appearanceOpen ? "active" : ""}`}
                aria-expanded={appearanceOpen}
                onClick={() => setAppearanceOpen((value) => !value)}
              >
                <Palette size={17} />
              </button>
            </HoverTip>
            {current?.kind === "markdown" && (
              <HoverTip label="笔记信息" detail="查看标签、大纲、反向链接和历史">
                <button className={`icon-button ${rightPanelOpen ? "active" : ""}`} onClick={() => setRightPanelOpen((value) => !value)}>
                  <PanelRight size={17} />
                </button>
              </HoverTip>
            )}
          </div>
          <AppearancePopover
            open={appearanceOpen}
            theme={theme}
            colorMode={colorMode}
            onThemeChange={changeTheme}
            onColorModeChange={changeColorMode}
            onClose={() => setAppearanceOpen(false)}
            anchorRef={appearanceButtonRef}
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
                <HoverTip label={current.isPinned ? "取消置顶" : "置顶"} detail="在侧栏的置顶列表中快速找到">
                  <button className={`icon-button ${current.isPinned ? "active" : ""}`} onClick={() => void toggleFlag("pinned")}><Pin size={16} /></button>
                </HoverTip>
                <HoverTip label={current.isFavorite ? "取消收藏" : "收藏"} detail="加入侧栏的收藏列表">
                  <button className={`icon-button ${current.isFavorite ? "active" : ""}`} onClick={() => void toggleFlag("favorite")}><Heart size={16} /></button>
                </HoverTip>
                <DocumentMenu
                  onRename={openRenameDialog}
                  onDelete={() => current && requestDelete(current)}
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

      <HelpCenter
        open={helpOpen}
        platform={navigator.platform}
        onClose={() => setHelpOpen(false)}
        onStartTour={() => {
          setHelpOpen(false);
          setOnboardingOpen(true);
        }}
      />

      <OnboardingTour
        open={onboardingOpen}
        onFinish={() => {
          completeOnboarding();
          setOnboardingOpen(false);
        }}
      />

      <RenameDialog
        open={Boolean(renameTarget)}
        currentName={renameTarget?.title || ""}
        kind={renameTarget?.kind || "markdown"}
        busy={renameBusy}
        error={renameError}
        onCancel={() => {
          if (renameBusy) return;
          setRenameTarget(null);
          setRenameError("");
        }}
        onSubmit={(name) => void renameCurrent(name)}
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

      {itemMenu && (
        <ItemContextMenu
          item={itemMenu.item}
          x={itemMenu.x}
          y={itemMenu.y}
          labels={platformFileLabels(navigator.platform)}
          onClose={() => setItemMenu(null)}
          actions={{
            onRename: () => void openRenameDialogForItem(itemMenu.item),
            onDuplicate: itemMenu.item.kind === "markdown"
              ? () => void duplicateNote(itemMenu.item)
              : undefined,
            onCopyWikiLink: itemMenu.item.kind === "markdown"
              ? () => void copyItemText(`[[${itemMenu.item.title}]]`, "已复制笔记链接")
              : undefined,
            onCopyPath: () => void copyItemText(itemMenu.item.path, "已复制相对路径"),
            onTogglePinned: () => void toggleItemFlag(itemMenu.item, "pinned"),
            onToggleFavorite: () => void toggleItemFlag(itemMenu.item, "favorite"),
            onReveal: () => void revealItem(itemMenu.item),
            onOpenExternal: itemMenu.item.kind === "markdown"
              ? undefined
              : () => void openWordItem(itemMenu.item),
            onSync: itemMenu.item.kind !== "markdown" && itemMenu.item.sourcePath
              ? () => void syncWordItem(itemMenu.item)
              : undefined,
            onRelink: itemMenu.item.kind === "markdown"
              ? undefined
              : () => void relinkWordItem(itemMenu.item),
            onDelete: () => requestDelete(itemMenu.item)
          }}
        />
      )}

      <DeleteItemDialog
        item={deleteTarget}
        actionLabel={platformFileLabels(navigator.platform).trash}
        busy={deleteBusy}
        error={deleteError}
        onCancel={() => {
          if (deleteBusy) return;
          setDeleteTarget(null);
          setDeleteError("");
        }}
        onConfirm={() => void confirmDeleteItem()}
      />

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
      <HoverTip label="更多操作" detail="重命名、同步或移到废纸篓" side="top">
        <button className="icon-button" onClick={() => setOpen((value) => !value)}><MoreHorizontal size={17} /></button>
      </HoverTip>
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
  setter(errorMessage(error));
}

function errorMessage(error: unknown) {
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  if (typeof error === "string") {
    try {
      const parsed = JSON.parse(error) as { message?: string };
      return parsed.message || error;
    } catch {
      return error;
    }
  }
  return "发生了一个未预期的问题";
}
