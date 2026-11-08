import { useEffect, useRef, useState, type RefObject } from "react";

/** The font size of the page at which the charts were drawn, in pixels. */
const BASE_FONT = 15;

/**
 * How many times the font of the page is larger than usual: it grows on a
 * large screen, and the charts scale the room for their labels by it.
 */
export function fontScale(): number {
  return (parseFloat(getComputedStyle(document.documentElement).fontSize) || BASE_FONT) / BASE_FONT;
}

/** The size in CSS pixels of the element that the returned ref is attached to; zero while it is hidden. */
export function useSize<T extends HTMLElement>(): [RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((now) => (now.width === width && now.height === height ? now : { width, height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}
