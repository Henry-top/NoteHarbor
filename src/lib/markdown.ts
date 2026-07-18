import type { OutlineItem } from "../types";

export interface Frontmatter {
  id?: string;
  created?: string;
  updated?: string;
  tags: string[];
}

export function splitFrontmatter(source: string): {
  frontmatter: Frontmatter;
  body: string;
  raw: string;
} {
  const normalized = source.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontmatter: { tags: [] }, body: normalized, raw: "" };
  }
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) {
    return { frontmatter: { tags: [] }, body: normalized, raw: "" };
  }
  const raw = normalized.slice(4, end);
  const frontmatter: Frontmatter = { tags: [] };
  for (const line of raw.split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key === "id" || key === "created" || key === "updated") {
      frontmatter[key] = stripQuotes(value);
    }
    if (key === "tags") {
      frontmatter.tags = parseTags(value);
    }
  }
  return {
    frontmatter,
    body: normalized.slice(end + 5),
    raw
  };
}

export function parseTags(value: string): string[] {
  if (!value || value === "[]") return [];
  const body = value.startsWith("[") && value.endsWith("]")
    ? value.slice(1, -1)
    : value;
  return body
    .split(",")
    .map((item) => stripQuotes(item.trim()))
    .filter(Boolean);
}

export function updateTags(source: string, tags: string[]): string {
  const unique = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
  const parsed = splitFrontmatter(source);
  const serializedTags = `[${unique.map(quoteYaml).join(", ")}]`;

  if (!parsed.raw) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    return `---\nid: ${id}\ncreated: ${now}\nupdated: ${now}\ntags: ${serializedTags}\n---\n${source}`;
  }

  const lines = parsed.raw.split("\n");
  const tagIndex = lines.findIndex((line) => /^tags\s*:/.test(line));
  const updatedIndex = lines.findIndex((line) => /^updated\s*:/.test(line));
  if (tagIndex >= 0) lines[tagIndex] = `tags: ${serializedTags}`;
  else lines.push(`tags: ${serializedTags}`);
  if (updatedIndex >= 0) lines[updatedIndex] = `updated: ${new Date().toISOString()}`;
  return `---\n${lines.join("\n")}\n---\n${parsed.body}`;
}

export function extractOutline(source: string): OutlineItem[] {
  const { body } = splitFrontmatter(source);
  return body.split("\n").flatMap((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (!match) return [];
    return [{
      level: match[1].length,
      text: match[2].replace(/[*_`[\]]/g, ""),
      line: index + 1
    }];
  });
}

export function prepareMarkdown(source: string): string {
  const { body } = splitFrontmatter(source);
  return body.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_, target: string, alias?: string) =>
      `[${alias?.trim() || target.trim()}](noteharbor:${encodeURIComponent(target.trim())})`
  );
}

export function wordCount(source: string): number {
  const { body } = splitFrontmatter(source);
  const chinese = body.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latin = body
    .replace(/[\u3400-\u9fff]/g, " ")
    .match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0;
  return chinese + latin;
}

export function makeNewNoteContent(): string {
  const now = new Date().toISOString();
  return `---\nid: ${crypto.randomUUID()}\ncreated: ${now}\nupdated: ${now}\ntags: []\n---\n\n`;
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

function quoteYaml(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
