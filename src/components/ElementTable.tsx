import { useState } from "react";
import { span } from "../deck";
import { copyElement, copyShift, elementRows, removeWires, setCentre, setLength, setRadius, shortestLength } from "../elements";
import type { Model } from "../model";
import { Hint } from "./Help";
import { NumberField } from "./NumberField";

interface Props {
  model: Model;
  /** A change of the model; `step` makes it a step of its own for Ctrl+Z. */
  onChange: (model: Model, step?: boolean) => void;
}

const AXES = ["x", "y", "z"] as const;

/** A value without the noise of binary fractions. */
const tidy = (value: number): number => Number(value.toPrecision(10)) + 0;

/**
 * The model by its elements, as the editor of Yagis in MMANA: every element
 * is a wire, or wires that go on from each other in one line, with its
 * centre, its length and its diameter or tubes.
 */
export function ElementTable({ model, onChange }: Props) {
  const rows = elementRows(model);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <div className="wires">
      <table>
        <thead>
          <tr>
            <th>№</th>
            <th>
              <Hint topic="elementWires">Дроти</Hint>
            </th>
            {AXES.map((axis) => (
              <th key={axis}>
                <Hint topic="elementCentre">{axis.toUpperCase()}, м</Hint>
              </th>
            ))}
            <th>
              <Hint topic="elementLength">Довжина, м</Hint>
            </th>
            <th>
              <Hint topic="elementDiameter">Ø, мм</Hint>
            </th>
            <th>
              <span className="sr-only">Дії</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.wires.join(" ")}>
              <td className="index">{row.number}</td>
              <td className="element-wires">{span(row.wires)}</td>
              {AXES.map((axis, k) => (
                <td key={axis}>
                  <NumberField
                    hideLabel
                    label={`Елемент ${row.number}, центр ${axis.toUpperCase()}`}
                    value={tidy(row.centre[k])}
                    onChange={(value) => onChange(setCentre(model, row.wires[0], axis, value))}
                  />
                </td>
              ))}
              <td>
                <NumberField
                  hideLabel
                  label={`Елемент ${row.number}, довжина`}
                  value={tidy(row.length)}
                  onChange={(value) => {
                    const changed = setLength(model, row.wires[0], value);
                    if (changed) {
                      setProblem(null);
                      onChange(changed);
                    } else {
                      const least = tidy(shortestLength(model, row.wires[0]));
                      setProblem(`Елемент ${row.number}: довжина має бути більшою за ${least} м, інакше кінці зайдуть за стики його труб.`);
                    }
                  }}
                />
              </td>
              <td>
                {row.diameter !== null ? (
                  <NumberField
                    hideLabel
                    label={`Елемент ${row.number}, діаметр`}
                    value={tidy(row.diameter * 1000)}
                    onChange={(value) => value > 0 && onChange(setRadius(model, row.wires, value / 2000))}
                  />
                ) : (
                  <Hint topic="elementTubes">
                    <span className="tubes">{row.tubes ? row.tubes.map((one) => tidy(one.diameter * 1000)).join(" / ") : "різні"}</span>
                  </Hint>
                )}
              </td>
              <td className="element-actions">
                <Hint topic="elementCopy">
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => {
                      setProblem(null);
                      onChange(copyElement(model, row.wires, copyShift(model, rows, row)), true);
                    }}
                  >
                    Копія
                  </button>
                </Hint>
                <button
                  type="button"
                  className="quiet"
                  aria-label={`Вилучити елемент ${row.number}`}
                  onClick={() => {
                    setProblem(null);
                    onChange(removeWires(model, row.wires), true);
                  }}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {problem && <p className="note problem">{problem}</p>}
    </div>
  );
}
