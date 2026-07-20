import { ChevronLeft, ChevronRight, ExternalLink, Search, ZoomIn, ZoomOut } from "lucide-react";
import {
  GlobalWorkerOptions,
  TextLayer,
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy
} from "pdfjs-dist";
import { useEffect, useMemo, useRef, useState } from "react";
import "pdfjs-dist/web/pdf_viewer.css";
import { api } from "../lib/api";
import type { LibraryItemSummary } from "../types";

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface PdfPreviewProps {
  item: LibraryItemSummary;
  onOpenExternal: () => void;
}

export function PdfPreview({ item, onOpenExternal }: PdfPreviewProps) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<number[]>([]);
  const [status, setStatus] = useState("正在载入 PDF…");
  const pagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof getDocument> | undefined;
    setDocument(null);
    setStatus("正在载入 PDF…");
    void api.readPdfPreview(item.vaultId, item.path)
      .then((bytes) => {
        if (cancelled) return;
        loadingTask = getDocument({ data: Uint8Array.from(bytes) });
        return loadingTask.promise;
      })
      .then((pdf) => {
        if (!pdf || cancelled) return;
        setDocument(pdf);
        setStatus("");
      })
      .catch((error) => {
        if (!cancelled) setStatus(readError(error));
      });
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
      setDocument(null);
    };
  }, [item.path, item.vaultId]);

  useEffect(() => {
    if (!document || !query.trim()) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const found: number[] = [];
      const needle = query.trim().toLocaleLowerCase();
      for (let index = 1; index <= document.numPages; index += 1) {
        const pdfPage = await document.getPage(index);
        const content = await pdfPage.getTextContent();
        const text = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .toLocaleLowerCase();
        if (text.includes(needle)) found.push(index);
        pdfPage.cleanup();
      }
      if (!cancelled) setMatches(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [document, query]);

  const pageNumbers = useMemo(
    () => document ? Array.from({ length: document.numPages }, (_, index) => index + 1) : [],
    [document]
  );

  const jumpTo = (next: number) => {
    if (!document) return;
    const normalized = Math.max(1, Math.min(document.numPages, next));
    setPage(normalized);
    pagesRef.current
      ?.querySelector<HTMLElement>(`[data-pdf-page="${normalized}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="pdf-preview">
      <div className="document-preview-toolbar">
        <div className="pdf-page-controls">
          <button onClick={() => jumpTo(page - 1)} disabled={page <= 1} title="上一页"><ChevronLeft size={16} /></button>
          <input
            aria-label="当前页码"
            value={page}
            inputMode="numeric"
            onChange={(event) => setPage(Number(event.target.value) || 1)}
            onKeyDown={(event) => event.key === "Enter" && jumpTo(page)}
          />
          <span>/ {document?.numPages ?? "—"}</span>
          <button onClick={() => jumpTo(page + 1)} disabled={!document || page >= document.numPages} title="下一页"><ChevronRight size={16} /></button>
        </div>
        <div className="pdf-search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="在 PDF 中查找" />
          {query && <span>{matches.length} 页</span>}
        </div>
        <div className="pdf-zoom">
          <button onClick={() => setZoom((value) => Math.max(.5, value - .1))} title="缩小"><ZoomOut size={16} /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((value) => Math.min(2, value + .1))} title="放大"><ZoomIn size={16} /></button>
        </div>
        <button className="open-external-button" onClick={onOpenExternal}><ExternalLink size={15} /> 默认软件打开</button>
      </div>
      {status && (
        <div className="document-preview-state">
          <strong>PDF 预览</strong>
          <p>{status}</p>
          <button onClick={onOpenExternal}><ExternalLink size={16} /> 使用本地默认软件打开</button>
        </div>
      )}
      {document && (
        <div
          className="pdf-pages"
          ref={pagesRef}
          onScroll={(event) => {
            const container = event.currentTarget;
            const elements = [...container.querySelectorAll<HTMLElement>("[data-pdf-page]")];
            const nearest = elements
              .map((element) => ({ element, distance: Math.abs(element.offsetTop - container.scrollTop - 18) }))
              .sort((a, b) => a.distance - b.distance)[0];
            const value = Number(nearest?.element.dataset.pdfPage);
            if (value) setPage(value);
          }}
        >
          {pageNumbers.map((number) => (
            <PdfPage
              key={number}
              document={document}
              number={number}
              scale={zoom}
              matched={matches.includes(number)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PdfPage({
  document,
  number,
  scale,
  matched
}: {
  document: PDFDocumentProxy;
  number: number;
  scale: number;
  matched: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(number <= 2);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setVisible(true),
      { rootMargin: "700px" }
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let page: PDFPageProxy | undefined;
    let textLayer: TextLayer | undefined;
    let renderTask: ReturnType<PDFPageProxy["render"]> | undefined;
    void document.getPage(number).then(async (loadedPage) => {
      if (cancelled) return;
      page = loadedPage;
      const viewport = page.getViewport({ scale: 1.35 * scale });
      const canvas = canvasRef.current;
      const textHost = textRef.current;
      if (!canvas || !textHost) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      hostRef.current?.style.setProperty("--pdf-page-width", `${viewport.width}px`);
      hostRef.current?.style.setProperty("--pdf-page-height", `${viewport.height}px`);
      const context = canvas.getContext("2d");
      if (!context) return;
      renderTask = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0]
      });
      await renderTask.promise;
      if (cancelled) return;
      textHost.replaceChildren();
      textLayer = new TextLayer({
        textContentSource: await page.getTextContent(),
        container: textHost,
        viewport
      });
      await textLayer.render();
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      page?.cleanup();
    };
  }, [document, number, scale, visible]);

  return (
    <div
      className={`pdf-page ${matched ? "search-match" : ""}`}
      ref={hostRef}
      data-pdf-page={number}
      aria-label={`第 ${number} 页`}
    >
      <canvas ref={canvasRef} />
      <div className="textLayer" ref={textRef} />
      <span className="pdf-page-number">{number}</span>
    </div>
  );
}

function readError(error: unknown) {
  if (typeof error === "object" && error && "message" in error) return String(error.message);
  return "无法预览这个 PDF，文件可能损坏或受密码保护。";
}
