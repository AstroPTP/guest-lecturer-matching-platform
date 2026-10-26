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
 * focus never leaves it for the browser's own controls. Focus starts on the
 * first field or button (a text field when there is one, otherwise Cancel) and
 * goes back to the control that opened it when it closes. The colours are the
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
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const node = dialog.current;
    if (!node) {
      return;
    }
    if (open && !node.open) {
      node.showModal();
    }
    if (!open && node.open) {
      node.close();
    }
  }, [open]);

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
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        // Escape. The parent closes it by clearing `open`, so the two never disagree.
        event.preventDefault();
        onCancel();
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
          onClick={onConfirm}
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
