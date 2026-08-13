"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ActionResult } from "@/types/settings/settingsTypes";

import { Field, SectionHeader } from "@/components/settings/settingsShared";

export default function DeleteAccountSection({ onDeleteAccount }: { onDeleteAccount: () => Promise<ActionResult> }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <section>
      <SectionHeader title="Delete Account" description="Permanently remove your account and all associated data." />

      <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-5">
        <p className="text-sm font-semibold text-red-700">This action cannot be undone</p>

        <ul className="mt-3 space-y-1.5 text-sm text-red-700/90">
          <li> Your profile will be permanently deleted</li>
          <li> All conversations and messages will be lost</li>
          <li> Any matches will be removed</li>
          <li>You won&apos;t be able to recover this account later</li>
        </ul>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="mt-5 rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
        >
          Delete my account
        </button>
      </div>

      {showModal && <DeleteAccountModal onClose={() => setShowModal(false)} onDeleteAccount={onDeleteAccount} />}
    </section>
  );
}

function DeleteAccountModal({ onClose, onDeleteAccount }: { onClose: () => void; onDeleteAccount: () => Promise<ActionResult> }) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canDelete = confirmText === "DELETE";

  async function handleDelete() {
    if (!canDelete) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const result = await onDeleteAccount();

    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error ?? "Could not delete your account. Try again.");
      return;
    }

    onClose();
    router.replace("/login");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-[#2d2d2d]">Delete your account?</h3>

        <p className="mt-2 text-sm text-gray-600">
          This is permanent. Type <span className="font-semibold text-red-600">DELETE</span> to continue.
        </p>

        <div className="mt-5">
          <Field label={'Type "DELETE" to confirm'}>
            <input
              type="text"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-red-400"
              placeholder="DELETE"
              autoFocus
            />
          </Field>
        </div>

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-full px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100">
            Cancel
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete || isSubmitting}
            className="rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? "Deleting..." : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
