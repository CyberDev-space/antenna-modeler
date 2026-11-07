import type { Wire } from "../model";
import { NumberField } from "./NumberField";

interface Props {
  wires: Wire[];
  /** The number of segments that the program uses for every wire, if the model is sound. */
  segments: number[];
  onChange: (wires: Wire[]) => void;
}

const COORDINATES = ["x1", "y1", "z1", "x2", "y2", "z2"] as const;

/** Radius in millimetres without the noise of binary fractions. */
const millimetres = (metres: number): number => Number((metres * 1000).toPrecision(10));

/** The table of wires, as in MMANA: ends in metres, radius in millimetres. */
export function WireTable({ wires, segments, onChange }: Props) {
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
              <th key={name}>{name.toUpperCase()}, м</th>
            ))}
            <th>R, мм</th>
            <th title="−1: програма вибирає сама">Сегм.</th>
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
                    label={`Дріт ${index + 1}, ${name.toUpperCase()}`}
                    value={wire[name]}
                    onChange={(value) => update(index, { [name]: value })}
                  />
                </td>
              ))}
              <td>
                <NumberField
                  hideLabel
                  label={`Дріт ${index + 1}, радіус`}
                  value={millimetres(wire.radius)}
                  onChange={(value) => update(index, { radius: value / 1000 })}
                />
              </td>
              <td className="segments">
                <NumberField
                  hideLabel
                  label={`Дріт ${index + 1}, сегменти`}
                  value={wire.segments}
                  onChange={(value) => update(index, { segments: Math.round(value) })}
                />
                {wire.segments <= 0 && segments[index] !== undefined && <span className="auto">{segments[index]}</span>}
              </td>
              <td>
                <button
                  type="button"
                  className="quiet"
                  aria-label={`Вилучити дріт ${index + 1}`}
                  onClick={() => onChange(wires.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={add}>
        Додати дріт
      </button>
    </div>
  );
}
