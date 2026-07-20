export type EditorMode = "source" | "live" | "split";
export type ThemeStyle = "modern" | "paper" | "glass";
export type ColorMode = "system" | "light" | "dark";
export type LibraryItemKind = "markdown" | "txt" | "docx" | "doc" | "pdf" | "file";
export type FileRole = "attachment" | "library";
export type WordSyncStatus = "synced" | "sourceMissing" | "outOfSync" | "unlinked" | "syncError";

export interface Vault {
  id: string;
  name: string;
  path: string;
  available: boolean;
  noteCount: number;
  indexedAt?: string | null;
}

export interface LibraryItemSummary {
  vaultId: string;
  path: string;
  title: string;
  kind: LibraryItemKind;
  tags: string[];
  modifiedAt: string;
  isFavorite: boolean;
  isPinned: boolean;
  lastOpened?: string | null;
  sourcePath?: string | null;
  sizeBytes?: number;
  syncStatus?: WordSyncStatus;
  lastSyncedAt?: string | null;
  role?: FileRole;
  mimeType?: string | null;
  originalName?: string | null;
}

export type NoteSummary = LibraryItemSummary;

export interface NoteDocument extends LibraryItemSummary {
  kind: "markdown" | "txt";
  content: string;
  revision: string;
}

export interface WordDocument extends LibraryItemSummary {
  kind: "docx" | "doc" | "pdf" | "file";
}

export type OpenItem = NoteDocument | WordDocument;

export interface SearchHit {
  vaultId: string;
  path: string;
  title: string;
  kind?: LibraryItemKind;
  snippet: string;
  tags: string[];
  score: number;
}

export interface Backlink {
  vaultId: string;
  path: string;
  title: string;
  context: string;
}

export interface HistoryEntry {
  id: number;
  vaultId: string;
  path: string;
  createdAt: string;
  byteSize: number;
}

export interface FileConflict {
  vaultId: string;
  path: string;
  expectedRevision: string;
  actualRevision: string;
  diskContent: string;
}

export interface SaveResult {
  status: "saved" | "conflict";
  document?: NoteDocument;
  conflict?: FileConflict;
}

export interface IndexProgress {
  vaultId: string;
  scanned: number;
  total: number;
  finished: boolean;
}

export interface AppError {
  code: string;
  message: string;
}

export interface OutlineItem {
  level: number;
  text: string;
  line: number;
}

export interface OpenTab {
  vaultId: string;
  path: string;
  title: string;
  kind: LibraryItemKind;
  transient?: boolean;
}

export interface VaultFolder {
  vaultId: string;
  path: string;
  name: string;
  protected: boolean;
}

export interface DroppedPathInfo {
  path: string;
  name: string;
  isDirectory: boolean;
  kind?: LibraryItemKind | null;
  sizeBytes: number;
  accepted: boolean;
  reason?: string | null;
}

export interface ImportBatchResult {
  imported: LibraryItemSummary[];
  insertedLinks: string[];
  rejected: string[];
}

export interface FileReference {
  vaultId: string;
  sourcePath: string;
  sourceTitle: string;
  targetPath: string;
  rawTarget: string;
  linkType: "image" | "link";
  resolved: boolean;
  referenceCount: number;
  role: FileRole;
  kind: LibraryItemKind;
}
