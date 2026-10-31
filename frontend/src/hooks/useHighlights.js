import { useEffect, useRef, useState } from "react";

/**
 * Ids of items that appeared, or whose signature (e.g. risk score) changed, since
 * the previous poll. Nothing is highlighted on the first load. Each id stays
 * highlighted for `duration` ms.
 */
export default function useHighlights(items, getId, getSignature = () => "", duration = 2500) {
  const [active, setActive] = useState(() => new Set());
  const previousRef = useRef(null);
  const timersRef = useRef(new Map());

  useEffect(() => {
    if (!Array.isArray(items)) return;
    const current = new Map(items.map((item) => [getId(item), String(getSignature(item))]));
    const previous = previousRef.current;
    previousRef.current = current;
    if (previous === null) return;

    const changed = [...current]
      .filter(([id, signature]) => !previous.has(id) || previous.get(id) !== signature)
      .map(([id]) => id);
    if (changed.length === 0) return;

    setActive((prev) => new Set([...prev, ...changed]));
    for (const id of changed) {
      window.clearTimeout(timersRef.current.get(id));
      timersRef.current.set(
        id,
        window.setTimeout(() => {
          setActive((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          timersRef.current.delete(id);
        }, duration),
      );
    }
    // getId/getSignature are plain accessors; re-running only on new data is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, duration]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
    };
  }, []);

  return active;
}
