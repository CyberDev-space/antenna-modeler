import { useEffect, useState } from "react";
import type { Solution } from "nec2-wasm";
import { band, bands, sweepPoints, type Range } from "../analysis";
import { buildSweepDeck } from "../deck";
import { solve, type Failure } from "../engine";
import { formatPulse, sweepKey, type Model } from "../model";
import type { SheetSweep } from "./PrintSheet";
import { Card } from "./Card";
import { LineChart } from "./LineChart";
import { NumberField } from "./NumberField";

interface Props {
  model: Model;
  onChange: (model: Model) => void;
  /** Hears of the points of the last sweep, with the model they belong to as text, for the printed sheet. */
  onResult?: (result: (SheetSweep & { key: string }) | null) => void;
}

interface Swept {
  /** The model that the solutions belong to, as text. */
  model: string;
  reference: number;
  frequency: number;
  solutions: Solution[];
  /** The segments of every source, and their places to name them. */
  feeds: number[][];
  sources: string[];
  /** The sources that have a voltage: only they have an impedance to chart. */
  driven: boolean[];
  milliseconds: number;
}

/** The SWR limit of the band that is reported. */
const LIMIT = 2;

const megahertz = (value: number): string => value.toFixed(3);

/** One band in words. An edge at an end of the sweep means that the band goes on beyond it. */
function rangeText({ edges, open }: Range): string {
  const [low, high] = edges.map(megahertz);
  if (open[0]) return `від початку розгортки до ${high} МГц`;
  if (open[1]) return `від ${low} МГц до кінця розгортки`;
  return `${low} – ${high} МГц (${Math.round((edges[1] - edges[0]) * 1000)} кГц)`;
}

/** The bands in words: an antenna for several bands has several. */
function bandsText(ranges: Range[]): string {
  if (ranges.length === 0) return `КСХ ніде не опускається до ${LIMIT}.`;
  if (ranges.length === 1 && ranges[0].open[0] && ranges[0].open[1]) return `КСХ не перевищує ${LIMIT} в усій розгортці.`;
  const label = ranges.length === 1 ? "Смуга" : "Смуги";
  return `${label} за КСХ ≤ ${LIMIT}: ${ranges.map(rangeText).join("; ")}.`;
}

/** The sweep over frequency: its range, and charts of the SWR and of the impedance. */
export function SweepPanel({ model, onChange, onResult }: Props) {
  const [swept, setSwept] = useState<Swept | null>(null);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  // The source whose SWR and impedance the charts show; `null` for the first with a voltage.
  const [chosen, setChosen] = useState<number | null>(null);
  const deck = buildSweepDeck(model);
  const modelText = sweepKey(model);
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
        solutions: output.jobs[0].solutions,
        feeds: deck.feeds,
        sources: model.sources.map((source) => formatPulse(source.at)),
        driven: model.sources.map((source) => source.voltage !== 0),
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
  const which = swept && chosen !== null && swept.driven[chosen] ? chosen : swept ? swept.driven.indexOf(true) : 0;
  const points = swept ? sweepPoints(swept.solutions, swept.reference, swept.feeds, which) : [];
  useEffect(() => {
    onResult?.(
      swept && points.length > 0
        ? { key: swept.model, points, reference: swept.reference, frequency: swept.frequency, source: swept.sources.length > 1 ? swept.sources[which] : null }
        : null,
    );
    // The points follow from the sweep and the chosen source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swept, which]);
  const found = swept && band(points, LIMIT);
  const frequencies = points.map((point) => point.frequency);
  const top = swept ? Math.min(10, Math.max(3, Math.ceil(Math.max(...points.map((point) => point.swr))))) : 3;

  return (
    <div className="sweep" aria-live="polite">
      <div className="settings sweep-controls">
        <NumberField label="Від, МГц" value={model.sweep.from} onChange={(from) => setSweep({ from })} />
        <NumberField label="До, МГц" value={model.sweep.to} onChange={(to) => setSweep({ to })} />
        <NumberField label="Точок" value={model.sweep.points} onChange={(points) => setSweep({ points: Math.round(points) })} />
        <button type="button" className="primary" onClick={sweep} disabled={running || deck.errors.length > 0}>
          {running ? "Рахую…" : "Розгорнути"}
        </button>
        {swept && swept.sources.length > 1 && (
          <label className="field">
            <span>Джерело на графіках</span>
            <select value={which} onChange={(event) => setChosen(Number(event.target.value))}>
              {swept.sources.map((place, index) => (
                <option key={index} value={index} disabled={!swept.driven[index]}>
                  {index + 1}: {place}
                  {swept.driven[index] ? "" : " (без напруги)"}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {problems && (
        <ul className="messages errors">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {!swept && !problems && <p className="note">Задайте межі й натисніть «Розгорнути»: програма порахує КСХ і вхідний опір на кожній частоті.</p>}
      {swept && found && (
        <div className={stale ? "sweep-result stale" : "sweep-result"}>
          {stale && <p className="note">Модель змінено: ці графіки належать попередній.</p>}
          <p className="band">
            Найменший КСХ {found.swr.toFixed(2)} на {megahertz(found.best)} МГц.{" "}
            {bandsText(bands(points, LIMIT))}
          </p>
          <div className="charts">
            <Card title={`КСХ (${swept.reference} Ом)`}>
            <LineChart
              title={`КСХ (${swept.reference} Ом)`}
              x={frequencies}
              series={[{ name: "КСХ", values: points.map((point) => point.swr), tone: "a" }]}
              range={[1, top]}
              guides={[1.5, 2]}
              marker={swept.frequency}
              format={(value) => (Number.isFinite(value) ? value.toFixed(2) : "∞")}
            />
            </Card>
            <Card title="Вхідний опір, Ом">
            <LineChart
              title="Вхідний опір, Ом"
              x={frequencies}
              series={[
                { name: "R", values: points.map((point) => point.impedance[0]), tone: "a" },
                { name: "X", values: points.map((point) => point.impedance[1]), tone: "b" },
              ]}
              marker={swept.frequency}
              format={(value) => value.toFixed(1).replace("-", "−")}
            />
            </Card>
          </div>
          <p className="note">
            {points.length} частот за {swept.milliseconds.toFixed(0)} мс. Вертикальна риска: частота моделі.
          </p>
        </div>
      )}
    </div>
  );
}
