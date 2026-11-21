import { useEffect, useState } from "react";
import type { Solution } from "nec2-wasm";
import { band, bands, summarize, sweepPoints, type Range } from "../analysis";
import { buildDeck, buildSweepDeck } from "../deck";
import { solve, stopEngine, Stopped, type Failure } from "../engine";
import { formatPulse, sweepKey, type Model } from "../model";
import type { SheetSweep } from "./PrintSheet";
import { Card } from "./Card";
import { Hint } from "./Help";
import { LineChart, rangeOf } from "./LineChart";
import { NumberField } from "./NumberField";
import { SmithChart } from "./SmithChart";
import { t } from "../i18n";

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
  /** The direction of the maximum at the frequency of the model, in which the gain is followed. */
  toward: { azimuth: number; elevation: number };
  milliseconds: number;
}

/** The SWR limit of the band that is reported. */
const LIMIT = 2;

/** The least spans of the axes of the gain and of the front-to-back ratio, in dB. */
export const GAIN_SPAN = 2;
export const RATIO_SPAN = 10;

const megahertz = (value: number): string => value.toFixed(3);

/** One band in words. An edge at an end of the sweep means that the band goes on beyond it. */
function rangeText({ edges, open }: Range): string {
  const [low, high] = edges.map(megahertz);
  if (open[0]) return t("від початку розгортки до {high} МГц", { high });
  if (open[1]) return t("від {low} МГц до кінця розгортки", { low });
  return t("{low} – {high} МГц ({width} кГц)", { low, high, width: Math.round((edges[1] - edges[0]) * 1000) });
}

/** The bands in words: an antenna for several bands has several. */
function bandsText(ranges: Range[]): string {
  if (ranges.length === 0) return t("КСХ ніде не опускається до {limit}.", { limit: LIMIT });
  if (ranges.length === 1 && ranges[0].open[0] && ranges[0].open[1]) return t("КСХ не перевищує {limit} в усій розгортці.", { limit: LIMIT });
  const list = ranges.map(rangeText).join("; ");
  return ranges.length === 1 ? t("Смуга за КСХ ≤ {limit}: {bands}.", { limit: LIMIT, bands: list }) : t("Смуги за КСХ ≤ {limit}: {bands}.", { limit: LIMIT, bands: list });
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
      // The gain is followed in the direction of the maximum at the frequency of the model, and the
      // front-to-back ratio against the opposite azimuth: two directions at every frequency, not whole patterns.
      const mainDeck = buildDeck(model);
      const main = await solve(mainDeck.text);
      if (main.error) {
        setFailure({ model: modelText, lines: [t("Ядро зупинило розрахунок:"), main.error] });
        setSwept(null);
        return;
      }
      const { azimuth, elevation } = summarize(main.jobs[0].solutions[0], model.reference, mainDeck.feeds);
      const output = await solve(buildSweepDeck(model, { theta: 90 - elevation, phi: azimuth }).text);
      if (output.error) {
        setFailure({ model: modelText, lines: [t("Ядро зупинило розрахунок:"), output.error] });
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
        toward: { azimuth, elevation },
        milliseconds: performance.now() - started,
      });
    } catch (error) {
      // A stopped sweep leaves the charts of the one before.
      if (error instanceof Stopped) return;
      setFailure({ model: modelText, lines: [t("Розрахунок не вдався:"), String(error)] });
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
  const gains = points.map((point) => point.gain);
  const ratios = points.map((point) => point.frontToBack);
  const withGain = points.length > 0 && gains.every((value) => value !== null);
  const withRatio = withGain && ratios.every((value) => value !== null);
  // The gain and the front-to-back ratio over the band of the best SWR.
  const inBand = found?.edges ? points.filter((point) => point.frequency >= found.edges![0] && point.frequency <= found.edges![1]) : [];
  const spread = (values: number[]): string => `${Math.min(...values).toFixed(1)}–${Math.max(...values).toFixed(1)}`.replace(/-(?=\d)/g, "−");
  const overBand =
    withGain && inBand.length > 0
      ? withRatio
        ? t(" У цій смузі підсилення {gain} дБі, фронт/тил {ratio} дБ.", {
            gain: spread(inBand.map((point) => point.gain!)),
            ratio: spread(inBand.map((point) => point.frontToBack!)),
          })
        : t(" У цій смузі підсилення {gain} дБі.", { gain: spread(inBand.map((point) => point.gain!)) })
      : "";
  const top = swept ? Math.min(10, Math.max(3, Math.ceil(Math.max(...points.map((point) => point.swr))))) : 3;

  return (
    <div className="sweep" aria-live="polite">
      <div className="settings sweep-controls">
        <NumberField label={t("Від, МГц")} help="sweepRange" value={model.sweep.from} onChange={(from) => setSweep({ from })} />
        <NumberField label={t("До, МГц")} help="sweepRange" value={model.sweep.to} onChange={(to) => setSweep({ to })} />
        <NumberField label={t("Точок")} help="sweepRange" value={model.sweep.points} onChange={(points) => setSweep({ points: Math.round(points) })} />
        <Hint topic="sweepRun">
          {running ? (
            <button type="button" className="primary" onClick={stopEngine}>
              {t("Зупинити")}
            </button>
          ) : (
            <button type="button" className="primary" onClick={sweep} disabled={deck.errors.length > 0}>
              {t("Розгорнути")}
            </button>
          )}
        </Hint>
        {swept && swept.sources.length > 1 && (
          <label className="field">
            <span>
              <Hint topic="sweepSource">{t("Джерело на графіках")}</Hint>
            </span>
            <select value={which} onChange={(event) => setChosen(Number(event.target.value))}>
              {swept.sources.map((place, index) => (
                <option key={index} value={index} disabled={!swept.driven[index]}>
                  {index + 1}: {place}
                  {swept.driven[index] ? "" : t(" (без напруги)")}
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
      {!swept && !problems && <p className="note">{t("Задайте межі й натисніть «Розгорнути»: програма порахує КСХ і вхідний опір на кожній частоті.")}</p>}
      {swept && found && (
        <div className={stale ? "sweep-result stale" : "sweep-result"}>
          {stale && <p className="note">{t("Модель змінено: ці графіки належать попередній.")}</p>}
          <p className="band">
            <Hint topic="sweepBand">
              {t("Найменший КСХ {swr} на {frequency} МГц.", { swr: found.swr.toFixed(2), frequency: megahertz(found.best) })} {bandsText(bands(points, LIMIT))}
              {overBand}
            </Hint>
          </p>
          <div className={withGain ? "charts four with-smith" : "charts with-smith"}>
            <Card title={t("КСХ ({reference} Ом)", { reference: swept.reference })}>
            <LineChart
              title={t("КСХ ({reference} Ом)", { reference: swept.reference })}
              x={frequencies}
              series={[{ name: t("КСХ"), values: points.map((point) => point.swr), tone: "a" }]}
              range={[1, top]}
              guides={[1.5, 2]}
              marker={swept.frequency}
              format={(value) => (Number.isFinite(value) ? value.toFixed(2) : "∞")}
            />
            </Card>
            <Card title={t("Вхідний опір, Ом")}>
            <LineChart
              title={t("Вхідний опір, Ом")}
              x={frequencies}
              series={[
                { name: "R", values: points.map((point) => point.impedance[0]), tone: "a" },
                { name: "X", values: points.map((point) => point.impedance[1]), tone: "b" },
              ]}
              marker={swept.frequency}
              format={(value) => value.toFixed(1).replace("-", "−")}
            />
            </Card>
            {withGain && (
              <Card title={<Hint topic="sweepGain">{t("Підсилення, дБі")}</Hint>}>
                <LineChart
                  title={t("Підсилення, дБі")}
                  x={frequencies}
                  series={[{ name: t("підсилення"), values: gains as number[], tone: "a" }]}
                  range={rangeOf(gains as number[], GAIN_SPAN)}
                  marker={swept.frequency}
                  format={(value) => value.toFixed(2).replace("-", "−")}
                />
              </Card>
            )}
            {withRatio && (
              <Card title={<Hint topic="sweepFrontToBack">{t("Фронт/тил, дБ")}</Hint>}>
                <LineChart
                  title={t("Фронт/тил, дБ")}
                  x={frequencies}
                  series={[{ name: t("фронт/тил"), values: ratios as number[], tone: "b" }]}
                  range={rangeOf(ratios as number[], RATIO_SPAN)}
                  marker={swept.frequency}
                  format={(value) => value.toFixed(1).replace("-", "−")}
                />
              </Card>
            )}
            <Card className="smith-card" title={<Hint topic="sweepSmith">{t("Діаграма Сміта ({reference} Ом)", { reference: swept.reference })}</Hint>}>
              <SmithChart
                title={t("Діаграма Сміта ({reference} Ом)", { reference: swept.reference })}
                frequencies={frequencies}
                impedances={points.map((point) => point.impedance)}
                reference={swept.reference}
                marker={swept.frequency}
              />
            </Card>
          </div>
          <p className="note">
            {t("{count} частот за {ms} мс. Вертикальна риска: частота моделі.", { count: points.length, ms: swept.milliseconds.toFixed(0) })}
            {withGain &&
              t(" Підсилення — у напрямку максимуму на частоті моделі (азимут {azimuth}°, кут {elevation}°), фронт/тил — проти протилежного азимуту на тому самому куті.", {
                azimuth: swept.toward.azimuth.toFixed(0),
                elevation: swept.toward.elevation.toFixed(1),
              })}
          </p>
        </div>
      )}
    </div>
  );
}
