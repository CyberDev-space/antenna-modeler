import { resonance } from "../loads";
import type { Load } from "../model";
import { NumberField } from "./NumberField";
import { PulseField } from "./PulseField";

interface Props {
  loads: Load[];
  onChange: (loads: Load[]) => void;
}

/** The loads in the wires: coils, capacitors, traps and fixed impedances, as in MMANA. */
export function LoadTable({ loads, onChange }: Props) {
  const replace = (index: number, load: Load) => onChange(loads.map((one, i) => (i === index ? load : one)));
  const add = () => onChange([...loads, { kind: "lc", at: { wire: 0, place: "c" }, inductance: 0, capacitance: 0, q: 0 }]);

  return (
    <div className="loads">
      {loads.map((load, index) => {
        const trap = resonance(load);
        return (
          <div className="load" key={index}>
            <span className="index">{index + 1}</span>
            <PulseField label="Місце" value={load.at} onChange={(at) => replace(index, { ...load, at })} />
            <label className="field">
              <span>Тип</span>
              <select
                value={load.kind}
                onChange={(event) =>
                  replace(
                    index,
                    event.target.value === "lc"
                      ? { kind: "lc", at: load.at, inductance: 0, capacitance: 0, q: 0 }
                      : { kind: "rx", at: load.at, resistance: 50, reactance: 0 },
                  )
                }
              >
                <option value="lc">LC</option>
                <option value="rx">R + jX</option>
              </select>
            </label>
            {load.kind === "lc" ? (
              <>
                <NumberField label="L, мкГн" value={load.inductance} onChange={(inductance) => replace(index, { ...load, inductance })} />
                <NumberField label="C, пФ" value={load.capacitance} onChange={(capacitance) => replace(index, { ...load, capacitance })} />
                <NumberField
                  label="Q"
                  title="Добротність котушки, а без котушки — конденсатора. 0: без втрат"
                  value={load.q}
                  onChange={(q) => replace(index, { ...load, q })}
                />
              </>
            ) : (
              <>
                <NumberField label="R, Ом" value={load.resistance} onChange={(resistance) => replace(index, { ...load, resistance })} />
                <NumberField label="X, Ом" value={load.reactance} onChange={(reactance) => replace(index, { ...load, reactance })} />
              </>
            )}
            <button
              type="button"
              className="quiet remove"
              aria-label={`Вилучити навантаження ${index + 1}`}
              onClick={() => onChange(loads.filter((_, i) => i !== index))}
            >
              ×
            </button>
            {trap !== null && <span className="resonance">трап на {trap.toFixed(3)} МГц</span>}
          </div>
        );
      })}
      <button type="button" onClick={add}>
        Додати навантаження
      </button>
    </div>
  );
}
