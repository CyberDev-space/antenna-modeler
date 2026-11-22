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
  /**
   * Whether the program may fill the window, over the menu, the sidebar and
   * the footer of the site, with a button of its own. It then shows its own
   * switches of language and theme, as those of the site are under it. The
   * address gets `#full` meanwhile, so a page opened with it starts so.
   */
  maximizable?: boolean;
  /**
   * The language or the theme that the user chose in the program while it
   * fills the window, for the site to show itself in it too and give it
   * back through `language` and `theme`. Without them the program changes
   * only itself.
   */
  onLanguageChange?: (language: Language) => void;
  onThemeChange?: (theme: Theme) => void;
}

/** The mark in the address of a program that fills the window. */
const FULL = "#full";

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
export function AntennaModeler({
  language,
  theme,
  height = "calc(100vh - 5rem)",
  className,
  maximizable = true,
  onLanguageChange,
  onThemeChange,
}: AntennaModelerProps) {
  const host = useRef<HTMLDivElement>(null);
  const [shadow, setShadow] = useState<ShadowRoot | null>(null);
  useLayoutEffect(() => {
    const element = host.current!;
    setShadow(element.shadowRoot ?? element.attachShadow({ mode: "open" }));
  }, []);
  // The engine stops with the program, when the site leaves its page.
  useEffect(() => () => stopEngine(), []);
  const [maximized, setMaximized] = useState(() => maximizable && location.hash === FULL);
  useEffect(() => {
    // The address says so, for a reload or a link; the page under the program does not scroll.
    const url = new URL(location.href);
    url.hash = maximized ? FULL : url.hash === FULL ? "" : url.hash;
    if (url.href !== location.href) history.replaceState(history.state, "", url);
    if (!maximized) return;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = overflow;
    };
  }, [maximized]);
  const options = useMemo(
    () => ({
      language,
      theme,
      embedded: true,
      print: printSheet,
      maximizable,
      maximized,
      onMaximize: setMaximized,
      onLanguageChange,
      onThemeChange,
    }),
    [language, theme, maximizable, maximized, onLanguageChange, onThemeChange],
  );
  const style: Record<string, string | number> = maximized
    ? { "--am-height": "100dvh", position: "fixed", inset: 0, zIndex: 1000, overflow: "auto" }
    : { "--am-height": height };
  return (
    <div ref={host} className={className} style={style as CSSProperties}>
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
