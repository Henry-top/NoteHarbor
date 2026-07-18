import { FileText, Search, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { t } from "../i18n";
import type { SearchHit, Vault } from "../types";

interface SearchPaletteProps {
  open: boolean;
  query: string;
  results: SearchHit[];
  searching: boolean;
  vaults: Vault[];
  onQueryChange: (query: string) => void;
  onSelect: (hit: SearchHit) => void;
  onClose: () => void;
}

export function SearchPalette({
  open,
  query,
  results,
  searching,
  vaults,
  onQueryChange,
  onSelect,
  onClose
}: SearchPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  if (!open) return null;

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="search-palette" role="dialog" aria-label={t("search")}>
        <div className="palette-input">
          <Search size={20} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "Enter" && results[0]) onSelect(results[0]);
            }}
            placeholder={t("searchPlaceholder")}
          />
          {searching && <span className="spinner" />}
          <button className="icon-button" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="search-results">
          {query && !searching && results.length === 0 && (
            <div className="search-empty">{t("noSearchResults")}</div>
          )}
          {results.map((hit) => (
            <button key={`${hit.vaultId}:${hit.path}`} onClick={() => onSelect(hit)}>
              <FileText size={17} />
              <div>
                <div className="search-title-line">
                  <strong>{hit.title}</strong>
                  <span>{vaults.find((vault) => vault.id === hit.vaultId)?.name}</span>
                </div>
                <p>{hit.snippet}</p>
                {hit.tags.length > 0 && (
                  <div className="mini-tags">{hit.tags.slice(0, 4).map((tag) => <span key={tag}>#{tag}</span>)}</div>
                )}
              </div>
            </button>
          ))}
        </div>
        <footer>
          <span><kbd>↵</kbd> 打开</span>
          <span><kbd>Esc</kbd> 关闭</span>
          <span>{results.length} 个结果</span>
        </footer>
      </section>
    </div>
  );
}
