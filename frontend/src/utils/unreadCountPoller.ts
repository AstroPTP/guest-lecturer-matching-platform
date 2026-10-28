import type { UnreadNotificationSummary } from "@/types/notifications/notificationTypes";

export const UNREAD_POLL_INTERVAL_MS = 30_000;

// How long the person can leave the page alone before it stops asking. Each ask
// carries their session, so a tab left open overnight would otherwise keep that
// session alive for as long as the tab lasts.
export const UNREAD_IDLE_LIMIT_MS = 15 * 60 * 1000;

// What counts as the person being there. Any of these starts the clock again.
const INPUT_EVENTS = ["pointerdown", "pointermove", "keydown", "scroll"] as const;

// Sent on window when a poll finds the unread count or the time of the newest
// notification has changed, so a notifications list that is open can load the new
// entries. The event's detail is the UnreadNotificationSummary the poll found.
export const UNREAD_COUNT_CHANGED_EVENT = "notifications:unread-count-changed";

// Sent on window when the person marks notifications as read, so the bell does not
// keep showing its dot until the next poll.
export const NOTIFICATIONS_MARKED_READ_EVENT = "notifications:marked-read";

interface UnreadCountPollerOptions {
  // Resolves to the count alone, or to the count with the time of the newest
  // notification. With only a count, only a different count is a change.
  fetchCount: () => Promise<number | UnreadNotificationSummary>;
  onCount: (count: number) => void;
  // Called when an answer differs from the one before it in its count or in the
  // time of the newest notification. The latter is what changes when another
  // message joins a notice that is already unread: the count stays the same. The
  // first answer is not a change, because there was nothing to compare it with.
  onChange: (summary: UnreadNotificationSummary) => void;
}

// Keeps a count of unread notifications up to date while the page is open, and
// returns the function that stops it. It also watches the time of the newest
// notification, so that new entries are noticed even when the count is unchanged.
//
// It asks on a timer, but only while the tab is visible: a hidden tab starts
// again, with an immediate ask, when it is shown. It also asks when the window
// gains focus and when notifications are marked as read.
//
// After UNREAD_IDLE_LIMIT_MS with no pointer, key, scroll or focus activity it
// stops asking altogether, and starts again at the next bit of activity.
export function startUnreadCountPolling({ fetchCount, onCount, onChange }: UnreadCountPollerOptions): () => void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let last: UnreadNotificationSummary | undefined;
  let latestRequest = 0;
  let lastInputAt = Date.now();
  let stopped = false;

  function isIdle() {
    return Date.now() - lastInputAt >= UNREAD_IDLE_LIMIT_MS;
  }

  async function refresh() {
    if (stopped || document.visibilityState !== "visible") {
      return;
    }
    if (isIdle()) {
      stopTimer();
      return;
    }
    // Answers can arrive out of order, so only the newest question counts.
    const request = ++latestRequest;
    try {
      const answer = await fetchCount();
      if (stopped || request !== latestRequest) {
        return;
      }
      const summary = typeof answer === "number" ? { count: answer, latestAt: null } : answer;
      onCount(summary.count);
      if (last !== undefined && (summary.count !== last.count || summary.latestAt !== last.latestAt)) {
        onChange(summary);
      }
      last = summary;
    } catch {
      // A failed ask leaves the last count on screen, and the next ask tries again.
    }
  }

  function startTimer() {
    stopTimer();
    timer = setInterval(() => void refresh(), UNREAD_POLL_INTERVAL_MS);
  }

  function stopTimer() {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  // Notes that the person is there, and says whether they had been away long
  // enough for the asking to have stopped.
  function noteInput(): boolean {
    const wasIdle = isIdle();
    lastInputAt = Date.now();
    return wasIdle;
  }

  function resumeIfVisible() {
    if (document.visibilityState === "visible") {
      startTimer();
    }
  }

  function handleInput() {
    if (noteInput()) {
      void refresh();
      resumeIfVisible();
    }
  }

  function handleFocus() {
    const wasIdle = noteInput();
    void refresh();
    if (wasIdle) {
      resumeIfVisible();
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== "visible") {
      stopTimer();
      return;
    }
    void refresh();
    // A tab shown again after the idle limit stays quiet until there is activity.
    if (!isIdle()) {
      startTimer();
    }
  }

  const handleRefreshRequest = () => void refresh();
  const inputListener = { capture: true, passive: true } as const;

  void refresh();
  resumeIfVisible();
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("focus", handleFocus);
  window.addEventListener(NOTIFICATIONS_MARKED_READ_EVENT, handleRefreshRequest);
  // Capturing, because scroll does not bubble from a scrolling panel to the window.
  for (const name of INPUT_EVENTS) {
    window.addEventListener(name, handleInput, inputListener);
  }

  return () => {
    stopped = true;
    stopTimer();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("focus", handleFocus);
    window.removeEventListener(NOTIFICATIONS_MARKED_READ_EVENT, handleRefreshRequest);
    for (const name of INPUT_EVENTS) {
      window.removeEventListener(name, handleInput, inputListener);
    }
  };
}
