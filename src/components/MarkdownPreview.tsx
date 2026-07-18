import { useEffect, useId, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";
import { prepareMarkdown } from "../lib/markdown";
import { convertFileSrc } from "@tauri-apps/api/core";
import { runningInTauri } from "../lib/api";

interface MarkdownPreviewProps {
  content: string;
  onOpenWikiLink?: (target: string) => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  vaultPath?: string;
  notePath?: string;
}

export function MarkdownPreview({
  content,
  onOpenWikiLink,
  scrollRef,
  vaultPath,
  notePath
}: MarkdownPreviewProps) {
  return (
    <div className="preview-scroll" ref={scrollRef}>
      <article className="markdown-preview">
        <ReactMarkdown
          remarkPlugins={[remarkFrontmatter, remarkGfm, remarkMath]}
          rehypePlugins={[rehypeSanitize, rehypeHighlight, rehypeKatex]}
          components={{
            a({ href, children, ...props }) {
              if (href?.startsWith("noteharbor:")) {
                const target = decodeURIComponent(href.slice("noteharbor:".length));
                return (
                  <button
                    className="wiki-link"
                    type="button"
                    onClick={() => onOpenWikiLink?.(target)}
                  >
                    {children}
                  </button>
                );
              }
              return <a href={href} target="_blank" rel="noreferrer" {...props}>{children}</a>;
            },
            code({ className, children, ...props }) {
              if (className?.includes("language-mermaid")) {
                return <MermaidBlock code={String(children).replace(/\n$/, "")} />;
              }
              return <code className={className} {...props}>{children}</code>;
            },
            img({ src, alt, ...props }) {
              return <img src={resolveAssetSource(src, vaultPath, notePath)} alt={alt || ""} {...props} />;
            }
          }}
        >
          {prepareMarkdown(content)}
        </ReactMarkdown>
      </article>
    </div>
  );
}

function resolveAssetSource(src?: string, vaultPath?: string, notePath?: string) {
  if (!src || /^(?:https?:|data:|blob:)/i.test(src) || !vaultPath || !runningInTauri) return src;
  const directory = notePath?.split("/").slice(0, -1) ?? [];
  const segments = [...directory, ...decodeURIComponent(src).split("/")];
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") normalized.pop();
    else normalized.push(segment);
  }
  return convertFileSrc(`${vaultPath.replace(/\/$/, "")}/${normalized.join("/")}`);
}

function MermaidBlock({ code }: { code: string }) {
  const reactId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void import("mermaid")
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif"
        });
        return mermaid.render(`noteharbor-${reactId}`, code);
      })
      .then(({ svg: rendered }) => {
        if (!cancelled) {
          setSvg(rendered);
          setError("");
        }
      })
      .catch(() => {
        if (!cancelled) setError("图表语法有误");
      });
    return () => {
      cancelled = true;
    };
  }, [code, reactId]);

  if (error) return <span className="mermaid-error">{error}</span>;
  return <span className="mermaid-block" dangerouslySetInnerHTML={{ __html: svg }} />;
}
