import { useState } from "react";
import { band, sweepPoints, type Band, type SweepPoint } from "../analysis";
import { buildSweepDeck } from "../deck";
import { solve, type Failure } from "../engine";
import type { Model } from "../model";
import { LineChart } from "./LineChart";
import { NumberField } from "./NumberField";

interface Props {
  model: Model;
  onChange: (model: Model) => void;
}

interface Swept {
  /** The model that the points belong to, as text. */
  model: string;
  reference: number;
  frequency: number;
  points: SweepPoint[];
  milliseconds: number;
}

/** The SWR limit of the band that is reported. */
const LIMIT = 2;

const megahertz = (value: number): string => value.toFixed(3);

/** The band in words. An edge at an end of the sweep means that the band goes on beyond it. */
function bandText({ edges, open }: Band): string {
  if (!edges) return `КСХ ніде не опускається до ${LIMIT}.`;
  const [low, high] = edges.map(megahertz);
  if (open[0] && open[1]) return `КСХ не перевищує ${LIMIT} в усій розгортці.`;
  if (open[0]) return `Смуга за КСХ ≤ ${LIMIT}: від початку розгортки до ${high} МГц.`;
  if (open[1]) return `Смуга за КСХ ≤ ${LIMIT}: від ${low} МГц до кінця розгортки.`;
  return `Смуга за КСХ ≤ ${LIMIT}: ${low} – ${high} МГц (${Math.round((edges[1] - edges[0]) * 1000)} кГц).`;
}

/** The sweep over frequency: its range, and charts of the SWR and of the impedance. */
export function SweepPanel({ model, onChange }: Props) {
  const [swept, setSwept] = useState<Swept | null>(null);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const deck = buildSweepDeck(model);
  const modelText = JSON.stringify(model);
  const setSweep = (change: Partial<Model["sweep"]>) => onChange({ ...model, sweep: { ...model.sweep, ...change } });

  async function sweep() {
    setRunning(true);
    setFailure(null);
    const started = performance.now();
    try {
      const output = await solve(deck.text);
      if (output.error) {
        setFailure({ model: modelText, lines: ["Ядро зупинило розрахунок:", output.error] });
        setSwept(null);
        return;
      }
      setSwept({
        model: modelText,
        reference: model.reference,
        frequency: model.frequency,
        points: sweepPoints(output.jobs[0].solutions, model.reference),
        milliseconds: performance.now() - started,
      });
    } catch (error) {
      setFailure({ model: modelText, lines: ["Розрахунок не вдався:", String(error)] });
      setSwept(null);
    } finally {
      setRunning(false);
    }
  }

  // A failure says nothing about a model that was changed since.
  const problems = deck.errors.length > 0 ? deck.errors : failure?.model === modelText ? failure.lines : null;
  const stale = swept !== null && swept.model !== modelText;
  const found = swept && band(swept.points, LIMIT);
  const frequencies = swept?.points.map((point) => point.frequency) ?? [];
  const top = swept ? Math.min(10, Math.max(3, Math.ceil(Math.max(...swept.points.map((point) => point.swr))))) : 3;

  return (
    <section className="sweep" aria-label="Розгортка за частотою" aria-live="polite">
      <h2>Розгортка за частотою</h2>
      <div className="settings">
        <NumberField label="Від, МГц" value={model.sweep.from} onChange={(from) => setSweep({ from })} />
        <NumberField label="До, МГц" value={model.sweep.to} onChange={(to) => setSweep({ to })} />
        <NumberField label="Точок" value={model.sweep.points} onChange={(points) => setSweep({ points: Math.round(points) })} />
        <button type="button" className="primary" onClick={sweep} disabled={running || deck.errors.length > 0}>
          {running ? "Рахую…" : "Розгорнути"}
        </button>
      </div>
      {problems && (
        <ul className="messages errors">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {swept && found && (
        <div className={stale ? "stale" : undefined}>
          {stale && <p className="note">Модель змінено: ці графіки належать попередній.</p>}
          <p className="band">
            Найменший КСХ {found.swr.toFixed(2)} на {megahertz(found.best)} МГц.{" "}
            {bandText(found)}
          </p>
          <div className="charts">
            <LineChart
              title={`КСХ (${swept.reference} Ом)`}
              x={frequencies}
              series={[{ name: "КСХ", values: swept.points.map((point) => point.swr), tone: "a" }]}
              range={[1, top]}
              guides={[1.5, 2]}
              marker={swept.frequency}
              format={(value) => (Number.isFinite(value) ? value.toFixed(2) : "∞")}
            />
            <LineChart
              title="Вхідний опір, Ом"
              x={frequencies}
              series={[
                { name: "R", values: swept.points.map((point) => point.impedance[0]), tone: "a" },
                { name: "X", values: swept.points.map((point) => point.impedance[1]), tone: "b" },
              ]}
              marker={swept.frequency}
              format={(value) => value.toFixed(1).replace("-", "−")}
            />
          </div>
          <p className="note">
            {swept.points.length} частот за {swept.milliseconds.toFixed(0)} мс. Вертикальна риска: частота моделі.
          </p>
        </div>
      )}
    </section>
  );
}
