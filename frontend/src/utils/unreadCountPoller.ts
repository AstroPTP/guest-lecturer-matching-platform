export const UNREAD_POLL_INTERVAL_MS = 30_000;

// Sent on window when a poll finds the unread count has changed, so a notifications
// list that is open can load the new entries.
export const UNREAD_COUNT_CHANGED_EVENT = "notifications:unread-count-changed";

// Sent on window when the person marks notifications as read, so the bell does not
// keep showing its dot until the next poll.
export const NOTIFICATIONS_MARKED_READ_EVENT = "notifications:marked-read";

interface UnreadCountPollerOptions {
  fetchCount: () => Promise<number>;
  onCount: (count: number) => void;
  // Called when a count comes back different from the one before it. The first
  // count is not a change, because there was nothing to compare it with.
  onChange: () => void;
}

// Keeps a count of unread notifications up to date while the page is open, and
// returns the function that stops it.
//
// It asks on a timer, but only while the tab is visible: a hidden tab starts
// again, with an immediate ask, when it is shown. It also asks when the window
// gains focus and when notifications are marked as read.
export function startUnreadCountPolling({ fetchCount, onCount, onChange }: UnreadCountPollerOptions): () => void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastCount: number | undefined;
  let latestRequest = 0;
  let stopped = false;

  async function refresh() {
    if (stopped || document.visibilityState !== "visible") {
      return;
    }
    // Answers can arrive out of order, so only the newest question counts.
    const request = ++latestRequest;
    try {
      const count = await fetchCount();
      if (stopped || request !== latestRequest) {
        return;
      }
      onCount(count);
      if (lastCount !== undefined && count !== lastCount) {
        onChange();
      }
      lastCount = count;
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

  function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      void refresh();
      startTimer();
    } else {
      stopTimer();
    }
  }

  const handleRefreshRequest = () => void refresh();

  void refresh();
  if (document.visibilityState === "visible") {
    startTimer();
  }
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("focus", handleRefreshRequest);
  window.addEventListener(NOTIFICATIONS_MARKED_READ_EVENT, handleRefreshRequest);

  return () => {
    stopped = true;
    stopTimer();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("focus", handleRefreshRequest);
    window.removeEventListener(NOTIFICATIONS_MARKED_READ_EVENT, handleRefreshRequest);
  };
}
