// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { applyAppearance, readAppearance, resolveColorMode, storeAppearance } from "./appearance";

describe("appearance helpers", () => {
  it("falls back when stored values are missing or invalid", () => {
    const storage = {
      getItem: (key: string) => key.endsWith("theme") ? "unknown" : null
    };
    expect(readAppearance(storage)).toEqual({ theme: "modern", colorMode: "system" });
  });

  it("reads valid stored appearance", () => {
    const values = new Map([
      ["noteharbor:theme", "paper"],
      ["noteharbor:colorMode", "dark"]
    ]);
    expect(readAppearance({ getItem: (key) => values.get(key) ?? null }))
      .toEqual({ theme: "paper", colorMode: "dark" });
  });

  it("resolves the system mode explicitly", () => {
    expect(resolveColorMode("system", true)).toBe("dark");
    expect(resolveColorMode("system", false)).toBe("light");
    expect(resolveColorMode("light", true)).toBe("light");
  });

  it("applies theme, preference and effective mode together", () => {
    const root = document.createElement("html");
    applyAppearance(root, "glass", "system", true);
    expect(root.dataset).toMatchObject({
      theme: "glass",
      colorMode: "system",
      effectiveColorMode: "dark"
    });
    expect(root.style.colorScheme).toBe("dark");
  });

  it("stores both appearance choices", () => {
    const values = new Map<string, string>();
    storeAppearance({ setItem: (key, value) => values.set(key, value) }, "paper", "light");
    expect(values.get("noteharbor:theme")).toBe("paper");
    expect(values.get("noteharbor:colorMode")).toBe("light");
  });
});
