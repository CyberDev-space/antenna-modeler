import { resonance } from "../loads";
import type { Load } from "../model";
import { Hint } from "./Help";
import { NumberField } from "./NumberField";
import { PulseField } from "./PulseField";
import { t } from "../i18n";

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
            <PulseField label={t("Місце")} help="loadPulse" value={load.at} onChange={(at) => replace(index, { ...load, at })} />
            <label className="field">
              <span>
                <Hint topic="loadType">{t("Тип")}</Hint>
              </span>
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
                <NumberField label={t("L, мкГн")} help="loadL" value={load.inductance} onChange={(inductance) => replace(index, { ...load, inductance })} />
                <NumberField label={t("C, пФ")} help="loadC" value={load.capacitance} onChange={(capacitance) => replace(index, { ...load, capacitance })} />
                <NumberField
                  label="Q"
                  help="loadQ"
                  value={load.q}
                  onChange={(q) => replace(index, { ...load, q })}
                />
              </>
            ) : (
              <>
                <NumberField label={t("R, Ом")} help="loadR" value={load.resistance} onChange={(resistance) => replace(index, { ...load, resistance })} />
                <NumberField label={t("X, Ом")} help="loadX" value={load.reactance} onChange={(reactance) => replace(index, { ...load, reactance })} />
              </>
            )}
            <button
              type="button"
              className="quiet remove"
              aria-label={t("Вилучити навантаження {n}", { n: index + 1 })}
              onClick={() => onChange(loads.filter((_, i) => i !== index))}
            >
              ×
            </button>
            {trap !== null && <span className="resonance">{t("трап на {frequency} МГц", { frequency: trap.toFixed(3) })}</span>}
          </div>
        );
      })}
      <button type="button" onClick={add}>
        {t("Додати навантаження")}
      </button>
    </div>
  );
}
