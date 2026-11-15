import type { Equivalent } from "../deck";
import type { Wire } from "../model";
import { Hint } from "./Help";
import { NumberField } from "./NumberField";
import { t } from "../i18n";

interface Props {
  wires: Wire[];
  /** The number of segments that the program uses for every wire, if the model is sound. */
  segments: number[];
  /** The elements of tubes that the engine gets as one wire each. */
  equivalents: Equivalent[];
  onChange: (wires: Wire[]) => void;
  /** Removes a wire, with the sources and loads on it; those on later wires stay on their wires. */
  onRemove: (index: number) => void;
}

const COORDINATES = ["x1", "y1", "z1", "x2", "y2", "z2"] as const;

/** Radius in millimetres without the noise of binary fractions. */
const millimetres = (metres: number): number => Number((metres * 1000).toPrecision(10));

/** The table of wires, as in MMANA: ends in metres, radius in millimetres. */
export function WireTable({ wires, segments, equivalents, onChange, onRemove }: Props) {
  const replaced = new Set(equivalents.flatMap((one) => one.wires));
  const update = (index: number, change: Partial<Wire>) =>
    onChange(wires.map((wire, i) => (i === index ? { ...wire, ...change } : wire)));
  const add = () => {
    const last = wires[wires.length - 1];
    onChange([...wires, last ? { ...last } : { x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 1, radius: 0.001, segments: -1 }]);
  };

  return (
    <div className="wires">
      <table>
        <thead>
          <tr>
            <th>№</th>
            {COORDINATES.map((name) => (
              <th key={name}>
                <Hint topic="wireEnds">{t("{coordinate}, м", { coordinate: name.toUpperCase() })}</Hint>
              </th>
            ))}
            <th>
              <Hint topic="wireRadius">{t("R, мм")}</Hint>
            </th>
            <th>
              <Hint topic="wireSegments">{t("Сегм.")}</Hint>
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {wires.map((wire, index) => (
            <tr key={index}>
              <td className="index">{index + 1}</td>
              {COORDINATES.map((name) => (
                <td key={name}>
                  <NumberField
                    hideLabel
                    label={t("Дріт {wire}, {coordinate}", { wire: index + 1, coordinate: name.toUpperCase() })}
                    value={wire[name]}
                    onChange={(value) => update(index, { [name]: value })}
                  />
                </td>
              ))}
              <td>
                <NumberField
                  hideLabel
                  label={t("Дріт {wire}, радіус", { wire: index + 1 })}
                  value={millimetres(wire.radius)}
                  onChange={(value) => update(index, { radius: value / 1000 })}
                />
              </td>
              <td className="segments">
                <NumberField
                  hideLabel
                  label={t("Дріт {wire}, сегменти", { wire: index + 1 })}
                  value={wire.segments}
                  onChange={(value) => update(index, { segments: Math.round(value) })}
                />
                {replaced.has(index) ? (
                  <Hint topic="taperCorrection">
                    <span className="auto">{t("Л")}</span>
                  </Hint>
                ) : (
                  wire.segments <= 0 && segments[index] !== undefined && <span className="auto">{segments[index]}</span>
                )}
              </td>
              <td>
                <button
                  type="button"
                  className="quiet"
                  aria-label={t("Вилучити дріт {wire}", { wire: index + 1 })}
                  onClick={() => onRemove(index)}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={add}>
        {t("Додати дріт")}
      </button>
    </div>
  );
}
