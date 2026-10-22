"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { canOfferPush, readPushStatus } from "@/lib/push/pushClient";
import { getPushKey } from "@/services/notifications/pushService";

const DISMISSED_KEY = "glmp.pushPromptDismissed";

/** Storage can be missing or refuse to answer, as in a private window. The banner then simply shows. */
function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Nothing to do: it will show again next time.
  }
}

/**
 * A one-time reminder on Messages, shown once a person has a match, that
 * notifications can tell them when a reply arrives. Dismissing it is remembered
 * on this device.
 *
 * It stays hidden when the server has notifications switched off, when this
 * device already has them on or has blocked them, when the browser cannot
 * receive them, and when it was dismissed before.
 */
export default function PushPromptBanner({ settingsHref }: { settingsHref: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function decide() {
      if (wasDismissed() || !canOfferPush()) {
        return;
      }
      try {
        const key = await getPushKey();
        if (!key.enabled) {
          return;
        }
        const status = await readPushStatus();
        if (status === "on" || status === "blocked") {
          return;
        }
        if (!cancelled) {
          setVisible(true);
        }
      } catch {
        // Not knowing whether it applies is a reason to say nothing.
      }
    }

    void decide();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-blue-200 bg-blue-50 px-6 py-3 text-sm text-blue-900" role="region" aria-label="Notifications">
      <p>
        Get told when they reply:{" "}
        <Link href={`${settingsHref}?section=notifications`} className="font-bold underline">
          turn on notifications
        </Link>
      </p>
      <button
        type="button"
        onClick={() => {
          rememberDismissal();
          setVisible(false);
        }}
        className="shrink-0 rounded-lg px-3 py-1 font-semibold hover:bg-blue-100"
      >
        Dismiss
      </button>
    </div>
  );
}
