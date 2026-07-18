export type EditorMode = "source" | "live" | "split";
export type ThemeStyle = "modern" | "paper" | "glass";
export type ColorMode = "system" | "light" | "dark";

export interface Vault {
  id: string;
  name: string;
  path: string;
  available: boolean;
  noteCount: number;
  indexedAt?: string | null;
}

export interface NoteSummary {
  vaultId: string;
  path: string;
  title: string;
  tags: string[];
  modifiedAt: string;
  isFavorite: boolean;
  isPinned: boolean;
  lastOpened?: string | null;
}

export interface NoteDocument extends NoteSummary {
  content: string;
  revision: string;
}

export interface SearchHit {
  vaultId: string;
  path: string;
  title: string;
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
}
