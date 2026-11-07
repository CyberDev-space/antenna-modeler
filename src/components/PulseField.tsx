import { useEffect, useState } from "react";
import { formatPulse, parsePulse, type Pulse } from "../model";

interface Props {
  label: string;
  value: Pulse;
  onChange: (pulse: Pulse) => void;
}

const same = (a: Pulse | null, b: Pulse): boolean =>
  a !== null && a.wire === b.wire && a.place === b.place && (a.offset ?? 0) === (b.offset ?? 0);

/** A field for a place on a wire in the notation of MMANA: `w1c`, `w2b`, `w3e1`. */
export function PulseField({ label, value, onChange }: Props) {
  const [text, setText] = useState(formatPulse(value));
  // Follow a place that changed elsewhere, but leave the text being typed alone.
  useEffect(() => {
    setText((current) => (same(parsePulse(current), value) ? current : formatPulse(value)));
  }, [value]);
  const invalid = parsePulse(text) === null;

  return (
    <label className="field">
      <span title="w1c: центр дроту 1; b: початок; e: кінець; w1c2: на два сегменти далі">{label}</span>
      <input
        type="text"
        className={invalid ? "number invalid" : "number"}
        aria-invalid={invalid}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = parsePulse(event.target.value);
          if (parsed) onChange(parsed);
        }}
        onBlur={() => setText(formatPulse(value))}
      />
    </label>
  );
}
