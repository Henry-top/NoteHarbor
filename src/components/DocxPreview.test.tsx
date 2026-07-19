// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocxPreview } from "./DocxPreview";
import { api } from "../lib/api";
import { renderAsync } from "docx-preview";

vi.mock("../lib/api", () => ({
  api: { readDocxPreview: vi.fn() }
}));

vi.mock("docx-preview", () => ({
  renderAsync: vi.fn()
}));

const readDocxPreview = vi.mocked(api.readDocxPreview);
const renderDocument = vi.mocked(renderAsync);

describe("DocxPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    readDocxPreview.mockResolvedValue([80, 75, 3, 4]);
    renderDocument.mockResolvedValue({} as never);
  });

  it("loads bytes and renders with unsafe optional features disabled", async () => {
    render(<DocxPreview vaultId="vault" path="documents/sample.docx" />);

    expect(screen.getByText("正在准备 Word 预览…")).toBeInTheDocument();
    await waitFor(() => expect(renderDocument).toHaveBeenCalledTimes(1));
    expect(readDocxPreview).toHaveBeenCalledWith("vault", "documents/sample.docx");
    expect(renderDocument.mock.calls[0]?.[3]).toMatchObject({
      renderAltChunks: false,
      renderComments: false,
      renderChanges: false
    });
    await waitFor(() => expect(screen.queryByText("正在准备 Word 预览…")).not.toBeInTheDocument());
  });

  it("shows a readable error when the document cannot be rendered", async () => {
    readDocxPreview.mockRejectedValue(new Error("文档已损坏"));
    render(<DocxPreview vaultId="vault" path="broken.docx" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("无法预览这个 Word 文档");
    expect(screen.getByRole("alert")).toHaveTextContent("文档已损坏");
  });

  it("reloads when the selected file changes", async () => {
    const view = render(<DocxPreview vaultId="vault" path="first.docx" />);
    await waitFor(() => expect(renderDocument).toHaveBeenCalledTimes(1));

    view.rerender(<DocxPreview vaultId="vault" path="second.docx" />);
    await waitFor(() => expect(renderDocument).toHaveBeenCalledTimes(2));
    expect(readDocxPreview).toHaveBeenLastCalledWith("vault", "second.docx");
  });

  it("releases image and font blob URLs when the preview closes", async () => {
    renderDocument.mockImplementation(async (_data, body, styleContainer) => {
      const image = document.createElement("img");
      image.src = "blob:word-image";
      body.appendChild(image);
      const style = document.createElement("style");
      style.textContent = "@font-face { src: url(blob:word-font) }";
      (styleContainer ?? body).appendChild(style);
      return {} as never;
    });
    const view = render(<DocxPreview vaultId="vault" path="sample.docx" />);
    await waitFor(() => expect(renderDocument).toHaveBeenCalledTimes(1));

    view.unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:word-image");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:word-font");
  });
});
