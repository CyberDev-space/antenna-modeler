import type { Summary, SweepPoint } from "../analysis";
import { bands, swr } from "../analysis";
import { span, type Deck } from "../deck";
import { placedWires, roughMarks, type Point } from "../geometry";
import { loadImpedance, resonance } from "../loads";
import { formatPulse, type Model } from "../model";
import { AXIS_NAMES, boom, directionText, elements, millimetres, planAxes, planDimensions, type ElementRow } from "../sheet";
import { LineChart, rangeOf } from "./LineChart";
import { SmithChart } from "./SmithChart";
import { PolarPlot } from "./PolarPlot";
import { degrees, fixed, impedance, swrText } from "./Results";
import { GAIN_SPAN, RATIO_SPAN } from "./SweepPanel";
import { CABLES, ohms, partName, reactance, Schematic, value, type MatchingInputs } from "./MatchingPanel";
import { hairpin, lNetworks, quarterWave, throughQuarterWave } from "../matching";
import { language, N, t } from "../i18n";

/** The results that the sheet prints, as the page holds them. */
export interface SheetResults {
  summary: Summary;
  sources: string[];
  reference: number;
  /** MHz. */
  frequency: number;
  overGround: boolean;
  lossy: boolean;
  warnings: string[];
}

/** The last sweep, for the sheet. */
export interface SheetSweep {
  points: SweepPoint[];
  reference: number;
  frequency: number;
  /** The place of the source whose impedance it shows, when the model has several. */
  source: string | null;
}

interface Props {
  model: Model;
  deck: Deck;
  results: SheetResults | null;
  /** The results do not belong to the model as it is. */
  stale: boolean;
  sweep: SheetSweep | null;
  /** What the user chose for the hairpin and the transformer. */
  matching: MatchingInputs;
}

const GROUNDS = { free: N("вільний простір"), perfect: N("ідеальна"), real: N("реальна") } as const;

/**
 * A drawing of the antenna in the plane where it reaches farthest: the
 * length of every element beside it, the spacings of elements along a boom
 * in a chain below, the numbers of the elements, and a scale.
 */
function Plan({ model, deck, rows }: { model: Model; deck: Deck; rows: ElementRow[] }) {
  const wires = placedWires(model);
  const [a, b] = planAxes(model);
  const marks = deck.marks ?? roughMarks(model);
  const layout = boom(rows);
  const points = wires.flatMap((wire) => [
    [wire.x1, wire.y1, wire.z1],
    [wire.x2, wire.y2, wire.z2],
  ]);
  if (points.length === 0) return null;
  const xs = points.map((p) => p[a]);
  const ys = points.map((p) => p[b]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // Room for the dimensions: beside the elements, and for the chains below or to the left.
  const chains = layout !== null && (layout.axis === a || layout.axis === b);
  const across = chains && layout!.axis === a;
  const margin = { left: chains && !across ? 84 : 34, right: 48, top: 30, bottom: (chains && across ? 74 : 28) + 26 };
  const width = 720;
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || spanX * 0.05;
  const scale = Math.min((width - margin.left - margin.right) / spanX, 340 / spanY);
  const height = margin.top + spanY * scale + margin.bottom;
  const shift = (width - margin.left - margin.right - spanX * scale) / 2;
  const project = (point: Point): [number, number] => [margin.left + shift + (point[a] - minX) * scale, margin.top + (maxY - point[b]) * scale];
  const { dimensions, numbers } = planDimensions(rows, layout, [a, b], project);
  // A round length for the scale bar, about a quarter of the width.
  const rough = width / 4 / scale;
  const power = 10 ** Math.floor(Math.log10(rough));
  const bar = [1, 2, 5, 10].map((k) => k * power).filter((value) => value <= rough).pop() ?? power;

  return (
    <svg className="plan" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("Креслення антени в площині {plane} з розмірами в міліметрах", { plane: `${AXIS_NAMES[a]}${AXIS_NAMES[b]}` })}>
      <defs>
        <marker id="dim-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,1 L10,5 L0,9 Z" className="dim-arrow" />
        </marker>
      </defs>
      {wires.map((wire, index) => {
        const [p, q] = [project([wire.x1, wire.y1, wire.z1]), project([wire.x2, wire.y2, wire.z2])];
        return <line key={index} className="plan-wire" x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} />;
      })}
      {marks.loads.map((point, index) => (
        <circle key={`l${index}`} className="plan-load" cx={project(point)[0]} cy={project(point)[1]} r={4} />
      ))}
      {marks.sources.map((point, index) => (
        <circle key={`s${index}`} className="plan-source" cx={project(point)[0]} cy={project(point)[1]} r={4.5} />
      ))}
      {dimensions.map((dimension, index) => (
        <g key={`d${index}`} className="dim">
          {dimension.extensions.map(([from, to], k) => (
            <line key={k} className="dim-extension" x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} />
          ))}
          <line
            className="dim-line"
            x1={dimension.line[0][0]}
            y1={dimension.line[0][1]}
            x2={dimension.line[1][0]}
            y2={dimension.line[1][1]}
            markerStart="url(#dim-arrow)"
            markerEnd="url(#dim-arrow)"
          />
          <text
            className="dim-text"
            x={dimension.label.at[0]}
            y={dimension.label.at[1]}
            textAnchor="middle"
            dominantBaseline="central"
            transform={`rotate(${dimension.label.angle} ${dimension.label.at[0]} ${dimension.label.at[1]})`}
          >
            {dimension.label.text}
          </text>
        </g>
      ))}
      {numbers.map((number) => (
        <text key={number.text} className="plan-label" x={number.at[0]} y={number.at[1]} textAnchor="middle" dominantBaseline="central">
          {number.text}
        </text>
      ))}
      <g className="plan-scale">
        <line x1={margin.left} y1={height - 12} x2={margin.left + bar * scale} y2={height - 12} />
        <line x1={margin.left} y1={height - 16} x2={margin.left} y2={height - 8} />
        <line x1={margin.left + bar * scale} y1={height - 16} x2={margin.left + bar * scale} y2={height - 8} />
        <text x={margin.left + bar * scale + 6} y={height - 8}>
          {bar >= 1 ? t("{length} м", { length: bar }) : t("{length} мм", { length: millimetres(bar) })}
        </text>
        <text x={width - 8} y={height - 8} textAnchor="end">
          {t("розміри в мм · {right} праворуч, {up} угору", { right: AXIS_NAMES[a], up: AXIS_NAMES[b] })}
        </text>
      </g>
    </svg>
  );
}

/**
 * A sheet for building the antenna and for the record: its dimensions in
 * millimetres, its tubes, where the elements sit, the results, the patterns
 * and the sweep. It is shown only when the page is printed or saved as PDF.
 */
export function PrintSheet({ model, deck, results, stale, sweep, matching }: Props) {
  const rows = elements(model);
  const layout = boom(rows);
  const wires = placedWires(model);
  const ring = results ? Math.ceil(results.summary.gain) : 0;
  const date = new Date().toLocaleDateString(language() === "en" ? "en-GB" : "uk-UA", { year: "numeric", month: "long", day: "numeric" });
  const segments = [...deck.segments, ...deck.equivalents.map((one) => one.segments)].reduce((sum, count) => sum + count, 0);
  const replaced = new Set(deck.equivalents.flatMap((one) => one.wires));
  const metal = model.wireConductivity > 0 ? t("провідність {value} МСм/м", { value: Number((model.wireConductivity / 1e6).toPrecision(4)) }) : t("без втрат");

  return (
    <article className="print-sheet" aria-hidden="true">
      <header className="sheet-head">
        <div>
          <h1>{model.name.trim() || t("Антена")}</h1>
          <p>
            {t("Специфікація антени · {date} · antenna-modeler, ядро NEC-2", { date })}
          </p>
        </div>
        <div className="sheet-brand">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width="22" height="22" />
          UR3PKI · cyberdev.space
        </div>
      </header>

      <section className="sheet-two">
        <dl className="sheet-facts">
          <dt>{t("Частота")}</dt>
          <dd>{t("{frequency} МГц", { frequency: model.frequency })}</dd>
          <dt>{t("Земля")}</dt>
          <dd>
            {t(GROUNDS[model.ground.kind])}
            {model.ground.kind === "real" && t(", ε = {permittivity}, σ = {conductivity} См/м", { permittivity: model.ground.permittivity, conductivity: model.ground.conductivity })}
          </dd>
          {model.ground.kind !== "free" && model.height !== 0 && (
            <>
              <dt>{t("Додана висота")}</dt>
              <dd>{t("{length} м", { length: model.height })}</dd>
            </>
          )}
          <dt>{t("Лінія живлення")}</dt>
          <dd>{t("{value} Ом", { value: model.reference })}</dd>
          <dt>{t("Матеріал дротів")}</dt>
          <dd>{metal}</dd>
          <dt>{t("Сегментів")}</dt>
          <dd>{segments || "—"}</dd>
        </dl>
        {results ? (
          <dl className="sheet-facts">
            {results.summary.ports.length === 1 && (
              <>
                <dt>{t("Вхідний опір")}</dt>
                <dd>{impedance(results.summary.impedance)}</dd>
                <dt>{t("КСХ ({reference} Ом)", { reference: results.reference })}</dt>
                <dd>{swrText(results.summary.swr)}</dd>
              </>
            )}
            <dt>{t("Підсилення")}</dt>
            <dd>{t("{gain} дБі", { gain: fixed(results.summary.gain, 2) })}</dd>
            <dt>{t("Фронт/тил")}</dt>
            <dd>{results.summary.frontToBack === null ? "—" : t("{ratio} дБ", { ratio: fixed(results.summary.frontToBack, 1) })}</dd>
            <dt>{t("Кут випромінювання")}</dt>
            <dd>{degrees(results.summary.elevation)}°</dd>
            <dt>{t("Азимут максимуму")}</dt>
            <dd>{fixed(results.summary.azimuth, 0)}°</dd>
            {results.lossy && results.summary.efficiency !== null && (
              <>
                <dt>{t("ККД")}</dt>
                <dd>{fixed(results.summary.efficiency * 100, 1)} %</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="note">{t("Модель не розраховано.")}</p>
        )}
      </section>
      {stale && <p className="sheet-warning">{t("Результати не відповідають моделі: розрахуйте її перед друком.")}</p>}
      {deck.errors.length > 0 && (
        <ul className="sheet-warning">
          {deck.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      <h2>{t("Креслення")}</h2>
      <Plan model={model} deck={deck} rows={rows} />
      <p className="sheet-small">
        {t("Біля кожного елемента — його довжина; під антеною — відстані між центрами сусідніх елементів і загальна довжина, у мм. Помаранчеві точки — джерела, зелені — навантаження; числа над елементами — їхні номери в таблиці нижче.")}
      </p>

      <h2>{t("Елементи")}</h2>
      <table className="sheet-table">
        <thead>
          <tr>
            <th>№</th>
            <th>{t("Дроти")}</th>
            <th>{t("Довжина, мм")}</th>
            <th>{t("Центр (X; Y; Z), мм")}</th>
            <th>{t("Напрям")}</th>
            <th>{t("Діаметр або труби від центру, мм")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.number}>
              <td>{row.number}</td>
              <td>{row.wires.length === 1 ? row.wires[0] + 1 : `${Math.min(...row.wires) + 1}–${Math.max(...row.wires) + 1}`}</td>
              <td>{millimetres(row.length)}</td>
              <td>{row.centre.map(millimetres).join("; ")}</td>
              <td>{directionText(row.direction)}</td>
              <td>
                {row.tubes
                  ? row.tubes.map((tube, k) => `${k === 0 ? t("центр") : "2 ×"} ${millimetres(tube.length)} × Ø${millimetres(tube.diameter)}`).join(", ")
                  : row.diameter !== null
                    ? `Ø${millimetres(row.diameter)}`
                    : t("різні")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {layout && (
        <>
          <h2>{t("Розташування на траверсі (уздовж {axis})", { axis: AXIS_NAMES[layout.axis] })}</h2>
          <table className="sheet-table narrow">
            <thead>
              <tr>
                <th>{t("Елемент")}</th>
                <th>{t("Від першого, мм")}</th>
                <th>{t("Від попереднього, мм")}</th>
              </tr>
            </thead>
            <tbody>
              {layout.rows.map((row) => (
                <tr key={row.number}>
                  <td>{row.number}</td>
                  <td>{millimetres(row.position)}</td>
                  <td>{row.spacing === null ? "—" : millimetres(row.spacing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2>{t("Дроти")}</h2>
      <table className="sheet-table">
        <thead>
          <tr>
            <th>№</th>
            <th>{t("Початок (X; Y; Z), мм")}</th>
            <th>{t("Кінець (X; Y; Z), мм")}</th>
            <th>{t("Довжина, мм")}</th>
            <th>{t("Діаметр, мм")}</th>
            <th>{t("Сегм.")}</th>
          </tr>
        </thead>
        <tbody>
          {wires.map((wire, index) => (
            <tr key={index}>
              <td>{index + 1}</td>
              <td>{[wire.x1, wire.y1, wire.z1].map(millimetres).join("; ")}</td>
              <td>{[wire.x2, wire.y2, wire.z2].map(millimetres).join("; ")}</td>
              <td>{millimetres(Math.hypot(wire.x2 - wire.x1, wire.y2 - wire.y1, wire.z2 - wire.z1))}</td>
              <td>{millimetres(2 * wire.radius)}</td>
              <td>{replaced.has(index) ? t("Л") : (deck.segments[index] ?? "—")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {model.ground.kind !== "free" && model.height !== 0 && <p className="sheet-small">{t("Координати Z уже містять додану висоту {height} м.", { height: model.height })}</p>}

      <h2>{model.loads.length > 0 ? t("Джерела і навантаження") : t("Джерела")}</h2>
      <table className="sheet-table narrow">
        <thead>
          <tr>
            <th>{t("Джерело")}</th>
            <th>{t("Місце")}</th>
            <th>{t("Фаза, °")}</th>
            <th>{t("Напруга, В")}</th>
            {results && results.summary.ports.length > 1 && <th>{t("Вхідний опір")}</th>}
          </tr>
        </thead>
        <tbody>
          {model.sources.map((source, index) => (
            <tr key={index}>
              <td>{index + 1}</td>
              <td>{formatPulse(source.at)}</td>
              <td>{source.phase}</td>
              <td>{source.voltage}</td>
              {results && results.summary.ports.length > 1 && (
                <td>{results.summary.ports[index]?.impedance ? impedance(results.summary.ports[index].impedance!) : "—"}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {model.loads.length > 0 && (
        <table className="sheet-table narrow">
          <thead>
            <tr>
              <th>{t("Навантаження")}</th>
              <th>{t("Місце")}</th>
              <th>{t("Значення")}</th>
              <th>{t("На частоті моделі")}</th>
            </tr>
          </thead>
          <tbody>
            {model.loads.map((load, index) => {
              const z = loadImpedance(load, model.frequency);
              const trap = resonance(load);
              return (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>{formatPulse(load.at)}</td>
                  <td>
                    {load.kind === "lc"
                      ? [
                          load.inductance > 0 && t("L = {value} мкГн", { value: load.inductance }),
                          load.capacitance > 0 && t("C = {value} пФ", { value: load.capacitance }),
                          t("Q = {value}", { value: load.q || t("без втрат") }),
                          trap && t("резонанс {frequency} МГц", { frequency: trap.toFixed(3) }),
                        ]
                          .filter(Boolean)
                          .join(", ")
                      : t("R = {r} Ом, X = {x} Ом", { r: load.resistance, x: load.reactance })}
                  </td>
                  <td>{z ? impedance(z) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {results && (
        <section className="sheet-break">
          <h2>{t("Діаграми спрямованості")}</h2>
          <div className="sheet-plots">
            <figure>
              <figcaption>{t("Горизонтальна, кут {angle}°", { angle: fixed(results.summary.cutElevation, 0) })}</figcaption>
              <PolarPlot title={t("Горизонтальна діаграма")} cut={results.summary.azimuthCut} max={ring} labels={["X", "Y", "−X", "−Y"]} />
            </figure>
            <figure>
              <figcaption>{t("Вертикальна, азимут {angle}°", { angle: fixed(results.summary.azimuth, 0) })}</figcaption>
              <PolarPlot
                title={t("Вертикальна діаграма")}
                cut={results.summary.elevationCut}
                max={ring}
                labels={["0°", "90°", "180°", "−90°"]}
                upperHalf={results.overGround}
              />
            </figure>
          </div>
          <p className="sheet-small">{t("Зовнішнє коло — {ring} дБі; кола проведено через 3, 10, 20 і 30 дБ нижче.", { ring })}</p>
        </section>
      )}

      {sweep && sweep.points.length > 1 && (
        <section className="sheet-break">
          <h2>
            {t("Розгортка за частотою")}
            {sweep.source ? t(" (джерело {place})", { place: sweep.source }) : ""}
          </h2>
          <p>
            {(() => {
              const found = bands(sweep.points, 2);
              return found.length === 0
                ? t("КСХ ніде не опускається до {limit}.", { limit: 2 })
                : t("Смуги за КСХ ≤ {limit}: {bands}.", {
                    limit: 2,
                    bands: found.map(({ edges }) => t("{low} – {high} МГц", { low: edges[0].toFixed(3), high: edges[1].toFixed(3) })).join("; "),
                  });
            })()}
          </p>
          <figure className="sheet-chart">
            <figcaption>{t("КСХ ({reference} Ом)", { reference: sweep.reference })}</figcaption>
            <LineChart
              title={t("КСХ")}
              x={sweep.points.map((point) => point.frequency)}
              series={[{ name: t("КСХ"), values: sweep.points.map((point) => point.swr), tone: "a" }]}
              range={[1, Math.min(10, Math.max(3, Math.ceil(Math.max(...sweep.points.map((point) => point.swr)))))]}
              guides={[1.5, 2]}
              marker={sweep.frequency}
              format={(value) => (Number.isFinite(value) ? value.toFixed(2) : "∞")}
            />
          </figure>
          <figure className="sheet-chart">
            <figcaption>{t("Вхідний опір, Ом")}</figcaption>
            <LineChart
              title={t("Вхідний опір")}
              x={sweep.points.map((point) => point.frequency)}
              series={[
                { name: "R", values: sweep.points.map((point) => point.impedance[0]), tone: "a" },
                { name: "X", values: sweep.points.map((point) => point.impedance[1]), tone: "b" },
              ]}
              marker={sweep.frequency}
              format={(value) => value.toFixed(1)}
            />
          </figure>
          {sweep.points.every((point) => point.gain !== null) && (
            <figure className="sheet-chart">
              <figcaption>{t("Підсилення в напрямку максимуму, дБі")}</figcaption>
              <LineChart
                title={t("Підсилення")}
                x={sweep.points.map((point) => point.frequency)}
                series={[{ name: t("підсилення"), values: sweep.points.map((point) => point.gain!), tone: "a" }]}
                range={rangeOf(sweep.points.map((point) => point.gain!), GAIN_SPAN)}
                marker={sweep.frequency}
                format={(value) => value.toFixed(2)}
              />
            </figure>
          )}
          {sweep.points.every((point) => point.frontToBack !== null) && (
            <figure className="sheet-chart">
              <figcaption>{t("Фронт/тил, дБ")}</figcaption>
              <LineChart
                title={t("Фронт/тил")}
                x={sweep.points.map((point) => point.frequency)}
                series={[{ name: t("фронт/тил"), values: sweep.points.map((point) => point.frontToBack!), tone: "b" }]}
                range={rangeOf(sweep.points.map((point) => point.frontToBack!), RATIO_SPAN)}
                marker={sweep.frequency}
                format={(value) => value.toFixed(1)}
              />
            </figure>
          )}
          <figure className="sheet-chart sheet-smith">
            <figcaption>{t("Діаграма Сміта ({reference} Ом)", { reference: sweep.reference })}</figcaption>
            <SmithChart
              title={t("Діаграма Сміта ({reference} Ом)", { reference: sweep.reference })}
              frequencies={sweep.points.map((point) => point.frequency)}
              impedances={sweep.points.map((point) => point.impedance)}
              reference={sweep.reference}
              marker={sweep.frequency}
            />
          </figure>
        </section>
      )}

      {results && !stale && <SheetMatching results={results} matching={matching} />}

      {(deck.warnings.length > 0 || deck.equivalents.length > 0 || (results && results.warnings.length > 0)) && (
        <>
          <h2>{t("Примітки")}</h2>
          <ul className="sheet-notes">
            {deck.equivalents.map((one) => (
              <li key={one.wires.join(" ")}>
                {t("Поправка Лісона: дроти {wires} (Л) ядро рахує як один рівний дріт {length} мм, Ø {diameter} мм, з тим самим центром і віссю.", {
                  wires: span(one.wires),
                  length: millimetres(one.length),
                  diameter: (2000 * one.radius).toFixed(2),
                })}
              </li>
            ))}
            {deck.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
            {results?.warnings.map((warning) => (
              <li key={warning}>{t("Ядро: {warning}", { warning })}</li>
            ))}
          </ul>
        </>
      )}

      <footer className="sheet-foot">
        {t("Розраховано програмою antenna-modeler від UR3PKI (cyberdev.space/radio/antenna-modeler) на ядрі NEC-2 nec2-rs методом моментів. Розміри — для тонких дротів без ізоляції; перед виготовленням перевірте модель на власній конструкції.")}
      </footer>
    </article>
  );
}

/** The matching to the line on the sheet: the L networks drawn, the hairpin and the best quarter-wave cable. */
function SheetMatching({ results, matching }: { results: SheetResults; matching: MatchingInputs }) {
  const { impedance: load } = results.summary;
  const { reference, frequency } = results;
  const networks = lNetworks(load, reference, frequency);
  const pin = hairpin(load[0], reference, frequency, matching.diameter / 1000, matching.spacing / 1000);
  const best = CABLES.map(([line, name]) => ({ line, name, swr: swr(throughQuarterWave(load, line), reference) })).reduce((one, other) =>
    other.swr < one.swr ? other : one,
  );
  return (
    <section>
      <h2>{t("Узгодження з лінією {reference} Ом", { reference })}</h2>
      <p>
        {t("Вхідний опір {impedance} на {frequency} МГц, КСХ {swr}.", { impedance: ohms(load), frequency, swr: swr(load, reference).toFixed(2) })}
      </p>
      {networks.length > 0 && (
        <div className="sheet-matching">
          {networks.map((network, k) => (
            <figure key={k}>
              <Schematic network={network} />
              <figcaption>
                {t("L-ланка, варіант {n}: {parts}.", {
                  n: k + 1,
                  parts: [
                    network.series &&
                      t("послідовно {part} {value} ({reactance})", {
                        part: partName(network.series),
                        value: value(network.series),
                        reactance: reactance(network.series.reactance),
                      }),
                    network.shunt &&
                      (network.shuntAt === "line"
                        ? t("паралельно з боку лінії {part} {value} ({reactance})", {
                            part: partName(network.shunt),
                            value: value(network.shunt),
                            reactance: reactance(network.shunt.reactance),
                          })
                        : t("паралельно з боку антени {part} {value} ({reactance})", {
                            part: partName(network.shunt),
                            value: value(network.shunt),
                            reactance: reactance(network.shunt.reactance),
                          })),
                  ]
                    .filter(Boolean)
                    .join("; "),
                })}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {pin && (
        <p>
          <strong>{t("Шпилька:")}</strong>{" "}
          {t("вкоротити активний вібратор до реактивності {target}; шпилька з двох трубок Ø {diameter} мм на відстані {spacing} мм між осями, хвильовий опір {impedance} Ом, довжина {length} мм від точки живлення до перемички ({inductance} мкГн).", {
            target: reactance(pin.antennaReactance),
            diameter: matching.diameter,
            spacing: matching.spacing,
            impedance: pin.lineImpedance.toFixed(0),
            length: (pin.length * 1000).toFixed(0),
            inductance: (pin.inductance * 1e6).toPrecision(3),
          })}
        </p>
      )}
      {matching.velocity > 0 && matching.velocity <= 1 && (
        <p>
          <strong>{t("Чвертьхвильовий трансформатор:")}</strong>{" "}
          {t("найкраще — {cable} ({impedance} Ом), КСХ {swr}; довжина {length} мм при коефіцієнті укорочення {velocity}.", {
            cable: t(best.name),
            impedance: best.line,
            swr: best.swr.toFixed(2),
            length: (quarterWave(frequency, matching.velocity) * 1000).toFixed(0),
            velocity: matching.velocity,
          })}
        </p>
      )}
    </section>
  );
}
