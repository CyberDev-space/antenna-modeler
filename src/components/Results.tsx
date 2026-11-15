import type { Summary } from "../analysis";
import { Card } from "./Card";
import { Hint } from "./Help";
import { PolarPlot } from "./PolarPlot";
import { t } from "../i18n";

/** A number with a true minus sign, and without the sign of a rounded zero. */
export function fixed(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return Number(text) === 0 ? text.replace("-", "") : text.replace("-", "−");
}

/** An angle with a tenth of a degree where it has one. */
export const degrees = (value: number): string => String(Number(value.toFixed(1))).replace("-", "−");

export function impedance([r, x]: [number, number]): string {
  return t("{r} {sign} j{x} Ом", { r: fixed(r, 1), sign: x < 0 ? "−" : "+", x: Math.abs(x).toFixed(1) });
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
                <Hint topic="impedance">{t("Вхідний опір")}</Hint>
              </dt>
              <dd>{impedance(summary.impedance)}</dd>
            </div>
            <div>
              <dt>
                <Hint topic="swr">{t("КСХ ({reference} Ом)", { reference })}</Hint>
              </dt>
              <dd>{swrText(summary.swr)}</dd>
            </div>
          </>
        )}
        <div>
          <dt>
            <Hint topic="gain">{t("Підсилення")}</Hint>
          </dt>
          <dd>{t("{gain} дБі", { gain: fixed(summary.gain, 2) })}</dd>
        </div>
        <div>
          <dt>
            <Hint topic="frontToBack">{t("Фронт/тил")}</Hint>
          </dt>
          <dd>{summary.frontToBack === null ? "—" : t("{ratio} дБ", { ratio: fixed(summary.frontToBack, 1) })}</dd>
        </div>
        <div>
          <dt>
            <Hint topic="elevation">{t("Кут випромінювання")}</Hint>
          </dt>
          <dd>{degrees(summary.elevation)}°</dd>
        </div>
        <div>
          <dt>
            <Hint topic="azimuth">{t("Азимут максимуму")}</Hint>
          </dt>
          <dd>{fixed(summary.azimuth, 0)}°</dd>
        </div>
        {lossy && summary.efficiency !== null && (
          <div>
            <dt>
              <Hint topic="efficiency">{t("ККД")}</Hint>
            </dt>
            <dd>{fixed(summary.efficiency * 100, 1)} %</dd>
          </div>
        )}
      </dl>
      {several && (
        <table className="ports">
          <thead>
            <tr>
              <th>{t("Джерело")}</th>
              <th>
                <Hint topic="impedance">{t("Вхідний опір")}</Hint>
              </th>
              <th>
                <Hint topic="swr">{t("КСХ ({reference} Ом)", { reference })}</Hint>
              </th>
              <th>
                <Hint topic="portPower">{t("Потужність")}</Hint>
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.ports.map((port, index) => (
              <tr key={index}>
                <td>
                  {index + 1}: {sources[index]}
                </td>
                <td>{port.impedance ? impedance(port.impedance) : t("без напруги")}</td>
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
  const scale = <span className="caption">{t("зовнішнє коло {ring} дБі", { ring })}</span>;
  const horizontal = t("Горизонтальна діаграма, кут {angle}°", { angle: fixed(summary.cutElevation, 0) });
  const vertical = t("Вертикальна діаграма, азимут {angle}°", { angle: fixed(summary.azimuth, 0) });
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
