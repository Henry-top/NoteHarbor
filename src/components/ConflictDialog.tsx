import { AlertTriangle } from "lucide-react";
import { t } from "../i18n";
import type { FileConflict } from "../types";

export function ConflictDialog({
  conflict,
  onLoadDisk,
  onKeepMine,
  onSaveCopy,
  onClose
}: {
  conflict: FileConflict | null;
  onLoadDisk: () => void;
  onKeepMine: () => void;
  onSaveCopy: () => void;
  onClose: () => void;
}) {
  if (!conflict) return null;
  return (
    <div className="overlay">
      <section className="dialog conflict-dialog" role="alertdialog">
        <div className="dialog-icon"><AlertTriangle size={22} /></div>
        <h2>{t("externalConflict")}</h2>
        <p>{t("conflictDescription")}</p>
        <code>{conflict.path}</code>
        <div className="dialog-actions">
          <button onClick={onLoadDisk}>{t("loadDisk")}</button>
          <button onClick={onSaveCopy}>{t("saveCopy")}</button>
          <button className="primary" onClick={onKeepMine}>{t("keepMine")}</button>
        </div>
        <button className="dialog-cancel" onClick={onClose}>{t("cancel")}</button>
      </section>
    </div>
  );
}
