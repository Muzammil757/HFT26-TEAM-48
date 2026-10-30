import { useEffect, useId, useState } from "react";

// Track the status of every active polling hook so one successful request
// cannot hide another endpoint's failure.
const pollerStatuses = new Map();

function publishBackendStatus() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent("shadowguard:backend-status", {
      detail: { offline: getPollingOfflineStatus() },
    }),
  );
}

export function getPollingOfflineStatus() {
  return Array.from(pollerStatuses.values()).some(
    (status) => status === "error",
  );
}

/** True while any poller cannot reach the backend. Re-renders on change. */
export function useBackendOffline() {
  const [offline, setOffline] = useState(getPollingOfflineStatus);

  useEffect(() => {
    const handle = (event) => setOffline(Boolean(event.detail?.offline));
    window.addEventListener("shadowguard:backend-status", handle);
    // Recheck after subscribing in case polling status changed during mount.
    setOffline(getPollingOfflineStatus());
    return () => window.removeEventListener("shadowguard:backend-status", handle);
  }, []);

  return offline;
}

/**
 * Poll an async function on an interval.
 *
 * Returns:
 *   data: most recently received successful result, or null
 *   error: latest request error, or null
 *   loading: true until the first successful result or request failure
 *
 * The most recent successful data is preserved if a later poll fails.
 * Only network failures mark the backend offline; an HTTP error (e.g. 404 for a
 * deleted incident) means the server is reachable.
 */
export default function usePolling(fn, interval = 3000) {
  const pollerId = useId();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let inFlight = false;

    const runPoll = async () => {
      if (!active || inFlight) return;

      inFlight = true;

      try {
        const result = await fn();

        if (!active) return;

        setData(result);
        setError(null);
        setLoading(false);

        pollerStatuses.set(pollerId, "online");
        publishBackendStatus();
      } catch (requestError) {
        if (!active) return;

        setError(requestError);
        setLoading(false);

        pollerStatuses.set(pollerId, requestError?.status ? "online" : "error");
        publishBackendStatus();
      } finally {
        inFlight = false;
      }
    };

    pollerStatuses.set(pollerId, "checking");
    publishBackendStatus();

    runPoll();

    const intervalId = window.setInterval(
      runPoll,
      Math.max(500, interval),
    );

    return () => {
      active = false;
      window.clearInterval(intervalId);

      pollerStatuses.delete(pollerId);
      publishBackendStatus();
    };
  }, [fn, interval, pollerId]);

  return { data, error, loading };
}
