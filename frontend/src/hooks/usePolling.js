
import { useCallback, useEffect, useId, useState } from "react";

// Track the status of every active polling hook so one successful request
// cannot hide another endpoint's failure.
const pollerStatuses = new Map();

function publishBackendStatus() {
  if (typeof window === "undefined") return;

  const offline = Array.from(pollerStatuses.values()).some(
    (status) => status === "error",
  );

  window.dispatchEvent(
    new CustomEvent("shadowguard:backend-status", {
      detail: { offline },
    }),
  );
}

export function getPollingOfflineStatus() {
  return Array.from(pollerStatuses.values()).some(
    (status) => status === "error",
  );
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
 */
export default function usePolling(fn, interval = 3000) {
  const pollerId = useId();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const poll = useCallback(async () => {
    try {
      const result = await fn();

      setData(result);
      setError(null);
      setLoading(false);

      pollerStatuses.set(pollerId, "online");
      publishBackendStatus();
    } catch (requestError) {
      setError(requestError);
      setLoading(false);

      pollerStatuses.set(pollerId, "error");
      publishBackendStatus();
    }
  }, [fn, pollerId]);

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

        pollerStatuses.set(pollerId, "error");
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
