"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

interface ConfirmDialogProps {
  open: boolean;
  /** The question, which also names the dialog for screen readers. */
  title: string;
  /** What choosing Confirm does, as one or more paragraphs. */
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Styles Confirm as a destructive action, in the danger colour. */
  danger?: boolean;
  /** Disables Confirm while the action it starts is running. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * An in-page confirmation in place of the browser's own confirm box.
 *
 * It is a modal dialog element, so the page behind it cannot be reached, and
 * Escape cancels it. Tab and Shift+Tab are kept inside it by hand as well, so
 * focus never leaves it for the browser's own controls. Focus starts on Cancel,
 * the safe choice for an action that cannot be taken back without effort, and
 * goes back to the button that opened it when it closes. It takes its colours
 * from the portal's theme tokens, so it follows light and dark.
 */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  function keepFocusInside(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <dialog
      aria-describedby={children ? bodyId : undefined}
      aria-labelledby={titleId}
      className="confirm-dialog"
      onCancel={(event) => {
        // Escape. The parent closes it by clearing `open`, so the two never disagree.
        event.preventDefault();
        onCancel();
      }}
      onClose={() => {
        // Closed from outside this component, for example by a script, while the
        // parent still says it is open: tell the parent so the two agree again.
        if (open) onCancel();
      }}
      onKeyDown={keepFocusInside}
      ref={dialog}
    >
      <h2 id={titleId}>{title}</h2>
      {children ? <div id={bodyId}>{children}</div> : null}
      <div className="confirm-actions">
        <button onClick={onCancel} type="button">
          {cancelLabel}
        </button>
        <button className={danger ? "danger" : undefined} disabled={busy} onClick={onConfirm} type="button">
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
