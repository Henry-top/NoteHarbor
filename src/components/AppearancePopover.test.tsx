// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearancePopover } from "./AppearancePopover";

afterEach(cleanup);

function renderPopover(onClose = vi.fn()) {
  const anchorRef = createRef<HTMLButtonElement>();
  render(
    <>
      <button ref={anchorRef}>外观按钮</button>
      <main>笔记区域</main>
      <AppearancePopover
        open
        theme="modern"
        colorMode="system"
        onThemeChange={vi.fn()}
        onColorModeChange={vi.fn()}
        onClose={onClose}
        anchorRef={anchorRef}
      />
    </>
  );
  return { anchorRef, onClose };
}

describe("AppearancePopover", () => {
  it("closes when the user clicks outside", () => {
    const { onClose } = renderPopover();
    fireEvent.pointerDown(screen.getByText("笔记区域"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open when the user clicks inside or on its anchor", () => {
    const { onClose } = renderPopover();
    fireEvent.pointerDown(screen.getByRole("dialog", { name: "外观" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "外观按钮" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape and when the window loses focus", () => {
    const { onClose } = renderPopover();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent(window, new Event("blur"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
