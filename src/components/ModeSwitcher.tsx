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
      <button className={mode === "source" ? "active" : ""} onClick={() => onChange("source")} title={t("sourceMode")}>
        <FileCode2 size={15} />
        <span>{t("sourceMode")}</span>
      </button>
      <button className={mode === "live" ? "active" : ""} onClick={() => onChange("live")} title={t("liveMode")}>
        <Eye size={15} />
        <span>{t("liveMode")}</span>
      </button>
      <button className={mode === "split" ? "active" : ""} onClick={() => onChange("split")} title={t("splitMode")}>
        <Columns2 size={15} />
        <span>{t("splitMode")}</span>
      </button>
    </div>
  );
}
