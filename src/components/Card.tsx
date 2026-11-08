import { useEffect, useState, type ReactNode } from "react";

interface Props {
  title: ReactNode;
  /** Controls and readouts beside the title. */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * A panel of the workspace with a title. A button spreads it over the whole
 * workspace, to look at a chart in detail; Escape or the button again puts it back.
 */
export function Card({ title, actions, className, children }: Props) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);

  return (
    <section className={["card", expanded ? "expanded" : "", className ?? ""].join(" ").trim()}>
      <header className="card-head">
        <h3>{title}</h3>
        <span className="card-actions">
          {actions}
          <button
            type="button"
            className="quiet icon"
            aria-pressed={expanded}
            aria-label={expanded ? "Згорнути" : "Розгорнути на всю область"}
            title={expanded ? "Згорнути (Esc)" : "Розгорнути на всю область"}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "↙" : "↗"}
          </button>
        </span>
      </header>
      <div className="card-body">{children}</div>
    </section>
  );
}
