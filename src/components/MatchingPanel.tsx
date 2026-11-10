import { useState } from "react";
import { swr } from "../analysis";
import { hairpin, lNetworks, quarterWave, throughQuarterWave, type Impedance, type LNetwork, type Part } from "../matching";
import { Card } from "./Card";
import { Hint } from "./Help";
import { NumberField } from "./NumberField";

interface Props {
  /** The input impedance of the antenna at the frequency of the model, in ohms. */
  impedance: Impedance;
  /** MHz. */
  frequency: number;
  /** The impedance of the feed line, in ohms. */
  reference: number;
  /** Whether the model was changed after the impedance was computed. */
  stale: boolean;
  /** The place of the source whose impedance it is, when the model has several. */
  source: string | null;
}

/** Cables for a quarter-wave transformer: one cable, or two of them in parallel. */
const CABLES: [impedance: number, name: string][] = [
  [25, "два кабелі 50 Ом паралельно"],
  [37.5, "два кабелі 75 Ом паралельно"],
  [50, "кабель 50 Ом"],
  [75, "кабель 75 Ом"],
  [93, "кабель 93 Ом"],
];

const minus = (text: string): string => text.replace(/-/g, "−");
const ohms = ([r, x]: Impedance): string => `${r.toFixed(1)} ${x < 0 ? "−" : "+"} j${Math.abs(x).toFixed(1)} Ом`;
const reactance = (x: number): string => `${x < 0 ? "−" : "+"}j${Math.abs(x).toFixed(1)} Ом`;

/** The value of a coil or a capacitor in the units that a builder uses. */
function value(part: Part): string {
  if (part.kind === "coil") {
    const microhenries = part.value * 1e6;
    return microhenries < 0.1 ? `${(microhenries * 1000).toPrecision(3)} нГн` : `${microhenries.toPrecision(3)} мкГн`;
  }
  const picofarads = part.value * 1e12;
  return picofarads >= 10000 ? `${(picofarads / 1000).toPrecision(3)} нФ` : `${picofarads.toPrecision(3)} пФ`;
}

const partName = (part: Part): string => (part.kind === "coil" ? "котушка" : "конденсатор");

/** A coil or a capacitor drawn along a line from (x1, y1) to (x2, y2), horizontal or vertical. */
function Element({ part, x1, y1, x2, y2 }: { part: Part | null; x1: number; y1: number; x2: number; y2: number }) {
  if (!part) return <line x1={x1} y1={y1} x2={x2} y2={y2} />;
  const across = y1 === y2;
  const [cx, cy] = [(x1 + x2) / 2, (y1 + y2) / 2];
  if (part.kind === "capacitor") {
    const gap = 4;
    return across ? (
      <g>
        <line x1={x1} y1={y1} x2={cx - gap} y2={cy} />
        <line x1={cx + gap} y1={cy} x2={x2} y2={y2} />
        <line className="plate" x1={cx - gap} y1={cy - 11} x2={cx - gap} y2={cy + 11} />
        <line className="plate" x1={cx + gap} y1={cy - 11} x2={cx + gap} y2={cy + 11} />
      </g>
    ) : (
      <g>
        <line x1={x1} y1={y1} x2={cx} y2={cy - gap} />
        <line x1={cx} y1={cy + gap} x2={x2} y2={y2} />
        <line className="plate" x1={cx - 11} y1={cy - gap} x2={cx + 11} y2={cy - gap} />
        <line className="plate" x1={cx - 11} y1={cy + gap} x2={cx + 11} y2={cy + gap} />
      </g>
    );
  }
  // Four turns of a coil, 32 units long.
  const turns = across
    ? `M${cx - 16},${cy} a4,4 0 0 1 8,0 a4,4 0 0 1 8,0 a4,4 0 0 1 8,0 a4,4 0 0 1 8,0`
    : `M${cx},${cy - 16} a4,4 0 0 1 0,8 a4,4 0 0 1 0,8 a4,4 0 0 1 0,8 a4,4 0 0 1 0,8`;
  return (
    <g>
      {across ? (
        <>
          <line x1={x1} y1={y1} x2={cx - 16} y2={cy} />
          <line x1={cx + 16} y1={cy} x2={x2} y2={y2} />
        </>
      ) : (
        <>
          <line x1={x1} y1={y1} x2={cx} y2={cy - 16} />
          <line x1={cx} y1={cy + 16} x2={x2} y2={y2} />
        </>
      )}
      <path d={turns} />
    </g>
  );
}

/** The drawing of an L network: the line on the left, the antenna on the right. */
function Schematic({ network }: { network: LNetwork }) {
  const [top, bottom] = [26, 96];
  const shuntX = network.shuntAt === "line" ? 64 : 216;
  return (
    <svg className="schematic" viewBox="0 0 280 112" role="img" aria-label="Схема L-ланки">
      <line x1={20} y1={top} x2={110} y2={top} />
      <Element part={network.series} x1={110} y1={top} x2={170} y2={top} />
      <line x1={170} y1={top} x2={260} y2={top} />
      <line x1={20} y1={bottom} x2={260} y2={bottom} />
      {network.shunt && <Element part={network.shunt} x1={shuntX} y1={top} x2={shuntX} y2={bottom} />}
      {network.shunt && <circle className="node" cx={shuntX} cy={top} r={2.5} />}
      {[20, 260].flatMap((x) => [top, bottom].map((y) => <circle key={`${x} ${y}`} className="terminal" cx={x} cy={y} r={3.5} />))}
      <text x={20} y={bottom + 14} textAnchor="middle">
        лінія
      </text>
      <text x={260} y={bottom + 14} textAnchor="middle">
        антена
      </text>
      {network.series && (
        <text x={140} y={top - 12} textAnchor="middle">
          {value(network.series)}
        </text>
      )}
      {network.shunt && (
        <text x={network.shuntAt === "line" ? shuntX + 18 : shuntX - 18} y={(top + bottom) / 2 + 4} textAnchor={network.shuntAt === "line" ? "start" : "end"}>
          {value(network.shunt)}
        </text>
      )}
    </svg>
  );
}

/** Three ways to match the antenna to its line at the frequency of the model. */
export function MatchingPanel({ impedance, frequency, reference, stale, source }: Props) {
  const [diameter, setDiameter] = useState(6);
  const [spacing, setSpacing] = useState(50);
  const [velocity, setVelocity] = useState(0.66);
  const [r, x] = impedance;
  const networks = lNetworks(impedance, reference, frequency);
  const pin = hairpin(r, reference, frequency, diameter / 1000, spacing / 1000);
  const ideal = Math.sqrt(r * reference);
  const cables = CABLES.map(([line, name]) => ({ line, name, swr: swr(throughQuarterWave(impedance, line), reference) }));
  const best = cables.reduce((one, other) => (other.swr < one.swr ? other : one));

  return (
    <div className="matching">
      <p className="band">
        Антена{source ? ` (джерело ${source})` : ""}: {ohms(impedance)} на {frequency} МГц, лінія {reference} Ом, КСХ {swr(impedance, reference).toFixed(2)}.
      </p>
      {stale && <p className="note">Модель змінено: опір належить попередній. Розрахуйте її знову.</p>}
      <div className={stale ? "matching-cards stale" : "matching-cards"}>
        <Card title={<Hint topic="matchLNetwork">L-ланка</Hint>}>
          {networks.length === 0 ? (
            <p className="note">Для цього опору L-ланки немає.</p>
          ) : (
            <div className="networks">
              {networks.map((network, k) => (
                <section key={k}>
                  <h4>Варіант {k + 1}</h4>
                  <Schematic network={network} />
                  <ul>
                    {network.series && (
                      <li>
                        Послідовно: {partName(network.series)} {value(network.series)} ({reactance(network.series.reactance)})
                      </li>
                    )}
                    {network.shunt && (
                      <li>
                        Паралельно з боку {network.shuntAt === "line" ? "лінії" : "антени"}: {partName(network.shunt)} {value(network.shunt)} (
                        {reactance(network.shunt.reactance)})
                      </li>
                    )}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Card>

        <Card title={<Hint topic="matchHairpin">Шпилька (бета-узгодження)</Hint>}>
          {pin ? (
            <>
              <p>
                Вкоротіть активний вібратор, щоб його реактивність стала {reactance(pin.antennaReactance)} (зараз {reactance(x)}). Тоді шпилька
                через точку живлення — індуктивність {(pin.inductance * 1e6).toPrecision(3)} мкГн ({reactance(pin.reactance)}).
              </p>
              <div className="settings">
                <NumberField label="Діаметр трубок, мм" help="hairpinDiameter" value={diameter} onChange={setDiameter} />
                <NumberField label="Відстань між осями, мм" help="hairpinSpacing" value={spacing} onChange={setSpacing} />
              </div>
              <p>
                З двох трубок Ø {diameter} мм на відстані {spacing} мм шпилька має хвильовий опір {pin.lineImpedance.toFixed(0)} Ом і довжину{" "}
                <strong>{(pin.length * 1000).toFixed(0)} мм</strong> від точки живлення до перемички.
              </p>
              <p className="note">
                Вкоротити вібратор може оптимізатор: змінна — довжина активного вібратора, ціль — реактивність з цільовою X ={" "}
                {pin.antennaReactance.toFixed(1).replace("-", "−")} Ом, решта ваг 0. Вкорочення трохи змінює й активний опір: після нього
                перегляньте цю картку знову.
              </p>
            </>
          ) : spacing > diameter ? (
            <p className="note">Шпилька узгоджує лише антену з активним опором, меншим за опір лінії ({reference} Ом).</p>
          ) : (
            <>
              <div className="settings">
                <NumberField label="Діаметр трубок, мм" help="hairpinDiameter" value={diameter} onChange={setDiameter} />
                <NumberField label="Відстань між осями, мм" help="hairpinSpacing" value={spacing} onChange={setSpacing} />
              </div>
              <p className="note">Відстань між осями трубок має бути більшою за їхній діаметр.</p>
            </>
          )}
        </Card>

        <Card title={<Hint topic="matchQuarterWave">Чвертьхвильовий трансформатор</Hint>}>
          <p>
            Ідеальний хвильовий опір відрізка — {ideal.toFixed(1)} Ом
            {Math.abs(x) > 0.1 * r ? "; реактивність антени він не прибирає, тож КСХ лишиться трохи більшим." : "."}
          </p>
          <table className="cables">
            <thead>
              <tr>
                <th>Відрізок</th>
                <th>Ом</th>
                <th>КСХ</th>
              </tr>
            </thead>
            <tbody>
              {cables.map((cable) => (
                <tr key={cable.line} className={cable === best ? "best" : undefined}>
                  <td>{cable.name}</td>
                  <td>{cable.line}</td>
                  <td>{Number.isFinite(cable.swr) ? cable.swr.toFixed(2) : "∞"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="settings">
            <NumberField label="Коефіцієнт укорочення" help="velocityFactor" value={velocity} onChange={setVelocity} />
          </div>
          <p>
            {velocity > 0 && velocity <= 1 ? (
              <>
                Довжина відрізка — <strong>{minus((quarterWave(frequency, velocity) * 1000).toFixed(0))} мм</strong>: чверть хвилі в кабелі.
              </>
            ) : (
              "Коефіцієнт укорочення має бути між 0 і 1."
            )}
          </p>
        </Card>
      </div>
    </div>
  );
}
