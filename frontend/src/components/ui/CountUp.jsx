import { useEffect, useRef, useState } from "react";
import { formatNumber } from "../../lib/format.js";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Number that eases from its previous value to the new one. */
export default function CountUp({ value, duration = 500, format = formatNumber }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(prefersReducedMotion() ? target : 0);
  const shownRef = useRef(shown);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target || prefersReducedMotion()) {
      shownRef.current = target;
      setShown(target);
      return undefined;
    }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const next = Math.round(from + (target - from) * (1 - (1 - p) ** 3));
      shownRef.current = next;
      setShown(next);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return <span className="tabular">{format(shown)}</span>;
}
