// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { HoverTip } from "./HoverTip";

afterEach(cleanup);

describe("HoverTip", () => {
  it("shows a description and shortcut when the button receives focus", async () => {
    render(
      <HoverTip label="全局搜索" detail="查找全部资料库" shortcut="⌘K">
        <button>搜索</button>
      </HoverTip>
    );

    fireEvent.focus(screen.getByRole("button", { name: "全局搜索" }));
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("全局搜索");
    expect(tooltip).toHaveTextContent("查找全部资料库");
    expect(tooltip).toHaveTextContent("⌘K");

    fireEvent.blur(screen.getByRole("button", { name: "全局搜索" }));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
