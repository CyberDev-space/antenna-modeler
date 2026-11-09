import { useState } from "react";
import { CURRENT_POWER, magnitude, phase, unwrap, type CurrentLine } from "../currents";
import { span } from "../deck";
import type { Model } from "../model";
import { Card } from "./Card";
import { Hint } from "./Help";
import { LineChart } from "./LineChart";

interface Props {
  lines: CurrentLine[];
  /** The model as it is now, to find the element of the first source. */
  model: Model;
  /** Whether the model was changed after these currents were computed. */
  stale: boolean;
}

/** The least span of the axis of the phase, in degrees. */
const PHASE_SPAN = 30;

const metres = (value: number): string => Number(value.toFixed(3)).toString();
const signed = (value: number, digits: number): string => value.toFixed(digits).replace("-", "−");
const point = (at: number[]): string => at.map((value) => Number(value.toFixed(3))).join("; ");

/** The name of an element by its wires. */
const nameOf = (line: CurrentLine): string => (line.wires.length === 1 ? `Дріт ${line.wires[0] + 1}` : `Дроти ${span(line.wires)}`);

/** The currents along one element at a time: their magnitude and their phase from one end to the other. */
export function CurrentsPanel({ lines, model, stale }: Props) {
  const fed = model.sources.find((source) => source.voltage !== 0)?.at.wire;
  const first = Math.max(0, lines.findIndex((line) => fed !== undefined && line.wires.includes(fed)));
  const [chosen, setChosen] = useState<number | null>(null);
  const index = chosen !== null && chosen < lines.length ? chosen : first;
  const line = lines[index];
  if (!line) return <p className="note">У моделі немає струмів, щоб їх показати.</p>;

  const distances = line.samples.map((sample) => sample.distance);
  const magnitudes = line.samples.map((sample) => magnitude(sample.current));
  // The phase of nothing has no meaning: the ends of a free element are left out of it.
  const live = line.samples.filter((sample) => magnitude(sample.current) > 0);
  const phases = unwrap(live.map((sample) => phase(sample.current)));
  // A phase that barely changes is drawn as nearly flat: the axis spans at least this many degrees.
  const [low, high] = [Math.min(...phases), Math.max(...phases)];
  const spread = Math.max(PHASE_SPAN, (high - low) * 1.1);
  const phaseRange: [number, number] = [(low + high) / 2 - spread / 2, (low + high) / 2 + spread / 2];
  const top = Math.max(...magnitudes);
  const peak = line.samples[magnitudes.indexOf(top)];
  const centre = line.samples.reduce((best, sample) =>
    Math.abs(sample.distance - line.length / 2) < Math.abs(best.distance - line.length / 2) ? sample : best,
  );
  const allTop = Math.max(...lines.flatMap((one) => one.samples.map((sample) => magnitude(sample.current))));

  return (
    <div className="sweep currents" aria-live="polite">
      <div className="settings sweep-controls">
        <label className="field">
          <span>
            <Hint topic="currentLine">Елемент</Hint>
          </span>
          <select value={index} onChange={(event) => setChosen(Number(event.target.value))}>
            {lines.map((one, k) => (
              <option key={one.wires.join(" ")} value={k}>
                {nameOf(one)}, {metres(one.length)} м{one.equivalent ? " (поправка Лісона)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={stale ? "sweep-result stale" : "sweep-result"}>
        {stale && <p className="note">Модель змінено: ці струми належать попередній.</p>}
        <p className="band">
          Найбільший струм {top.toFixed(3)} А на відстані {metres(peak.distance)} м від кінця; у середині елемента {magnitude(centre.current).toFixed(3)} А,
          фаза {signed(phase(centre.current), 0)}°. Найбільший в усій антені — {allTop.toFixed(3)} А. Струми діючі, при {CURRENT_POWER} Вт.
        </p>
        <div className="charts">
          <Card title={<Hint topic="currentMagnitude">Амплітуда струму, А</Hint>}>
            <LineChart
              title="Амплітуда струму, А"
              x={distances}
              xUnit="м"
              xFormat={metres}
              series={[{ name: "|I|", values: magnitudes, tone: "a" }]}
              range={[0, top > 0 ? top * 1.1 : 1]}
              format={(value) => value.toFixed(3)}
            />
          </Card>
          <Card title={<Hint topic="currentPhase">Фаза струму, °</Hint>}>
            <LineChart
              title="Фаза струму, °"
              x={live.map((sample) => sample.distance)}
              xUnit="м"
              xFormat={metres}
              series={[{ name: "фаза", values: phases, tone: "b" }]}
              range={phaseRange}
              format={(value) => signed(value, 1)}
            />
          </Card>
        </div>
        <p className="note">
          Відстань відраховано від кінця ({point(line.from)}) м до кінця ({point(line.to)}) м; фаза — відносно напруги джерела, додатний струм тече від
          першого кінця до другого.
          {line.equivalent && " Елемент рахувався як рівний циліндр Лісона: його струм розтягнуто на довжину труб."}
        </p>
      </div>
    </div>
  );
}
