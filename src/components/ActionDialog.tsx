import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ActionDialog({
  title,
  description,
  confirmLabel,
  busy = false,
  danger = false,
  onClose,
  onConfirm,
  children,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="action-dialog-backdrop" onMouseDown={onClose}>
      <section
        className="action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">REVIEW CHANGE</span>
            <h2 id="action-dialog-title">{title}</h2>
            <p>{description}</p>
          </div>
          <button aria-label="Close dialog" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <div className="action-dialog-content">{children}</div>
        <footer>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            className={danger ? "danger-action" : ""}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Applying…" : confirmLabel}
          </Button>
        </footer>
      </section>
    </div>
  );
}
