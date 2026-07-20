import { Columns2, Eye, FileCode2 } from "lucide-react";
import { t } from "../i18n";
import type { EditorMode } from "../types";

export function ModeSwitcher({
  mode,
  onChange
}: {
  mode: EditorMode;
  onChange: (mode: EditorMode) => void;
}) {
  return (
    <div className="segmented mode-switcher" aria-label="编辑模式">
      <button className={mode === "source" ? "active" : ""} onClick={() => onChange("source")} title="源码模式：完整显示 Markdown 标记">
        <FileCode2 size={15} />
        <span>{t("sourceMode")}</span>
      </button>
      <button className={mode === "live" ? "active" : ""} onClick={() => onChange("live")} title="即时渲染：编辑时直接呈现排版效果">
        <Eye size={15} />
        <span>{t("liveMode")}</span>
      </button>
      <button className={mode === "split" ? "active" : ""} onClick={() => onChange("split")} title="分栏模式：左侧编辑，右侧同步预览">
        <Columns2 size={15} />
        <span>{t("splitMode")}</span>
      </button>
    </div>
  );
}
