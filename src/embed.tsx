import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { App } from "./App";
import { stopEngine } from "./engine";
import type { Theme } from "./host";
import type { Language } from "./i18n";
import styles from "./styles.css?raw";

export type { Language } from "./i18n";
export type { Theme } from "./host";

export interface AntennaModelerProps {
  /** The language of the site. The program shows no list of languages of its own. */
  language: Language;
  /** The theme of the site; it may change at any time. The program shows no switch of its own. */
  theme: Theme;
  /**
   * The height of the program as a CSS length: on a wide screen it fills it,
   * the editor and the workspace each scrolling on its own. On a narrow one it
   * is a column as long as it needs.
   */
  height?: string;
  className?: string;
}

/**
 * The antenna modeler as a component of another site, built with React. It
 * lives in a shadow root, so that its styles and those of the site do not
 * touch each other; its layout follows its own width, not that of the window.
 *
 * The bundler of the site must handle what the program uses: TypeScript and
 * JSX, `new Worker(new URL(…, import.meta.url))` for the engine, the
 * `.wasm` file of nec2-wasm as an asset, and `?raw` for the stylesheet as
 * text. Vite does all of it by itself.
 */
export function AntennaModeler({ language, theme, height = "calc(100vh - 5rem)", className }: AntennaModelerProps) {
  const host = useRef<HTMLDivElement>(null);
  const [shadow, setShadow] = useState<ShadowRoot | null>(null);
  useLayoutEffect(() => {
    const element = host.current!;
    setShadow(element.shadowRoot ?? element.attachShadow({ mode: "open" }));
  }, []);
  // The engine stops with the program, when the site leaves its page.
  useEffect(() => () => stopEngine(), []);
  const options = useMemo(() => ({ language, theme, embedded: true, print: printSheet }), [language, theme]);
  return (
    <div ref={host} className={className} style={{ "--am-height": height } as CSSProperties}>
      {shadow &&
        createPortal(
          <>
            <style>{styles}</style>
            <App options={options} />
          </>,
          shadow,
        )}
    </div>
  );
}

/**
 * Prints the sheet in a window of its own: printed where it is, it would
 * come with the whole page of the site around it.
 */
function printSheet(sheet: HTMLElement): void {
  const sheetWindow = window.open("", "_blank");
  if (!sheetWindow) return;
  const title = sheet.querySelector("h1")?.textContent ?? "";
  sheetWindow.document.write(
    `<!doctype html><html lang="${document.documentElement.lang}"><head><meta charset="utf-8"><title>${escape(title)}</title>` +
      `<style>${styles}</style></head><body class="sheet-preview">${sheet.outerHTML}</body></html>`,
  );
  sheetWindow.document.close();
  sheetWindow.focus();
  // Once its images, the mark of the author among them, are in, and only once.
  let printed = false;
  const print = () => {
    if (printed) return;
    printed = true;
    sheetWindow.print();
  };
  if (sheetWindow.document.readyState === "complete") print();
  else sheetWindow.addEventListener("load", print);
}

const escape = (text: string): string => text.replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`);
