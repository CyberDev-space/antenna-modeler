import { useState } from "react";
import { span, type Equivalent } from "../deck";
import { ALUMINIUM, COPPER, type GroundKind, type Model } from "../model";
import { scaleModel } from "../scale";
import { taperedElements } from "../taper";
import { Hint } from "./Help";
import { NumberField } from "./NumberField";
import { N, t } from "../i18n";

interface Props {
  model: Model;
  /** A change of the model; `step` makes it a step of its own for Ctrl+Z. */
  onChange: (model: Model, step?: boolean) => void;
  /** The elements of tubes that the engine gets as Leeson's equivalent cylinders. */
  equivalents: Equivalent[];
}

const GROUNDS: [GroundKind, string][] = [
  ["free", N("Вільний простір")],
  ["perfect", N("Ідеальна")],
  ["real", N("Реальна")],
];

/** The materials that have a name; any other conductivity is the user's own. */
const MATERIALS: [conductivity: number, name: string][] = [
  [0, N("Без втрат")],
  [COPPER, N("Мідь")],
  [ALUMINIUM, N("Алюміній")],
];

/** Megasiemens per metre without the noise of binary fractions, and back. */
const toMega = (value: number): number => Number((value / 1e6).toPrecision(12));
const fromMega = (value: number): number => Number((value * 1e6).toPrecision(12));

/** Frequency, feed line, material of the wires and ground. */
export function Settings({ model, onChange, equivalents }: Props) {
  const named = MATERIALS.some(([conductivity]) => conductivity === model.wireConductivity);
  // The conductivity that the user chose to give as a number: it stays the
  // user's own also when its value is that of a metal.
  const [typed, setTyped] = useState<number | null>(null);
  const own = !named || typed === model.wireConductivity;
  // The form that moves the whole antenna to another frequency.
  const [scaling, setScaling] = useState(false);
  const [target, setTarget] = useState(model.frequency);
  const [withRadii, setWithRadii] = useState(true);

  return (
    <div className="settings">
      <NumberField label={t("Частота, МГц")} help="frequency" value={model.frequency} onChange={(frequency) => onChange({ ...model, frequency })} />
      <Hint topic="scaleTo">
        <button
          type="button"
          className="quiet scale-toggle"
          aria-expanded={scaling}
          onClick={() => {
            setTarget(model.frequency);
            setScaling(!scaling);
          }}
        >
          {t("Перенести на частоту…")}
        </button>
      </Hint>
      {scaling && (
        <div className="scale-form">
          <NumberField label={t("Нова частота, МГц")} help="scaleTo" value={target} onChange={setTarget} />
          <label className="toggle">
            <input type="checkbox" checked={withRadii} onChange={(event) => setWithRadii(event.target.checked)} />
            <Hint topic="scaleRadii">{t("разом із діаметрами")}</Hint>
          </label>
          <button
            type="button"
            className="primary"
            disabled={!(target > 0) || target === model.frequency}
            onClick={() => {
              onChange(scaleModel(model, target, withRadii), true);
              setScaling(false);
            }}
          >
            {t("Перенести")}
          </button>
          <button type="button" className="quiet" onClick={() => setScaling(false)}>
            {t("Скасувати")}
          </button>
        </div>
      )}
      <NumberField label={t("Лінія, Ом")} help="reference" value={model.reference} onChange={(reference) => onChange({ ...model, reference })} />
      <label className="field">
        <span>
          <Hint topic="material">{t("Матеріал дротів")}</Hint>
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
              {t(name)}
            </option>
          ))}
          <option value="own">{t("Своя провідність")}</option>
        </select>
      </label>
      {own && (
        <NumberField
          label={t("Провідність, МСм/м")}
          help="ownConductivity"
          value={toMega(model.wireConductivity)}
          onChange={(value) => {
            setTyped(fromMega(value));
            onChange({ ...model, wireConductivity: fromMega(value) });
          }}
        />
      )}

      {taperedElements(model.wires).length > 0 && (
        <div className="taper-correction">
          <label className="toggle">
            <input type="checkbox" checked={model.taperCorrection} onChange={(event) => onChange({ ...model, taperCorrection: event.target.checked })} />
            <Hint topic="taperCorrection">{t("Поправка Лісона для труб різного діаметра")}</Hint>
          </label>
          {model.taperCorrection && equivalents.length > 0 && (
            <ul>
              {equivalents.map((one) => (
                <li key={one.wires.join(" ")}>
                  {t("Дроти {wires}: рівний дріт {length} м, Ø {diameter} мм", {
                    wires: span(one.wires),
                    length: one.length.toFixed(3),
                    diameter: (2000 * one.radius).toFixed(2),
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <fieldset>
        <legend>
          <Hint topic="ground">{t("Земля")}</Hint>
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
              {t(name)}
            </label>
          ))}
        </div>
        {model.ground.kind !== "free" && (
          <div className="ground-values">
            <NumberField
              label={t("Додати висоту, м")}
              help="height"
              value={model.height}
              onChange={(height) => onChange({ ...model, height })}
            />
            {model.ground.kind === "real" && (
              <>
                <NumberField
                  label={t("Проникність ε")}
                  help="permittivity"
                  value={model.ground.permittivity}
                  onChange={(permittivity) => onChange({ ...model, ground: { ...model.ground, permittivity } })}
                />
                <NumberField
                  label={t("Провідність, См/м")}
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
