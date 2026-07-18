import { describe, expect, it } from "vitest";
import {
  extractOutline,
  makeNewNoteContent,
  parseTags,
  prepareMarkdown,
  splitFrontmatter,
  updateTags,
  wordCount
} from "./markdown";

describe("markdown helpers", () => {
  it("reads YAML without changing the body", () => {
    const source = "---\nid: abc\ntags: [\"项目\", test]\n---\n# 标题\n正文";
    const parsed = splitFrontmatter(source);
    expect(parsed.frontmatter.id).toBe("abc");
    expect(parsed.frontmatter.tags).toEqual(["项目", "test"]);
    expect(parsed.body).toBe("# 标题\n正文");
  });

  it("does not treat incomplete frontmatter as metadata", () => {
    const source = "---\n正文";
    expect(splitFrontmatter(source).body).toBe(source);
  });

  it("adds portable YAML only when metadata changes", () => {
    const updated = updateTags("# 原有笔记", ["想法", "项目"]);
    expect(updated).toContain('tags: ["想法", "项目"]');
    expect(updated).toContain("# 原有笔记");
  });

  it("extracts an outline and wikilinks", () => {
    expect(extractOutline("# 一\n## 二")).toEqual([
      { level: 1, text: "一", line: 1 },
      { level: 2, text: "二", line: 2 }
    ]);
    expect(prepareMarkdown("[[目标|显示]]")).toBe("[显示](noteharbor:%E7%9B%AE%E6%A0%87)");
  });

  it("counts Chinese characters and Latin words", () => {
    expect(wordCount("你好 hello world")).toBe(4);
  });

  it("creates valid metadata for a new note", () => {
    const parsed = splitFrontmatter(makeNewNoteContent());
    expect(parsed.frontmatter.id).toBeTruthy();
    expect(parsed.frontmatter.tags).toEqual([]);
  });

  it("parses empty and quoted tags", () => {
    expect(parseTags("[]")).toEqual([]);
    expect(parseTags('["a", "中文"]')).toEqual(["a", "中文"]);
  });
});
