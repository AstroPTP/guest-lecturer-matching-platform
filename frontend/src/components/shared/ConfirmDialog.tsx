"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

interface ConfirmDialogProps {
  open: boolean;
  /** The question, which also names the dialog for screen readers. */
  title: string;
  /** What choosing Confirm does. */
  description?: ReactNode;
  /** Anything the person fills in before confirming, such as a reason. */
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" colours Confirm red, for an action that cannot easily be taken back. */
  tone?: "danger" | "neutral";
  confirmDisabled?: boolean;
  /**
   * Where focus goes if the action removes the control that opened the dialog,
   * as a CSS selector for a stable element such as a list heading. The first
   * heading on the page when left out.
   */
  fallbackFocus?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const DEFAULT_FALLBACK = "main h1, h1, main h2, h2";

/** True when nothing useful has focus: the page body, or a control that has been removed. */
function focusIsLost(): boolean {
  // The browser may still report a removed control as the active element for a
  // moment, so one that is no longer on the page counts as lost too.
  const active = document.activeElement;
  // A control inside a dialog that has just closed is still reported as active
  // until the browser next updates the page, but nothing there can be used.
  return !active || active === document.body || !active.isConnected || active.closest("dialog:not([open])") !== null;
}

/** Runs `check` once the browser has finished moving focus after a change to the page. */
function afterFocusSettles(check: () => void) {
  window.requestAnimationFrame(() => window.setTimeout(check, 50));
}

function focusFallback(selector: string) {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) {
    return;
  }
  if (!target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
  }
  target.focus();
}

/**
 * Keeps focus from falling to the page body when the action just confirmed
 * removes the control that opened the dialog (a chat that is deleted, a panel
 * that closes). Watches the page for a short while and, once the opener is gone
 * and the dialog has closed, focuses `selector` if nothing has focus. The
 * closing of the dialog does the same check itself, for an opener that goes
 * before the dialog does.
 */
function watchForLostFocus(opener: Element | null, dialog: HTMLDialogElement | null, selector: string) {
  if (!opener) {
    return;
  }
  const observer = new MutationObserver(() => {
    // A dialog taken off the page with its parent no longer counts as open.
    if (opener.isConnected || (dialog?.isConnected && dialog.open)) {
      return;
    }
    stop();
    afterFocusSettles(() => focusIsLost() && focusFallback(selector));
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
 * focus never leaves it for the browser's own controls. Focus starts on the
 * first field or button (a text field when there is one, otherwise Cancel) and
 * goes back to the control that opened it when it closes, or to a stable heading
 * when the action removes that control. The colours are the
 * same classes the rest of the app uses, so it follows light and dark.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "neutral",
  confirmDisabled = false,
  fallbackFocus = DEFAULT_FALLBACK,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  // The control that had focus when the dialog opened, which the browser returns
  // focus to on close, unless the action removes it.
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const node = dialog.current;
    if (!node) {
      return;
    }
    if (open && !node.open) {
      opener.current = document.activeElement;
      node.showModal();
    }
    if (!open && node.open) {
      node.close();
      // An opener already removed by the action cannot be given focus back.
      const gone = opener.current && !opener.current.isConnected;
      if (gone) {
        afterFocusSettles(() => focusIsLost() && focusFallback(fallbackFocus));
      }
    }
  }, [open, fallbackFocus]);

  function keepFocusInside(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") {
      return;
    }
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      return;
    }
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
      ref={dialog}
      // A dialog that asks about something hard to take back is an alert dialog.
      role={tone === "danger" ? "alertdialog" : undefined}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
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
      className="m-auto w-full max-w-md rounded-2xl bg-white p-6 text-[#2d2d2d] shadow-xl backdrop:bg-black/50"
    >
      <h3 id={titleId} className="text-xl font-bold text-[#2d2d2d]">
        {title}
      </h3>
      {description ? (
        <div id={descriptionId} className="mt-3 leading-6 text-gray-600">
          {description}
        </div>
      ) : null}
      {children}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            watchForLostFocus(opener.current, dialog.current, fallbackFocus);
            onConfirm();
          }}
          disabled={confirmDisabled}
          className={
            "rounded-full px-6 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-40 " +
            (tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-[#2d2d2d] hover:bg-black")
          }
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
