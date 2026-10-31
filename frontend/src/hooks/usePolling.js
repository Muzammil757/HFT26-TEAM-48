import { useEffect, useId, useState } from "react";

/*
 * Shared polling stores. Components that poll the same key (e.g. "incidents")
 * share ONE request every interval, and the last result is cached across
 * navigation, so switching pages never flashes a loading state.
 */
const stores = new Map();
// Time of the most recent successful poll of any endpoint (for "Last refreshed").
let lastSuccessAt = null;

function isOffline() {
  for (const store of stores.values()) {
    if (store.listeners.size > 0 && store.status === "error") return true;
  }
  return false;
}

function publishBackendStatus() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("shadowguard:backend-status", {
      detail: { offline: isOffline(), lastSuccessAt },
    }),
  );
}

/** Poll every active endpoint right now (the top bar's refresh button). */
export function refreshAll() {
  const active = [...stores.values()].filter((store) => store.listeners.size > 0);
  return Promise.all(active.map((store) => runPoll(store)));
}

/** Timestamp (ms) of the last successful poll of any endpoint; re-renders on change. */
export function useLastRefreshed() {
  const [at, setAt] = useState(lastSuccessAt);
  useEffect(() => {
    const handle = (event) => setAt(event.detail?.lastSuccessAt ?? null);
    window.addEventListener("shadowguard:backend-status", handle);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resync with the shared store after subscribing
    setAt(lastSuccessAt);
    return () => window.removeEventListener("shadowguard:backend-status", handle);
  }, []);
  return at;
}

export function getPollingOfflineStatus() {
  return isOffline();
}

/** True while any active poller cannot reach the backend. Re-renders on change. */
export function useBackendOffline() {
  const [offline, setOffline] = useState(isOffline);

  useEffect(() => {
    const handle = (event) => setOffline(Boolean(event.detail?.offline));
    window.addEventListener("shadowguard:backend-status", handle);
    // Recheck after subscribing in case polling status changed during mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resync with the shared store after subscribing
    setOffline(isOffline());
    return () => window.removeEventListener("shadowguard:backend-status", handle);
  }, []);

  return offline;
}

async function runPoll(store) {
  if (store.inFlight) return;
  store.inFlight = true;
  try {
    const data = await store.fn();
    store.state = { data, error: null, loading: false };
    store.status = "online";
    lastSuccessAt = Date.now();
  } catch (error) {
    // Keep the last good data. Only network failures mean "offline"; an HTTP
    // error (e.g. 404 for a deleted incident) means the server is reachable.
    store.state = { data: store.state.data, error, loading: false };
    store.status = error?.status ? "online" : "error";
  } finally {
    store.inFlight = false;
  }
  for (const listener of store.listeners) listener(store.state);
  publishBackendStatus();
}

/**
 * Poll an async function on an interval.
 *
 * Returns { data, error, loading }: data is the most recent successful result
 * (kept if a later poll fails), loading is true until the first result.
 * Pass the same `key` from several components to share one request.
 */
export default function usePolling(fn, interval = 3000, key) {
  const ownKey = useId();
  const storeKey = key || ownKey;

  const [state, setState] = useState(
    () => stores.get(storeKey)?.state ?? { data: null, error: null, loading: true },
  );

  useEffect(() => {
    let store = stores.get(storeKey);
    if (!store) {
      store = {
        fn,
        state: { data: null, error: null, loading: true },
        status: "checking",
        listeners: new Set(),
        timer: null,
        inFlight: false,
      };
      stores.set(storeKey, store);
    }
    store.fn = fn;
    store.listeners.add(setState);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show the shared store's current value on subscribe
    setState(store.state);

    if (store.listeners.size === 1) {
      runPoll(store);
      store.timer = window.setInterval(() => runPoll(store), Math.max(500, interval));
    }
    publishBackendStatus();

    return () => {
      store.listeners.delete(setState);
      if (store.listeners.size === 0) {
        window.clearInterval(store.timer);
        store.timer = null;
        if (!key) stores.delete(storeKey); // private stores are not reused
      }
      publishBackendStatus();
    };
  }, [storeKey, key, fn, interval]);

  return state;
}
