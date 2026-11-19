"use client";

import { useEffect, useState } from "react";
import { BackendError } from "@/lib/api/backendClient";
import { readPushStatus, turnOffPush, turnOnPush } from "@/lib/push/pushClient";
import { sendTestPush } from "@/services/notifications/pushService";
import type { PushStatus } from "@/types/notifications/pushTypes";
import { FeedbackBanner, SectionHeader } from "@/components/settings/settingsShared";

const STATUS_WORDS: Record<PushStatus, string> = {
  on: "On on this device",
  off: "Off",
  blocked: "Blocked in browser settings",
  unsupported: "Not supported here",
};

const STATUS_HELP: Record<PushStatus, string> = {
  on: "You will be told on this device when something new happens, even when GLMP is closed.",
  off: "Turn notifications on to be told on this device when something new happens, even when GLMP is closed.",
  blocked:
    "This browser is set to block notifications from GLMP. Allow notifications for this site in your browser's site settings, then come back here.",
  unsupported:
    "This browser cannot receive notifications. On an iPhone or iPad, follow the steps for iPhone or iPad below first. Otherwise try a current version of Chrome, Edge, Firefox or Safari.",
};

const buttonPrimary =
  "rounded-xl bg-[#2d2d2d] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50";
const buttonSecondary =
  "rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-bold text-[#2d2d2d] transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50";

/** What to tell the person when a step fails, in words they can act on. */
function failureText(error: unknown, fallback: string): string {
  if (error instanceof BackendError && error.status === 429) {
    return "You can send three tests a minute. Wait a moment and try again.";
  }
  if (error instanceof BackendError && error.message) {
    return error.message;
  }
  return fallback;
}

/**
 * Settings > Notifications: whether this device is told when something new
 * happens, with the buttons to change that and short instructions per device.
 *
 * Permission is asked for only when the person presses the button to turn
 * notifications on, never on opening the page.
 */
export default function NotificationsSection({ publicKey }: { publicKey: string }) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readPushStatus().then((next) => {
      if (!cancelled) {
        setStatus(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleTurnOn() {
    setFeedback(null);
    setBusy(true);
    try {
      const next = await turnOnPush(publicKey);
      setStatus(next);
      if (next === "on") {
        setFeedback({ type: "success", message: "Notifications are on for this device." });
      } else if (next === "blocked") {
        setFeedback({ type: "error", message: "Notifications were blocked. Allow them in your browser's site settings to try again." });
      } else if (next === "off") {
        setFeedback({ type: "error", message: "Notifications were not turned on. You can try again whenever you are ready." });
      }
    } catch (error) {
      setStatus(await readPushStatus());
      setFeedback({ type: "error", message: failureText(error, "Couldn't turn notifications on. Try again.") });
    } finally {
      setBusy(false);
    }
  }

  async function handleTurnOff() {
    setFeedback(null);
    setBusy(true);
    try {
      await turnOffPush();
      setFeedback({ type: "success", message: "Notifications are off for this device." });
    } catch (error) {
      setFeedback({ type: "error", message: failureText(error, "Couldn't turn notifications off. Try again.") });
    } finally {
      setStatus(await readPushStatus());
      setBusy(false);
    }
  }

  async function handleTest() {
    setFeedback(null);
    setBusy(true);
    try {
      const { sent } = await sendTestPush();
      setFeedback(
        sent > 0
          ? { type: "success", message: "Test sent. It should appear on this device in a moment." }
          : { type: "error", message: "The test could not be delivered. Try turning notifications off and on again." },
      );
    } catch (error) {
      setFeedback({ type: "error", message: failureText(error, "Couldn't send the test. Try again.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <SectionHeader title="Notifications" description="Be told on your phone or computer the moment something happens, such as a reply or a new match." />

      <div className="mt-6 rounded-xl border border-gray-200 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-gray-500">This device</p>
        <p className="mt-1 text-lg font-bold text-[#2d2d2d]" role="status">
          {status ? STATUS_WORDS[status] : "Checking..."}
        </p>
        {status && <p className="mt-2 text-sm text-gray-600">{STATUS_HELP[status]}</p>}

        {status === "off" && (
          <div className="mt-5">
            <button type="button" onClick={() => void handleTurnOn()} disabled={busy} className={buttonPrimary}>
              {busy ? "Turning on..." : "Turn on notifications on this device"}
            </button>
          </div>
        )}

        {status === "on" && (
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => void handleTest()} disabled={busy} className={buttonSecondary}>
              Send me a test
            </button>
            <button type="button" onClick={() => void handleTurnOff()} disabled={busy} className={buttonSecondary}>
              Turn off on this device
            </button>
          </div>
        )}
      </div>

      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} />}

      <div className="mt-8">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#2d2d2d]">Set up on your device</h3>
        <dl className="mt-3 space-y-4 text-sm leading-6 text-gray-700">
          <div>
            <dt className="font-bold text-[#2d2d2d]">iPhone or iPad</dt>
            <dd>
              Tap Share, then Add to Home Screen. Open GLMP from the Home Screen, then turn notifications on here. This needs iOS 16.4 or later.
            </dd>
          </div>
          <div>
            <dt className="font-bold text-[#2d2d2d]">Android</dt>
            <dd>Use Install app from the browser menu, then allow notifications.</dd>
          </div>
          <div>
            <dt className="font-bold text-[#2d2d2d]">Computer</dt>
            <dd>Click Allow when your browser asks.</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
