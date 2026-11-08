import { useEffect, useState } from "react";
import type { TopicKey } from "../help";
import { Hint, useHelp } from "./Help";

interface Props {
  value: number;
  onChange: (value: number) => void;
  label: string;
  /** Shows the label only to screen readers, for cells of a table. */
  hideLabel?: boolean;
  /** The topic of the help that pops up over the label. */
  help?: TopicKey;
  width?: string;
}

/** Reads a number as the user types it; a comma is a decimal point too. */
function parse(text: string): number {
  const trimmed = text.trim().replace(",", ".");
  return trimmed === "" ? NaN : Number(trimmed);
}

/**
 * A field for a number. The text stays as typed ("-", "0.", "5,05"), and
 * the value is passed on whenever the text is a number.
 */
export function NumberField({ value, onChange, label, hideLabel, help, width }: Props) {
  const helper = useHelp();
  const [text, setText] = useState(String(value));
  // Follow a value that changed elsewhere, but leave the text being typed alone.
  useEffect(() => {
    setText((current) => (parse(current) === value ? current : String(value)));
  }, [value]);

  const invalid = !Number.isFinite(parse(text));
  const input = (
    <input
      type="text"
      inputMode="decimal"
      className={invalid ? "number invalid" : "number"}
      style={width ? { width } : undefined}
      aria-label={hideLabel ? label : undefined}
      aria-invalid={invalid}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        const parsed = parse(event.target.value);
        if (Number.isFinite(parsed)) onChange(parsed);
      }}
      onFocus={(event) => {
        if (help && helper && event.target.matches(":focus-visible")) helper.show(help, event.target);
      }}
      onBlur={() => {
        setText(String(value));
        helper?.hide();
      }}
    />
  );
  if (hideLabel) return input;
  return (
    <label className="field">
      <span>{help ? <Hint topic={help}>{label}</Hint> : label}</span>
      {input}
    </label>
  );
}
