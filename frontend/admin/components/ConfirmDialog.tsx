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
  /**
   * Where focus goes if the action removes the button that opened the dialog,
   * as a CSS selector for a stable element such as the page heading. The first
   * heading on the page when left out.
   */
  fallbackFocus?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const DEFAULT_FALLBACK = "main h1, h1, main h2, h2";

/**
 * Keeps focus from falling to the page body when the action just confirmed
 * removes the control that opened the dialog (a row that leaves a queue, a
 * button that changes into another). Watches the page for a short while and,
 * if the opener is gone and nothing has focus, focuses `selector` instead.
 */
function watchForLostFocus(opener: Element | null, selector: string) {
  if (!opener) return;
  const observer = new MutationObserver(() => {
    if (opener.isConnected) return;
    stop();
    if (document.activeElement && document.activeElement !== document.body) return;
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus();
  });
  const timer = window.setTimeout(stop, 15000);
  function stop() {
    observer.disconnect();
    window.clearTimeout(timer);
  }
  observer.observe(document.body, { childList: true, subtree: true });
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
 * goes back to the button that opened it when it closes, or to the page heading
 * when the action removes that button. It takes its colours
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
  fallbackFocus = DEFAULT_FALLBACK,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  // The control that had focus when the dialog opened, which the browser returns
  // focus to on close, unless the action removes it.
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) {
      opener.current = document.activeElement;
      node.showModal();
    }
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
      // A dialog that asks about something hard to take back is an alert dialog.
      role={danger ? "alertdialog" : undefined}
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
        <button
          className={danger ? "danger" : undefined}
          disabled={busy}
          onClick={() => {
            watchForLostFocus(opener.current, fallbackFocus);
            onConfirm();
          }}
          type="button"
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
