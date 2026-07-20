// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  completeOnboarding,
  filterHelpTopics,
  helpTopics,
  platformHelpTopics,
  shouldShowOnboarding
} from "./help";

describe("help helpers", () => {
  it("filters topics using titles, content and keywords", () => {
    expect(filterHelpTopics(helpTopics, "Word").map((topic) => topic.id)).toContain("word");
    expect(filterHelpTopics(helpTopics, "废纸篓").map((topic) => topic.id)).toContain("files");
    expect(filterHelpTopics(helpTopics, "找不到的功能")).toEqual([]);
  });

  it("uses platform-specific shortcut names", () => {
    const macShortcuts = platformHelpTopics("MacIntel").find((topic) => topic.id === "shortcuts");
    const windowsShortcuts = platformHelpTopics("Win32").find((topic) => topic.id === "shortcuts");
    expect(macShortcuts?.steps[0]).toContain("⌘K");
    expect(windowsShortcuts?.steps[0]).toContain("Ctrl+K");
  });

  it("shows onboarding once and stores completion", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: vi.fn((key: string, value: string) => values.set(key, value))
    };
    expect(shouldShowOnboarding(storage)).toBe(true);
    completeOnboarding(storage);
    expect(shouldShowOnboarding(storage)).toBe(false);
    expect(storage.setItem).toHaveBeenCalledWith("noteharbor:onboarding:v1", "completed");
  });
});
