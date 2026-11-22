import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TOPICS, type Topic, type TopicKey } from "../help";
import { TOPICS_EN } from "../help.en";
import { language, t } from "../i18n";

interface Help {
  /** Whether the help pops up at all: those who know the program can turn it off. */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  /** Shows the help of a topic beside an element, after a short wait. */
  show: (topic: TopicKey, anchor: Element) => void;
  hide: () => void;
}

const HelpContext = createContext<Help | null>(null);

const STORAGE_KEY = "antenna-modeler.help";

/** The help waits this long under the pointer, so that it does not flicker while the pointer passes. */
const WAIT = 350;

/** The help of the page: the switch and the one popup that shows a topic beside its element. */
export function HelpProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledNow] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const [active, setActive] = useState<{ topic: TopicKey; anchor: Element } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setActive(null);
  }, []);
  const show = useCallback(
    (topic: TopicKey, anchor: Element) => {
      if (!enabled) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setActive({ topic, anchor }), WAIT);
    },
    [enabled],
  );
  const setEnabled = useCallback(
    (value: boolean) => {
      setEnabledNow(value);
      if (!value) hide();
      try {
        localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
      } catch {
        // Without storage the choice lasts until the page is closed.
      }
    },
    [hide],
  );

  // Escape, a scroll, or the pointer elsewhere closes the help; so does the
  // page when it draws the element anew, which then hears no leaving pointer.
  useEffect(() => {
    if (!active) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    const elsewhere = (event: PointerEvent) => {
      if (!active.anchor.isConnected || !active.anchor.contains(event.target as Node)) hide();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("pointerdown", elsewhere, true);
    window.addEventListener("pointerover", elsewhere, true);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("pointerdown", elsewhere, true);
      window.removeEventListener("pointerover", elsewhere, true);
    };
  }, [active, hide]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const value = useMemo(() => ({ enabled, setEnabled, show, hide }), [enabled, setEnabled, show, hide]);
  return (
    <HelpContext.Provider value={value}>
      {children}
      {/* In a modal window the popup must be inside it: the rest of the page is under the window. */}
      {active &&
        enabled &&
        createPortal(<Popup topic={active.topic} anchor={active.anchor} onGone={hide} />, active.anchor.closest("dialog[open]") ?? document.body)}
    </HelpContext.Provider>
  );
}

/** The help of the page, for the controls that show it themselves. */
export function useHelp(): Help | null {
  return useContext(HelpContext);
}

/** Text with notations between backticks, which are shown as code. */
function rich(text: string): ReactNode {
  const parts = text.split("`");
  return parts.length === 1 ? text : parts.map((part, index) => (index % 2 === 1 ? <code key={index}>{part}</code> : part));
}

/**
 * The popup with a topic, below its element, or above it when there is more
 * room there; always inside the window.
 */
function Popup({ topic, anchor, onGone }: { topic: TopicKey; anchor: Element; onGone: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const reposition = () => {
      if (!anchor.isConnected) return onGone();
      // The window without its scroll bars.
      const { clientWidth, clientHeight } = document.documentElement;
      const target = anchor.getBoundingClientRect();
      const { width, height } = element.getBoundingClientRect();
      const margin = 8;
      const gap = 6;
      const left = Math.max(margin, Math.min(target.left, clientWidth - width - margin));
      const below = clientHeight - margin - target.bottom - gap;
      const above = target.top - margin - gap;
      const top =
        height <= below || (height > above && below >= above)
          ? Math.min(target.bottom + gap, clientHeight - margin - height)
          : target.top - gap - height;
      setPlace({ left, top: Math.max(margin, top) });
    };
    reposition();
    // The text can wrap otherwise once the popup stands in its place: it is placed again whenever its size changes.
    const observer = new ResizeObserver(reposition);
    observer.observe(element);
    return () => observer.disconnect();
  }, [anchor, topic, onGone]);
  const { title, what, table, how, howTitle, affects, defaults }: Topic = (language() === "en" ? TOPICS_EN : TOPICS)[topic];
  return (
    <div
      ref={box}
      className="help-popup"
      role="tooltip"
      style={place ? { left: place.left, top: place.top } : { left: -9999, top: 0, visibility: "hidden" }}
    >
      <div className="help-title">{title}</div>
      <p className="help-what">{rich(what)}</p>
      {table && (
        <div className="help-section">
          <div className="help-label">{table.title}</div>
          <table className="help-table">
            <tbody>
              {table.rows.map(([name, value]) => (
                <tr key={name}>
                  <th scope="row">{rich(name)}</th>
                  <td>{rich(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {how && (
        <div className="help-section">
          <div className="help-label">{howTitle ?? t("Як користуватися")}</div>
          <ul>
            {how.map((line) => (
              <li key={line}>{rich(line)}</li>
            ))}
          </ul>
        </div>
      )}
      {affects && (
        <div className="help-section">
          <div className="help-label">{t("Впливає на")}</div>
          <p>{rich(affects)}</p>
        </div>
      )}
      {defaults && (
        <div className="help-default">
          <span className="help-label">{t("Типово")}</span>
          <span>{rich(defaults)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Something whose help pops up when the pointer rests on it, or when the
 * keyboard brings the focus into it. With the help switched on, its text
 * is underlined with dots.
 */
export function Hint({ topic, children }: { topic: TopicKey; children: ReactNode }) {
  const help = useHelp();
  if (!help) return <>{children}</>;
  return (
    <span
      className={help.enabled ? "hint on" : "hint"}
      onMouseEnter={(event) => help.show(topic, event.currentTarget)}
      onMouseLeave={help.hide}
      onFocus={(event) => {
        if ((event.target as Element).matches(":focus-visible")) help.show(topic, event.currentTarget);
      }}
      onBlur={help.hide}
    >
      {children}
    </span>
  );
}

/** The switch of the help, for the top bar. */
export function HelpSwitch() {
  const help = useHelp();
  if (!help) return null;
  return (
    <Hint topic="helpToggle">
      <button
        type="button"
        className={help.enabled ? "quiet help-switch on" : "quiet help-switch"}
        aria-pressed={help.enabled}
        onClick={() => help.setEnabled(!help.enabled)}
      >
        <span aria-hidden="true" className="help-mark">
          ?
        </span>
        <span className="help-switch-label">{t("Підказки")}</span>
      </button>
    </Hint>
  );
}
