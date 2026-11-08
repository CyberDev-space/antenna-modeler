import type { Summary } from "../analysis";
import { Card } from "./Card";
import { Hint } from "./Help";
import { PolarPlot } from "./PolarPlot";

/** A number with a true minus sign, and without the sign of a rounded zero. */
export function fixed(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return Number(text) === 0 ? text.replace("-", "") : text.replace("-", "−");
}

/** An angle with a tenth of a degree where it has one. */
export const degrees = (value: number): string => String(Number(value.toFixed(1))).replace("-", "−");

export function impedance([r, x]: [number, number]): string {
  return `${fixed(r, 1)} ${x < 0 ? "−" : "+"} j${Math.abs(x).toFixed(1)} Ом`;
}

export const swrText = (value: number): string => (Number.isFinite(value) ? fixed(value, 2) : "∞");

interface TilesProps {
  summary: Summary;
  /** The places of the sources, as `w1c`, to name them in the table of several. */
  sources: string[];
  reference: number;
  /** The model has loss in its wires or loads: the efficiency says something. */
  lossy: boolean;
}

/** The numbers that matter most, in one row: the impedance and SWR of every source, gain, F/B, the direction of the maximum. */
export function SummaryTiles({ summary, sources, reference, lossy }: TilesProps) {
  const several = summary.ports.length > 1;
  const input = summary.ports.reduce((total, port) => total + port.power, 0);
  return (
    <>
      <dl className="summary">
        {!several && (
          <>
            <div>
              <dt>
                <Hint topic="impedance">Вхідний опір</Hint>
              </dt>
              <dd>{impedance(summary.impedance)}</dd>
            </div>
            <div>
              <dt>
                <Hint topic="swr">КСХ ({reference} Ом)</Hint>
              </dt>
              <dd>{swrText(summary.swr)}</dd>
            </div>
          </>
        )}
        <div>
          <dt>
            <Hint topic="gain">Підсилення</Hint>
          </dt>
          <dd>{fixed(summary.gain, 2)} дБі</dd>
        </div>
        <div>
          <dt>
            <Hint topic="frontToBack">Фронт/тил</Hint>
          </dt>
          <dd>{summary.frontToBack === null ? "—" : `${fixed(summary.frontToBack, 1)} дБ`}</dd>
        </div>
        <div>
          <dt>
            <Hint topic="elevation">Кут випромінювання</Hint>
          </dt>
          <dd>{degrees(summary.elevation)}°</dd>
        </div>
        <div>
          <dt>
            <Hint topic="azimuth">Азимут максимуму</Hint>
          </dt>
          <dd>{fixed(summary.azimuth, 0)}°</dd>
        </div>
        {lossy && summary.efficiency !== null && (
          <div>
            <dt>
              <Hint topic="efficiency">ККД</Hint>
            </dt>
            <dd>{fixed(summary.efficiency * 100, 1)} %</dd>
          </div>
        )}
      </dl>
      {several && (
        <table className="ports">
          <thead>
            <tr>
              <th>Джерело</th>
              <th>
                <Hint topic="impedance">Вхідний опір</Hint>
              </th>
              <th>
                <Hint topic="swr">КСХ ({reference} Ом)</Hint>
              </th>
              <th>
                <Hint topic="portPower">Потужність</Hint>
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.ports.map((port, index) => (
              <tr key={index}>
                <td>
                  {index + 1}: {sources[index]}
                </td>
                <td>{port.impedance ? impedance(port.impedance) : "без напруги"}</td>
                <td>{port.swr === null ? "—" : swrText(port.swr)}</td>
                <td>{input > 0 && port.impedance ? `${fixed((port.power / input) * 100, 0)} %` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

interface PatternProps {
  summary: Summary;
  /** The pattern covers only the upper half space. */
  overGround: boolean;
}

/** The two cuts of the pattern through its maximum, each in a card of its own. */
export function PatternCards({ summary, overGround }: PatternProps) {
  const ring = Math.ceil(summary.gain);
  const scale = <span className="caption">зовнішнє коло {ring} дБі</span>;
  const horizontal = `Горизонтальна діаграма, кут ${fixed(summary.cutElevation, 0)}°`;
  const vertical = `Вертикальна діаграма, азимут ${fixed(summary.azimuth, 0)}°`;
  return (
    <>
      <Card title={<Hint topic="patternHorizontal">{horizontal}</Hint>} actions={scale} className="pattern-h">
        <PolarPlot title={horizontal} cut={summary.azimuthCut} max={ring} labels={["X", "Y", "−X", "−Y"]} />
      </Card>
      <Card title={<Hint topic="patternVertical">{vertical}</Hint>} actions={scale} className="pattern-v">
        <PolarPlot title={vertical} cut={summary.elevationCut} max={ring} labels={["0°", "90°", "180°", "−90°"]} upperHalf={overGround} />
      </Card>
    </>
  );
}
