"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Track an element's content-box size.
 *
 * Three places need it for the same reason: an agent-authored page must be laid
 * out at its own pixel width (1080px for a Xiaohongshu card) and then scaled to
 * whatever space the UI has. Sizing the iframe to the container instead would
 * reflow the design at the wrong width — and since the PNG export reads
 * `documentElement.clientWidth`, that wrong width would ship in the export too.
 *
 * Returns `null` until first measurement, so callers can hold off rendering the
 * iframe until they know the scale and avoid a visible jump.
 */
export function useElementSize<T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  size: { width: number; height: number } | null;
} {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { clientWidth: width, clientHeight: height } = el;
      if (width > 0 && height > 0) {
        setSize((prev) =>
          prev && prev.width === width && prev.height === height ? prev : { width, height },
        );
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}
