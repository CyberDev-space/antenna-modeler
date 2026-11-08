import { useState } from "react";
import { ALUMINIUM, COPPER, type GroundKind, type Model } from "../model";
import { Hint } from "./Help";
import { NumberField } from "./NumberField";

interface Props {
  model: Model;
  onChange: (model: Model) => void;
}

const GROUNDS: [GroundKind, string][] = [
  ["free", "Вільний простір"],
  ["perfect", "Ідеальна"],
  ["real", "Реальна"],
];

/** The materials that have a name; any other conductivity is the user's own. */
const MATERIALS: [conductivity: number, name: string][] = [
  [0, "Без втрат"],
  [COPPER, "Мідь"],
  [ALUMINIUM, "Алюміній"],
];

/** Megasiemens per metre without the noise of binary fractions, and back. */
const toMega = (value: number): number => Number((value / 1e6).toPrecision(12));
const fromMega = (value: number): number => Number((value * 1e6).toPrecision(12));

/** Frequency, feed line, material of the wires and ground. */
export function Settings({ model, onChange }: Props) {
  const named = MATERIALS.some(([conductivity]) => conductivity === model.wireConductivity);
  // The conductivity that the user chose to give as a number: it stays the
  // user's own also when its value is that of a metal.
  const [typed, setTyped] = useState<number | null>(null);
  const own = !named || typed === model.wireConductivity;

  return (
    <div className="settings">
      <NumberField label="Частота, МГц" help="frequency" value={model.frequency} onChange={(frequency) => onChange({ ...model, frequency })} />
      <NumberField label="Лінія, Ом" help="reference" value={model.reference} onChange={(reference) => onChange({ ...model, reference })} />
      <label className="field">
        <span>
          <Hint topic="material">Матеріал дротів</Hint>
        </span>
        <select
          value={own ? "own" : String(model.wireConductivity)}
          onChange={(event) => {
            const metal = event.target.value !== "own";
            setTyped(metal ? null : model.wireConductivity);
            if (metal) onChange({ ...model, wireConductivity: Number(event.target.value) });
          }}
        >
          {MATERIALS.map(([conductivity, name]) => (
            <option key={name} value={String(conductivity)}>
              {name}
            </option>
          ))}
          <option value="own">Своя провідність</option>
        </select>
      </label>
      {own && (
        <NumberField
          label="Провідність, МСм/м"
          help="ownConductivity"
          value={toMega(model.wireConductivity)}
          onChange={(value) => {
            setTyped(fromMega(value));
            onChange({ ...model, wireConductivity: fromMega(value) });
          }}
        />
      )}

      <fieldset>
        <legend>
          <Hint topic="ground">Земля</Hint>
        </legend>
        <div className="choices">
          {GROUNDS.map(([kind, name]) => (
            <label key={kind}>
              <input
                type="radio"
                name="ground"
                checked={model.ground.kind === kind}
                onChange={() => onChange({ ...model, ground: { ...model.ground, kind } })}
              />
              {name}
            </label>
          ))}
        </div>
        {model.ground.kind !== "free" && (
          <div className="ground-values">
            <NumberField
              label="Додати висоту, м"
              help="height"
              value={model.height}
              onChange={(height) => onChange({ ...model, height })}
            />
            {model.ground.kind === "real" && (
              <>
                <NumberField
                  label="Проникність ε"
                  help="permittivity"
                  value={model.ground.permittivity}
                  onChange={(permittivity) => onChange({ ...model, ground: { ...model.ground, permittivity } })}
                />
                <NumberField
                  label="Провідність, См/м"
                  help="groundConductivity"
                  value={model.ground.conductivity}
                  onChange={(conductivity) => onChange({ ...model, ground: { ...model.ground, conductivity } })}
                />
              </>
            )}
          </div>
        )}
      </fieldset>
    </div>
  );
}
