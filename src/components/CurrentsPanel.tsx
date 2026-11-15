import { useState } from "react";
import { CURRENT_POWER, magnitude, phase, unwrap, type CurrentLine } from "../currents";
import { span } from "../deck";
import type { Model } from "../model";
import { Card } from "./Card";
import { Hint } from "./Help";
import { LineChart, rangeOf } from "./LineChart";
import { t } from "../i18n";

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
const nameOf = (line: CurrentLine): string =>
  line.wires.length === 1 ? t("Дріт {wire}", { wire: line.wires[0] + 1 }) : t("Дроти {wires}", { wires: span(line.wires) });

/** The currents along one element at a time: their magnitude and their phase from one end to the other. */
export function CurrentsPanel({ lines, model, stale }: Props) {
  const fed = model.sources.find((source) => source.voltage !== 0)?.at.wire;
  const first = Math.max(0, lines.findIndex((line) => fed !== undefined && line.wires.includes(fed)));
  const [chosen, setChosen] = useState<number | null>(null);
  const index = chosen !== null && chosen < lines.length ? chosen : first;
  const line = lines[index];
  if (!line) return <p className="note">{t("У моделі немає струмів, щоб їх показати.")}</p>;

  const distances = line.samples.map((sample) => sample.distance);
  const magnitudes = line.samples.map((sample) => magnitude(sample.current));
  // The phase of nothing has no meaning: the ends of a free element are left out of it.
  const live = line.samples.filter((sample) => magnitude(sample.current) > 0);
  const phases = unwrap(live.map((sample) => phase(sample.current)));
  const phaseRange = rangeOf(phases, PHASE_SPAN);
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
            <Hint topic="currentLine">{t("Елемент")}</Hint>
          </span>
          <select value={index} onChange={(event) => setChosen(Number(event.target.value))}>
            {lines.map((one, k) => (
              <option key={one.wires.join(" ")} value={k}>
                {t("{name}, {length} м", { name: nameOf(one), length: metres(one.length) })}
                {one.equivalent ? t(" (поправка Лісона)") : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={stale ? "sweep-result stale" : "sweep-result"}>
        {stale && <p className="note">{t("Модель змінено: ці струми належать попередній.")}</p>}
        <p className="band">
          {t("Найбільший струм {top} А на відстані {at} м від кінця; у середині елемента {centre} А, фаза {phase}°. Найбільший в усій антені — {all} А. Струми діючі, при {power} Вт.", {
            top: top.toFixed(3),
            at: metres(peak.distance),
            centre: magnitude(centre.current).toFixed(3),
            phase: signed(phase(centre.current), 0),
            all: allTop.toFixed(3),
            power: CURRENT_POWER,
          })}
        </p>
        <div className="charts">
          <Card title={<Hint topic="currentMagnitude">{t("Амплітуда струму, А")}</Hint>}>
            <LineChart
              title={t("Амплітуда струму, А")}
              x={distances}
              xUnit={t("м")}
              xFormat={metres}
              series={[{ name: "|I|", values: magnitudes, tone: "a" }]}
              range={[0, top > 0 ? top * 1.1 : 1]}
              format={(value) => value.toFixed(3)}
            />
          </Card>
          <Card title={<Hint topic="currentPhase">{t("Фаза струму, °")}</Hint>}>
            <LineChart
              title={t("Фаза струму, °")}
              x={live.map((sample) => sample.distance)}
              xUnit={t("м")}
              xFormat={metres}
              series={[{ name: t("фаза"), values: phases, tone: "b" }]}
              range={phaseRange}
              format={(value) => signed(value, 1)}
            />
          </Card>
        </div>
        <p className="note">
          {t("Відстань відраховано від кінця ({from}) м до кінця ({to}) м; фаза — відносно напруги джерела, додатний струм тече від першого кінця до другого.", {
            from: point(line.from),
            to: point(line.to),
          })}
          {line.equivalent && t(" Елемент рахувався як рівний циліндр Лісона: його струм розтягнуто на довжину труб.")}
        </p>
      </div>
    </div>
  );
}
