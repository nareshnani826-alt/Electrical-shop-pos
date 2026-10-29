"use client";

import { useEffect, useRef } from "react";

interface Props {
  onScan: (code: string) => void;
  /** Max ms between keystrokes for input to count as a scanner burst. Humans are >60ms. */
  maxGapMs?: number;
  minLength?: number;
  enabled?: boolean;
}

/**
 * HID barcode scanners "type" the code in a burst a few ms apart and finish with Enter.
 * We listen in the capture phase, buffer fast keystrokes and, when Enter ends a burst,
 * swallow that Enter and emit the code. Characters that already landed in a focused input
 * are cleaned up by the onScan handler (the POS clears the search box).
 */
export function BarcodeListener({ onScan, maxGapMs = 35, minLength = 6, enabled = true }: Props) {
  const buf = useRef("");
  const last = useRef(0);
  const cb = useRef(onScan);
  useEffect(() => {
    cb.current = onScan;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const now = performance.now();
      const gap = now - last.current;
      last.current = now;

      if (e.key === "Enter") {
        const code = buf.current;
        buf.current = "";
        if (code.length >= minLength && gap < maxGapMs * 3) {
          e.preventDefault();
          e.stopImmediatePropagation();
          cb.current(code);
        }
        return;
      }
      if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) {
        buf.current = "";
        return;
      }
      buf.current = gap > maxGapMs ? e.key : buf.current + e.key;
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [enabled, maxGapMs, minLength]);

  return null;
}
