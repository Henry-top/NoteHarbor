import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Backlink,
  HistoryEntry,
  IndexProgress,
  NoteDocument,
  NoteSummary,
  SaveResult,
  SearchHit,
  Vault
} from "../types";
import { makeNewNoteContent, splitFrontmatter } from "./markdown";

const isTauri = () => "__TAURI_INTERNALS__" in window;

export interface NativeApi {
  listVaults(): Promise<Vault[]>;
  registerVault(path: string): Promise<Vault>;
  removeVault(vaultId: string): Promise<void>;
  scanVault(vaultId: string): Promise<NoteSummary[]>;
  listNotes(vaultId?: string): Promise<NoteSummary[]>;
  createNote(vaultId: string, kind?: "regular" | "daily"): Promise<NoteDocument>;
  readNote(vaultId: string, path: string): Promise<NoteDocument>;
  saveNote(vaultId: string, path: string, content: string, expectedRevision: string, force?: boolean): Promise<SaveResult>;
  saveCopy(vaultId: string, path: string, content: string): Promise<NoteDocument>;
  renameNote(vaultId: string, path: string, newName: string): Promise<NoteDocument>;
  deleteNote(vaultId: string, path: string): Promise<void>;
  setNoteFlag(vaultId: string, path: string, flag: "favorite" | "pinned", value: boolean): Promise<void>;
  search(query: string, vaultIds?: string[]): Promise<SearchHit[]>;
  backlinks(vaultId: string, path: string): Promise<Backlink[]>;
  importAttachment(vaultId: string, originalName: string, bytes: number[]): Promise<string>;
  createSnapshot(vaultId: string, path: string, content: string): Promise<void>;
  listHistory(vaultId: string, path: string): Promise<HistoryEntry[]>;
  restoreHistory(historyId: number): Promise<NoteDocument>;
  onIndexProgress(handler: (progress: IndexProgress) => void): Promise<UnlistenFn>;
  onVaultChanged(handler: (vaultId: string) => void): Promise<UnlistenFn>;
}

const tauriApi: NativeApi = {
  listVaults: () => invoke("list_vaults"),
  registerVault: (path) => invoke("register_vault", { path }),
  removeVault: (vaultId) => invoke("remove_vault", { vaultId }),
  scanVault: (vaultId) => invoke("scan_vault", { vaultId }),
  listNotes: (vaultId) => invoke("list_notes", { vaultId }),
  createNote: (vaultId, kind = "regular") => invoke("create_note", { vaultId, kind }),
  readNote: (vaultId, path) => invoke("read_note", { vaultId, path }),
  saveNote: (vaultId, path, content, expectedRevision, force = false) =>
    invoke("save_note", { vaultId, path, content, expectedRevision, force }),
  saveCopy: (vaultId, path, content) => invoke("save_copy", { vaultId, path, content }),
  renameNote: (vaultId, path, newName) => invoke("rename_note", { vaultId, path, newName }),
  deleteNote: (vaultId, path) => invoke("delete_note", { vaultId, path }),
  setNoteFlag: (vaultId, path, flag, value) =>
    invoke("set_note_flag", { vaultId, path, flag, value }),
  search: (query, vaultIds) => invoke("search_notes", { query, vaultIds }),
  backlinks: (vaultId, path) => invoke("get_backlinks", { vaultId, path }),
  importAttachment: (vaultId, originalName, bytes) =>
    invoke("import_attachment", { vaultId, originalName, bytes }),
  createSnapshot: (vaultId, path, content) =>
    invoke("create_history_snapshot", { vaultId, path, content }),
  listHistory: (vaultId, path) => invoke("list_history", { vaultId, path }),
  restoreHistory: (historyId) => invoke("restore_history", { historyId }),
  onIndexProgress: async (handler) => listen<IndexProgress>("index://progress", (event) => handler(event.payload)),
  onVaultChanged: async (handler) => listen<{ vaultId: string }>("vault://changed", (event) => handler(event.payload.vaultId))
};

type MockNote = NoteDocument;
const demoVault: Vault = {
  id: "demo-vault",
  name: "示例资料库",
  path: "~/NoteHarbor Demo",
  available: true,
  noteCount: 3,
  indexedAt: new Date().toISOString()
};

const initialMockNotes: MockNote[] = [
  mockDocument("欢迎来到墨岛笔记.md", `---\nid: demo-welcome\ncreated: 2026-07-19T00:00:00.000Z\nupdated: 2026-07-19T00:00:00.000Z\ntags: ["开始", "墨岛"]\n---\n\n# 欢迎来到墨岛笔记\n\n你的文字，停泊在自己手中。\n\n## 从这里开始\n\n- 使用左侧资料库管理本地 Markdown 文件\n- 按 **⌘ K** 搜索全部资料库\n- 在源码、即时渲染和分栏模式间自由切换\n\n试试链接到 [[写作灵感]]，或者输入一个公式：$E = mc^2$。\n\n> 所有笔记都是普通的 Markdown 文件。\n`),
  mockDocument("写作灵感.md", `---\nid: demo-ideas\ncreated: 2026-07-19T00:01:00.000Z\nupdated: 2026-07-19T00:01:00.000Z\ntags: ["灵感"]\n---\n\n# 写作灵感\n\n好的工具应该在需要时出现，在思考时退后。\n\n## 待整理\n\n- [ ] 记录今天读到的一句话\n- [ ] 整理项目想法\n- [x] 建立自己的笔记港湾\n\n返回 [[欢迎来到墨岛笔记]]。\n`),
  mockDocument("Markdown 示例.md", `---\nid: demo-markdown\ncreated: 2026-07-19T00:02:00.000Z\nupdated: 2026-07-19T00:02:00.000Z\ntags: ["Markdown", "示例"]\n---\n\n# Markdown 示例\n\n| 能力 | 状态 |\n| --- | --- |\n| 表格 | ✓ |\n| 数学公式 | ✓ |\n| Mermaid | ✓ |\n\n\`\`\`mermaid\nflowchart LR\n  A[想法] --> B[笔记]\n  B --> C[连接]\n\`\`\`\n`)
];

let mockVaults: Vault[] = [demoVault];
let mockNotes = [...initialMockNotes];
let nextHistoryId = 1;
const mockHistory = new Map<number, { entry: HistoryEntry; content: string }>();

const mockApi: NativeApi = {
  async listVaults() {
    return mockVaults;
  },
  async registerVault(path) {
    const vault: Vault = {
      id: crypto.randomUUID(),
      name: path.split("/").filter(Boolean).at(-1) || "新资料库",
      path,
      available: true,
      noteCount: 0,
      indexedAt: new Date().toISOString()
    };
    mockVaults = [...mockVaults, vault];
    return vault;
  },
  async removeVault(vaultId) {
    mockVaults = mockVaults.filter((vault) => vault.id !== vaultId);
    mockNotes = mockNotes.filter((note) => note.vaultId !== vaultId);
  },
  async scanVault(vaultId) {
    return mockNotes.filter((note) => note.vaultId === vaultId);
  },
  async listNotes(vaultId) {
    return mockNotes.filter((note) => !vaultId || note.vaultId === vaultId);
  },
  async createNote(vaultId, kind = "regular") {
    const today = new Date().toISOString().slice(0, 10);
    const basePath = kind === "daily" ? `Daily/${today}.md` : "未命名笔记.md";
    const existing = mockNotes.find((note) => note.vaultId === vaultId && note.path === basePath);
    if (existing) return existing;
    const note = mockDocument(basePath, makeNewNoteContent(), vaultId);
    mockNotes = [note, ...mockNotes];
    return note;
  },
  async readNote(vaultId, path) {
    const note = mockNotes.find((item) => item.vaultId === vaultId && item.path === path);
    if (!note) throw { code: "NOTE_NOT_FOUND", message: "找不到这篇笔记" };
    note.lastOpened = new Date().toISOString();
    return { ...note };
  },
  async saveNote(vaultId, path, content, expectedRevision, force = false) {
    const index = mockNotes.findIndex((item) => item.vaultId === vaultId && item.path === path);
    if (index < 0) throw { code: "NOTE_NOT_FOUND", message: "找不到这篇笔记" };
    const current = mockNotes[index];
    if (!force && current.revision !== expectedRevision) {
      return {
        status: "conflict",
        conflict: {
          vaultId,
          path,
          expectedRevision,
          actualRevision: current.revision,
          diskContent: current.content
        }
      };
    }
    const updated = mockDocument(path, content, vaultId, current);
    mockNotes[index] = updated;
    return { status: "saved", document: { ...updated } };
  },
  async saveCopy(vaultId, path, content) {
    const stem = path.replace(/\.md$/i, "");
    const copy = mockDocument(`${stem} - 副本.md`, content, vaultId);
    mockNotes = [copy, ...mockNotes];
    return copy;
  },
  async renameNote(vaultId, path, newName) {
    const index = mockNotes.findIndex((note) => note.vaultId === vaultId && note.path === path);
    if (index < 0) throw { code: "NOTE_NOT_FOUND", message: "找不到这篇笔记" };
    const directory = path.includes("/") ? `${path.slice(0, path.lastIndexOf("/") + 1)}` : "";
    const nextPath = `${directory}${newName.replace(/\.md$/i, "")}.md`;
    mockNotes[index] = { ...mockNotes[index], path: nextPath, title: titleFromPath(nextPath) };
    return mockNotes[index];
  },
  async deleteNote(vaultId, path) {
    mockNotes = mockNotes.filter((note) => note.vaultId !== vaultId || note.path !== path);
  },
  async setNoteFlag(vaultId, path, flag, value) {
    const note = mockNotes.find((item) => item.vaultId === vaultId && item.path === path);
    if (note) {
      if (flag === "favorite") note.isFavorite = value;
      else note.isPinned = value;
    }
  },
  async search(query, vaultIds) {
    const needle = query.toLocaleLowerCase();
    return mockNotes
      .filter((note) => (!vaultIds?.length || vaultIds.includes(note.vaultId)))
      .filter((note) => `${note.title} ${note.content} ${note.tags.join(" ")}`.toLocaleLowerCase().includes(needle))
      .map((note) => ({
        vaultId: note.vaultId,
        path: note.path,
        title: note.title,
        snippet: splitFrontmatter(note.content).body.replace(/\n/g, " ").slice(0, 120),
        tags: note.tags,
        score: 1
      }));
  },
  async backlinks(vaultId, path) {
    const title = titleFromPath(path);
    return mockNotes
      .filter((note) => note.vaultId === vaultId && note.path !== path && note.content.includes(`[[${title}`))
      .map((note) => ({ vaultId, path: note.path, title: note.title, context: `链接到 [[${title}]]` }));
  },
  async importAttachment(_vaultId, originalName) {
    return `assets/${Date.now()}-${originalName}`;
  },
  async createSnapshot(vaultId, path, content) {
    const id = nextHistoryId++;
    const entry: HistoryEntry = {
      id,
      vaultId,
      path,
      createdAt: new Date().toISOString(),
      byteSize: new Blob([content]).size
    };
    mockHistory.set(id, { entry, content });
  },
  async listHistory(vaultId, path) {
    return [...mockHistory.values()]
      .map(({ entry }) => entry)
      .filter((entry) => entry.vaultId === vaultId && entry.path === path)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async restoreHistory(historyId) {
    const record = mockHistory.get(historyId);
    if (!record) throw { code: "HISTORY_NOT_FOUND", message: "历史版本不存在" };
    const result = await mockApi.saveNote(
      record.entry.vaultId,
      record.entry.path,
      record.content,
      "",
      true
    );
    if (!result.document) throw { code: "RESTORE_FAILED", message: "恢复失败" };
    return result.document;
  },
  async onIndexProgress() {
    return () => undefined;
  },
  async onVaultChanged() {
    return () => undefined;
  }
};

export const api: NativeApi = isTauri() ? tauriApi : mockApi;
export const runningInTauri = isTauri();

function mockDocument(
  path: string,
  content: string,
  vaultId = demoVault.id,
  previous?: Partial<NoteDocument>
): NoteDocument {
  const { frontmatter } = splitFrontmatter(content);
  return {
    vaultId,
    path,
    title: titleFromPath(path),
    tags: frontmatter.tags,
    modifiedAt: new Date().toISOString(),
    isFavorite: previous?.isFavorite ?? false,
    isPinned: previous?.isPinned ?? false,
    lastOpened: previous?.lastOpened ?? null,
    content,
    revision: `${Date.now()}-${content.length}-${Math.random()}`
  };
}

function titleFromPath(path: string): string {
  return path.split("/").at(-1)?.replace(/\.md$/i, "") || path;
}
