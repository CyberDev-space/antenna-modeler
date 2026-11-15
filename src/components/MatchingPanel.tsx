import { swr } from "../analysis";
import { hairpin, lNetworks, quarterWave, throughQuarterWave, type Impedance, type LNetwork, type Part } from "../matching";
import { Card } from "./Card";
import { Hint } from "./Help";
import { NumberField } from "./NumberField";
import { N, t } from "../i18n";

/** What the user chose for the hairpin and the transformer: millimetres, and the velocity factor of the cable. */
export interface MatchingInputs {
  diameter: number;
  spacing: number;
  velocity: number;
}

export const defaultMatchingInputs: MatchingInputs = { diameter: 6, spacing: 50, velocity: 0.66 };

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
  inputs: MatchingInputs;
  onInputs: (inputs: MatchingInputs) => void;
}

/** Cables for a quarter-wave transformer: one cable, or two of them in parallel. */
export const CABLES: [impedance: number, name: string][] = [
  [25, N("два кабелі 50 Ом паралельно")],
  [37.5, N("два кабелі 75 Ом паралельно")],
  [50, N("кабель 50 Ом")],
  [75, N("кабель 75 Ом")],
  [93, N("кабель 93 Ом")],
];

const minus = (text: string): string => text.replace(/-/g, "−");
export const ohms = ([r, x]: Impedance): string => t("{r} {sign} j{x} Ом", { r: r.toFixed(1), sign: x < 0 ? "−" : "+", x: Math.abs(x).toFixed(1) });
export const reactance = (x: number): string => t("{sign}j{x} Ом", { sign: x < 0 ? "−" : "+", x: Math.abs(x).toFixed(1) });

/** The value of a coil or a capacitor in the units that a builder uses. */
export function value(part: Part): string {
  if (part.kind === "coil") {
    const microhenries = part.value * 1e6;
    return microhenries < 0.1 ? t("{value} нГн", { value: (microhenries * 1000).toPrecision(3) }) : t("{value} мкГн", { value: microhenries.toPrecision(3) });
  }
  const picofarads = part.value * 1e12;
  return picofarads >= 10000 ? t("{value} нФ", { value: (picofarads / 1000).toPrecision(3) }) : t("{value} пФ", { value: picofarads.toPrecision(3) });
}

export const partName = (part: Part): string => (part.kind === "coil" ? t("котушка") : t("конденсатор"));

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
export function Schematic({ network }: { network: LNetwork }) {
  const [top, bottom] = [26, 96];
  const shuntX = network.shuntAt === "line" ? 64 : 216;
  return (
    <svg className="schematic" viewBox="0 0 280 112" role="img" aria-label={t("Схема L-ланки")}>
      <line x1={20} y1={top} x2={110} y2={top} />
      <Element part={network.series} x1={110} y1={top} x2={170} y2={top} />
      <line x1={170} y1={top} x2={260} y2={top} />
      <line x1={20} y1={bottom} x2={260} y2={bottom} />
      {network.shunt && <Element part={network.shunt} x1={shuntX} y1={top} x2={shuntX} y2={bottom} />}
      {network.shunt && <circle className="node" cx={shuntX} cy={top} r={2.5} />}
      {[20, 260].flatMap((x) => [top, bottom].map((y) => <circle key={`${x} ${y}`} className="terminal" cx={x} cy={y} r={3.5} />))}
      <text x={20} y={bottom + 14} textAnchor="middle">
        {t("лінія")}
      </text>
      <text x={260} y={bottom + 14} textAnchor="middle">
        {t("антена")}
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
export function MatchingPanel({ impedance, frequency, reference, stale, source, inputs, onInputs }: Props) {
  const { diameter, spacing, velocity } = inputs;
  const setDiameter = (value: number) => onInputs({ ...inputs, diameter: value });
  const setSpacing = (value: number) => onInputs({ ...inputs, spacing: value });
  const setVelocity = (value: number) => onInputs({ ...inputs, velocity: value });
  const [r, x] = impedance;
  const networks = lNetworks(impedance, reference, frequency);
  const pin = hairpin(r, reference, frequency, diameter / 1000, spacing / 1000);
  const ideal = Math.sqrt(r * reference);
  const cables = CABLES.map(([line, name]) => ({ line, name, swr: swr(throughQuarterWave(impedance, line), reference) }));
  const best = cables.reduce((one, other) => (other.swr < one.swr ? other : one));

  return (
    <div className="matching">
      <p className="band">
        {t("Антена{source}: {impedance} на {frequency} МГц, лінія {reference} Ом, КСХ {swr}.", {
          source: source ? t(" (джерело {place})", { place: source }) : "",
          impedance: ohms(impedance),
          frequency,
          reference,
          swr: swr(impedance, reference).toFixed(2),
        })}
      </p>
      {stale && <p className="note">{t("Модель змінено: опір належить попередній. Розрахуйте її знову.")}</p>}
      <div className={stale ? "matching-cards stale" : "matching-cards"}>
        <Card title={<Hint topic="matchLNetwork">{t("L-ланка")}</Hint>}>
          {networks.length === 0 ? (
            <p className="note">{t("Для цього опору L-ланки немає.")}</p>
          ) : (
            <div className="networks">
              {networks.map((network, k) => (
                <section key={k}>
                  <h4>{t("Варіант {n}", { n: k + 1 })}</h4>
                  <Schematic network={network} />
                  <ul>
                    {network.series && (
                      <li>
                        {t("Послідовно: {part} {value} ({reactance})", {
                          part: partName(network.series),
                          value: value(network.series),
                          reactance: reactance(network.series.reactance),
                        })}
                      </li>
                    )}
                    {network.shunt && (
                      <li>
                        {(() => {
                          const values = { part: partName(network.shunt), value: value(network.shunt), reactance: reactance(network.shunt.reactance) };
                          return network.shuntAt === "line"
                            ? t("Паралельно з боку лінії: {part} {value} ({reactance})", values)
                            : t("Паралельно з боку антени: {part} {value} ({reactance})", values);
                        })()}
                      </li>
                    )}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Card>

        <Card title={<Hint topic="matchHairpin">{t("Шпилька (бета-узгодження)")}</Hint>}>
          {pin ? (
            <>
              <p>
                {t("Вкоротіть активний вібратор, щоб його реактивність стала {target} (зараз {now}). Тоді шпилька через точку живлення — індуктивність {inductance} мкГн ({reactance}).", {
                  target: reactance(pin.antennaReactance),
                  now: reactance(x),
                  inductance: (pin.inductance * 1e6).toPrecision(3),
                  reactance: reactance(pin.reactance),
                })}
              </p>
              <div className="settings">
                <NumberField label={t("Діаметр трубок, мм")} help="hairpinDiameter" value={diameter} onChange={setDiameter} />
                <NumberField label={t("Відстань між осями, мм")} help="hairpinSpacing" value={spacing} onChange={setSpacing} />
              </div>
              <p>
                {t("З двох трубок Ø {diameter} мм на відстані {spacing} мм шпилька має хвильовий опір {impedance} Ом і довжину", {
                  diameter,
                  spacing,
                  impedance: pin.lineImpedance.toFixed(0),
                })}{" "}
                <strong>{t("{length} мм", { length: (pin.length * 1000).toFixed(0) })}</strong> {t("від точки живлення до перемички.")}
              </p>
              <p className="note">
                {t("Вкоротити вібратор може оптимізатор: змінна — довжина активного вібратора, ціль — реактивність з цільовою X = {target} Ом, решта ваг 0. Вкорочення трохи змінює й активний опір: після нього перегляньте цю картку знову.", {
                  target: pin.antennaReactance.toFixed(1).replace("-", "−"),
                })}
              </p>
            </>
          ) : spacing > diameter ? (
            <p className="note">{t("Шпилька узгоджує лише антену з активним опором, меншим за опір лінії ({reference} Ом).", { reference })}</p>
          ) : (
            <>
              <div className="settings">
                <NumberField label={t("Діаметр трубок, мм")} help="hairpinDiameter" value={diameter} onChange={setDiameter} />
                <NumberField label={t("Відстань між осями, мм")} help="hairpinSpacing" value={spacing} onChange={setSpacing} />
              </div>
              <p className="note">{t("Відстань між осями трубок має бути більшою за їхній діаметр.")}</p>
            </>
          )}
        </Card>

        <Card title={<Hint topic="matchQuarterWave">{t("Чвертьхвильовий трансформатор")}</Hint>}>
          <p>
            {t("Ідеальний хвильовий опір відрізка — {ideal} Ом", { ideal: ideal.toFixed(1) })}
            {Math.abs(x) > 0.1 * r ? t("; реактивність антени він не прибирає, тож КСХ лишиться трохи більшим.") : "."}
          </p>
          <table className="cables">
            <thead>
              <tr>
                <th>{t("Відрізок")}</th>
                <th>{t("Ом")}</th>
                <th>{t("КСХ")}</th>
              </tr>
            </thead>
            <tbody>
              {cables.map((cable) => (
                <tr key={cable.line} className={cable === best ? "best" : undefined}>
                  <td>{t(cable.name)}</td>
                  <td>{cable.line}</td>
                  <td>{Number.isFinite(cable.swr) ? cable.swr.toFixed(2) : "∞"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="settings">
            <NumberField label={t("Коефіцієнт укорочення")} help="velocityFactor" value={velocity} onChange={setVelocity} />
          </div>
          <p>
            {velocity > 0 && velocity <= 1 ? (
              <>
                {t("Довжина відрізка —")} <strong>{t("{length} мм", { length: minus((quarterWave(frequency, velocity) * 1000).toFixed(0)) })}</strong>
                {t(": чверть хвилі в кабелі.")}
              </>
            ) : (
              t("Коефіцієнт укорочення має бути між 0 і 1.")
            )}
          </p>
        </Card>
      </div>
    </div>
  );
}
