import type { Summary, SweepPoint } from "../analysis";
import { bands } from "../analysis";
import type { Deck } from "../deck";
import { placedWires, roughMarks, type Point } from "../geometry";
import { loadImpedance, resonance } from "../loads";
import { formatPulse, type Model } from "../model";
import { AXIS_NAMES, boom, directionText, elements, millimetres, planAxes, type ElementRow } from "../sheet";
import { LineChart } from "./LineChart";
import { PolarPlot } from "./PolarPlot";
import { degrees, fixed, impedance, swrText } from "./Results";

/** The results that the sheet prints, as the page holds them. */
export interface SheetResults {
  summary: Summary;
  sources: string[];
  reference: number;
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
}

const GROUNDS = { free: "вільний простір", perfect: "ідеальна", real: "реальна" } as const;

/** A drawing of the antenna in the plane where it reaches farthest, with the numbers of its elements and a scale. */
function Plan({ model, deck, rows }: { model: Model; deck: Deck; rows: ElementRow[] }) {
  const wires = placedWires(model);
  const [a, b] = planAxes(model);
  const marks = deck.marks ?? roughMarks(model);
  const points = wires.flatMap((wire) => [
    [wire.x1, wire.y1, wire.z1],
    [wire.x2, wire.y2, wire.z2],
  ]);
  if (points.length === 0) return null;
  const xs = points.map((p) => p[a]);
  const ys = points.map((p) => p[b]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const [width, margin] = [700, 34];
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || spanX * 0.05;
  const scale = Math.min((width - 2 * margin) / spanX, 300 / spanY);
  const height = Math.max(120, spanY * scale + 2 * margin + 20);
  const x = (value: number): number => margin + (value - minX) * scale + (width - 2 * margin - spanX * scale) / 2;
  const y = (value: number): number => height - margin - 20 - (value - minY) * scale;
  // A round length for the scale bar, about a quarter of the width.
  const rough = (width / 4) / scale;
  const power = 10 ** Math.floor(Math.log10(rough));
  const bar = [1, 2, 5, 10].map((k) => k * power).filter((value) => value <= rough).pop() ?? power;
  const at = (point: Point): [number, number] => [x(point[a]), y(point[b])];

  return (
    <svg className="plan" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Креслення антени в площині ${AXIS_NAMES[a]}${AXIS_NAMES[b]}`}>
      {wires.map((wire, index) => (
        <line key={index} className="plan-wire" x1={x([wire.x1, wire.y1, wire.z1][a])} y1={y([wire.x1, wire.y1, wire.z1][b])} x2={x([wire.x2, wire.y2, wire.z2][a])} y2={y([wire.x2, wire.y2, wire.z2][b])} />
      ))}
      {marks.loads.map((point, index) => (
        <circle key={`l${index}`} className="plan-load" cx={at(point)[0]} cy={at(point)[1]} r={4} />
      ))}
      {marks.sources.map((point, index) => (
        <circle key={`s${index}`} className="plan-source" cx={at(point)[0]} cy={at(point)[1]} r={4.5} />
      ))}
      {rows.map((row) => {
        const [cx, cy] = at(row.centre);
        return (
          <text key={row.number} className="plan-label" x={cx + 6} y={cy - 6}>
            {row.number}
          </text>
        );
      })}
      <g className="plan-scale">
        <line x1={margin} y1={height - 14} x2={margin + bar * scale} y2={height - 14} />
        <line x1={margin} y1={height - 18} x2={margin} y2={height - 10} />
        <line x1={margin + bar * scale} y1={height - 18} x2={margin + bar * scale} y2={height - 10} />
        <text x={margin + bar * scale + 6} y={height - 10}>
          {bar >= 1 ? `${bar} м` : `${millimetres(bar)} мм`}
        </text>
        <text x={width - margin} y={height - 10} textAnchor="end">
          {AXIS_NAMES[a]} → , {AXIS_NAMES[b]} ↑
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
export function PrintSheet({ model, deck, results, stale, sweep }: Props) {
  const rows = elements(model);
  const layout = boom(rows);
  const wires = placedWires(model);
  const ring = results ? Math.ceil(results.summary.gain) : 0;
  const date = new Date().toLocaleDateString("uk-UA", { year: "numeric", month: "long", day: "numeric" });
  const segments = deck.segments.reduce((sum, count) => sum + count, 0);
  const metal = model.wireConductivity > 0 ? `провідність ${Number((model.wireConductivity / 1e6).toPrecision(4))} МСм/м` : "без втрат";

  return (
    <article className="print-sheet" aria-hidden="true">
      <header className="sheet-head">
        <h1>{model.name.trim() || "Антена"}</h1>
        <p>
          Специфікація антени · {date} · antenna-modeler, ядро NEC-2
        </p>
      </header>

      <section className="sheet-two">
        <dl className="sheet-facts">
          <dt>Частота</dt>
          <dd>{model.frequency} МГц</dd>
          <dt>Земля</dt>
          <dd>
            {GROUNDS[model.ground.kind]}
            {model.ground.kind === "real" && `, ε = ${model.ground.permittivity}, σ = ${model.ground.conductivity} См/м`}
          </dd>
          {model.ground.kind !== "free" && model.height !== 0 && (
            <>
              <dt>Додана висота</dt>
              <dd>{model.height} м</dd>
            </>
          )}
          <dt>Лінія живлення</dt>
          <dd>{model.reference} Ом</dd>
          <dt>Матеріал дротів</dt>
          <dd>{metal}</dd>
          <dt>Сегментів</dt>
          <dd>{segments || "—"}</dd>
        </dl>
        {results ? (
          <dl className="sheet-facts">
            {results.summary.ports.length === 1 && (
              <>
                <dt>Вхідний опір</dt>
                <dd>{impedance(results.summary.impedance)}</dd>
                <dt>КСХ ({results.reference} Ом)</dt>
                <dd>{swrText(results.summary.swr)}</dd>
              </>
            )}
            <dt>Підсилення</dt>
            <dd>{fixed(results.summary.gain, 2)} дБі</dd>
            <dt>Фронт/тил</dt>
            <dd>{results.summary.frontToBack === null ? "—" : `${fixed(results.summary.frontToBack, 1)} дБ`}</dd>
            <dt>Кут випромінювання</dt>
            <dd>{degrees(results.summary.elevation)}°</dd>
            <dt>Азимут максимуму</dt>
            <dd>{fixed(results.summary.azimuth, 0)}°</dd>
            {results.lossy && results.summary.efficiency !== null && (
              <>
                <dt>ККД</dt>
                <dd>{fixed(results.summary.efficiency * 100, 1)} %</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="note">Модель не розраховано.</p>
        )}
      </section>
      {stale && <p className="sheet-warning">Результати не відповідають моделі: розрахуйте її перед друком.</p>}
      {deck.errors.length > 0 && (
        <ul className="sheet-warning">
          {deck.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      <h2>Креслення</h2>
      <Plan model={model} deck={deck} rows={rows} />
      <p className="sheet-small">Помаранчеві точки — джерела, зелені — навантаження; числа — номери елементів у таблиці нижче.</p>

      <h2>Елементи</h2>
      <table className="sheet-table">
        <thead>
          <tr>
            <th>№</th>
            <th>Дроти</th>
            <th>Довжина, мм</th>
            <th>Центр (X; Y; Z), мм</th>
            <th>Напрям</th>
            <th>Діаметр або труби від центру, мм</th>
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
                  ? row.tubes.map((tube, k) => `${k === 0 ? "центр" : "2 ×"} ${millimetres(tube.length)} × Ø${millimetres(tube.diameter)}`).join(", ")
                  : row.diameter !== null
                    ? `Ø${millimetres(row.diameter)}`
                    : "різні"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {layout && (
        <>
          <h2>Розташування на траверсі (уздовж {AXIS_NAMES[layout.axis]})</h2>
          <table className="sheet-table narrow">
            <thead>
              <tr>
                <th>Елемент</th>
                <th>Від першого, мм</th>
                <th>Від попереднього, мм</th>
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

      <h2>Дроти</h2>
      <table className="sheet-table">
        <thead>
          <tr>
            <th>№</th>
            <th>Початок (X; Y; Z), мм</th>
            <th>Кінець (X; Y; Z), мм</th>
            <th>Довжина, мм</th>
            <th>Діаметр, мм</th>
            <th>Сегм.</th>
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
              <td>{deck.segments[index] ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {model.ground.kind !== "free" && model.height !== 0 && <p className="sheet-small">Координати Z уже містять додану висоту {model.height} м.</p>}

      <h2>Джерела{model.loads.length > 0 ? " і навантаження" : ""}</h2>
      <table className="sheet-table narrow">
        <thead>
          <tr>
            <th>Джерело</th>
            <th>Місце</th>
            <th>Фаза, °</th>
            <th>Напруга, В</th>
            {results && results.summary.ports.length > 1 && <th>Вхідний опір</th>}
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
              <th>Навантаження</th>
              <th>Місце</th>
              <th>Значення</th>
              <th>На частоті моделі</th>
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
                      ? [load.inductance > 0 && `L = ${load.inductance} мкГн`, load.capacitance > 0 && `C = ${load.capacitance} пФ`, `Q = ${load.q || "без втрат"}`, trap && `резонанс ${trap.toFixed(3)} МГц`].filter(Boolean).join(", ")
                      : `R = ${load.resistance} Ом, X = ${load.reactance} Ом`}
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
          <h2>Діаграми спрямованості</h2>
          <div className="sheet-plots">
            <figure>
              <figcaption>Горизонтальна, кут {fixed(results.summary.cutElevation, 0)}°</figcaption>
              <PolarPlot title="Горизонтальна діаграма" cut={results.summary.azimuthCut} max={ring} labels={["X", "Y", "−X", "−Y"]} />
            </figure>
            <figure>
              <figcaption>Вертикальна, азимут {fixed(results.summary.azimuth, 0)}°</figcaption>
              <PolarPlot
                title="Вертикальна діаграма"
                cut={results.summary.elevationCut}
                max={ring}
                labels={["0°", "90°", "180°", "−90°"]}
                upperHalf={results.overGround}
              />
            </figure>
          </div>
          <p className="sheet-small">Зовнішнє коло — {ring} дБі; кола проведено через 3, 10, 20 і 30 дБ нижче.</p>
        </section>
      )}

      {sweep && sweep.points.length > 1 && (
        <section className="sheet-break">
          <h2>Розгортка за частотою{sweep.source ? ` (джерело ${sweep.source})` : ""}</h2>
          <p>
            {(() => {
              const found = bands(sweep.points, 2);
              return found.length === 0
                ? "КСХ ніде не опускається до 2."
                : `Смуги за КСХ ≤ 2: ${found.map(({ edges }) => `${edges[0].toFixed(3)} – ${edges[1].toFixed(3)} МГц`).join("; ")}.`;
            })()}
          </p>
          <figure className="sheet-chart">
            <figcaption>КСХ ({sweep.reference} Ом)</figcaption>
            <LineChart
              title="КСХ"
              x={sweep.points.map((point) => point.frequency)}
              series={[{ name: "КСХ", values: sweep.points.map((point) => point.swr), tone: "a" }]}
              range={[1, Math.min(10, Math.max(3, Math.ceil(Math.max(...sweep.points.map((point) => point.swr)))))]}
              guides={[1.5, 2]}
              marker={sweep.frequency}
              format={(value) => (Number.isFinite(value) ? value.toFixed(2) : "∞")}
            />
          </figure>
          <figure className="sheet-chart">
            <figcaption>Вхідний опір, Ом</figcaption>
            <LineChart
              title="Вхідний опір"
              x={sweep.points.map((point) => point.frequency)}
              series={[
                { name: "R", values: sweep.points.map((point) => point.impedance[0]), tone: "a" },
                { name: "X", values: sweep.points.map((point) => point.impedance[1]), tone: "b" },
              ]}
              marker={sweep.frequency}
              format={(value) => value.toFixed(1)}
            />
          </figure>
        </section>
      )}

      {(deck.warnings.length > 0 || (results && results.warnings.length > 0)) && (
        <>
          <h2>Примітки</h2>
          <ul className="sheet-notes">
            {deck.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
            {results?.warnings.map((warning) => (
              <li key={warning}>Ядро: {warning}</li>
            ))}
          </ul>
        </>
      )}

      <footer className="sheet-foot">
        Розраховано програмою antenna-modeler (github.com/CyberDev-space/antenna-modeler) на ядрі NEC-2 nec2-rs методом моментів. Розміри — для
        тонких дротів без ізоляції; перед виготовленням перевірте модель на власній конструкції.
      </footer>
    </article>
  );
}
