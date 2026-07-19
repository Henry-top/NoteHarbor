import { FileWarning, Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { api } from "../lib/api";

interface DocxPreviewProps {
  vaultId: string;
  path: string;
  revision?: number;
  onLoaded?: () => void;
}

type PreviewState = "loading" | "ready" | "error";

const MIN_ZOOM = 0.65;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;

export function DocxPreview({ vaultId, path, revision = 0, onLoaded }: DocxPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PreviewState>("loading");
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    revokeBlobUrls(shadow);
    const style = document.createElement("style");
    style.textContent = previewStyles;
    const body = document.createElement("div");
    body.className = "docx-body";
    shadow.replaceChildren(style, body);
    setState("loading");
    setError("");

    void api.readDocxPreview(vaultId, path)
      .then(async (bytes) => {
        const { renderAsync } = await import("docx-preview");
        return renderAsync(Uint8Array.from(bytes), body, body, {
          className: "noteharbor-docx",
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          renderAltChunks: false,
          renderComments: false,
          renderChanges: false,
          useBase64URL: false
        });
      })
      .then(() => {
        if (cancelled) {
          revokeBlobUrls(body);
          return;
        }
        sanitizeRenderedDocument(body);
        setState("ready");
        onLoaded?.();
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(errorMessage(reason));
        setState("error");
      });

    return () => {
      cancelled = true;
      revokeBlobUrls(body);
      if (shadow.contains(body)) shadow.replaceChildren();
    };
  }, [onLoaded, path, revision, vaultId]);

  useEffect(() => {
    const shadow = hostRef.current?.shadowRoot;
    const body = shadow?.querySelector<HTMLElement>(".docx-body");
    if (body) body.style.setProperty("zoom", String(zoom));
  }, [state, zoom]);

  const updateZoom = (next: number) => {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(next.toFixed(2)))));
  };

  return (
    <section className="docx-preview-shell" aria-busy={state === "loading"}>
      <div className="docx-preview-tools" aria-label="Word 预览缩放">
        <button className="icon-button" onClick={() => updateZoom(zoom - ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} title={t("zoomOut")}>
          <Minus size={15} />
        </button>
        <button className="docx-zoom-value" onClick={() => setZoom(1)} title={t("resetZoom")}>
          {Math.round(zoom * 100)}%
        </button>
        <button className="icon-button" onClick={() => updateZoom(zoom + ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} title={t("zoomIn")}>
          <Plus size={15} />
        </button>
        <button className="icon-button" onClick={() => setZoom(1)} disabled={zoom === 1} title={t("resetZoom")}>
          <RotateCcw size={14} />
        </button>
      </div>

      <div
        className="docx-preview-host"
        ref={hostRef}
        onClickCapture={(event) => {
          if (event.nativeEvent.composedPath().some((node) => node instanceof HTMLAnchorElement)) {
            event.preventDefault();
          }
        }}
      />

      {state === "loading" && (
        <div className="docx-preview-state">
          <span className="spinner" />
          <p>{t("wordPreviewLoading")}</p>
        </div>
      )}
      {state === "error" && (
        <div className="docx-preview-state error" role="alert">
          <FileWarning size={34} />
          <strong>{t("wordPreviewFailed")}</strong>
          <p>{error}</p>
        </div>
      )}
    </section>
  );
}

function revokeBlobUrls(root: ParentNode) {
  const urls = new Set<string>();
  root.querySelectorAll<HTMLElement>("[src], [href]").forEach((element) => {
    const value = element.getAttribute("src") || element.getAttribute("href");
    if (value?.startsWith("blob:")) urls.add(value);
  });
  root.querySelectorAll("style").forEach((style) => {
    for (const match of style.textContent?.matchAll(/blob:[^)"'\s]+/g) ?? []) {
      urls.add(match[0]);
    }
  });
  urls.forEach((url) => URL.revokeObjectURL(url));
}

function sanitizeRenderedDocument(root: ParentNode) {
  root.querySelectorAll<HTMLElement>("a").forEach((link) => {
    link.removeAttribute("href");
    link.removeAttribute("target");
    link.removeAttribute("rel");
  });
  root.querySelectorAll<HTMLElement>("[src]").forEach((element) => {
    const source = element.getAttribute("src");
    if (source && /^(?:https?:)?\/\//i.test(source)) element.removeAttribute("src");
  });
}

function errorMessage(error: unknown) {
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return typeof error === "string" ? error : "文件可能已损坏，或包含当前预览器不支持的格式。";
}

const previewStyles = `
  :host { display: block; min-height: 100%; }
  .docx-body { min-height: 100%; padding: 28px 30px 72px; box-sizing: border-box; transform-origin: top center; }
  .docx-body > .noteharbor-docx-wrapper { background: transparent; }
  .noteharbor-docx-wrapper > section.noteharbor-docx { margin: 0 auto 22px; box-shadow: 0 5px 24px rgba(20, 34, 43, .12); }
  a { color: inherit; cursor: default; text-decoration: none; }
  @media (max-width: 760px) { .docx-body { padding: 18px 12px 56px; } }
`;
