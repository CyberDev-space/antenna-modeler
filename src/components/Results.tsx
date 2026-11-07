import type { Summary } from "../analysis";
import { PolarPlot } from "./PolarPlot";

interface Props {
  summary: Summary;
  reference: number;
  /** The pattern covers only the upper half space. */
  overGround: boolean;
  /** The model has loss in its wires or loads: the efficiency says something. */
  lossy: boolean;
}

/** A number with a true minus sign, and without the sign of a rounded zero. */
function fixed(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return Number(text) === 0 ? text.replace("-", "") : text.replace("-", "−");
}

/** An angle with a tenth of a degree where it has one. */
const degrees = (value: number): string => String(Number(value.toFixed(1))).replace("-", "−");

function impedance([r, x]: [number, number]): string {
  return `${fixed(r, 1)} ${x < 0 ? "−" : "+"} j${Math.abs(x).toFixed(1)} Ом`;
}

/** The numbers and the two cuts of the pattern. */
export function Results({ summary, reference, overGround, lossy }: Props) {
  const ring = Math.ceil(summary.gain);
  return (
    <>
      <dl className="summary">
        <div>
          <dt>Вхідний опір</dt>
          <dd>{impedance(summary.impedance)}</dd>
        </div>
        <div>
          <dt>КСХ ({reference} Ом)</dt>
          <dd>{Number.isFinite(summary.swr) ? fixed(summary.swr, 2) : "∞"}</dd>
        </div>
        <div>
          <dt>Підсилення</dt>
          <dd>{fixed(summary.gain, 2)} дБі</dd>
        </div>
        <div>
          <dt>Фронт/тил</dt>
          <dd>{summary.frontToBack === null ? "—" : `${fixed(summary.frontToBack, 1)} дБ`}</dd>
        </div>
        <div>
          <dt>Кут випромінювання</dt>
          <dd>{degrees(summary.elevation)}°</dd>
        </div>
        <div>
          <dt>Азимут максимуму</dt>
          <dd>{fixed(summary.azimuth, 0)}°</dd>
        </div>
        {lossy && summary.efficiency !== null && (
          <div>
            <dt title="Частка потужності, що не втрачена в дротах і навантаженнях. Втрати в землі сюди не входять.">ККД</dt>
            <dd>{fixed(summary.efficiency * 100, 1)} %</dd>
          </div>
        )}
      </dl>
      <div className="plots">
        <PolarPlot
          title={`Горизонтальна діаграма, кут ${fixed(summary.cutElevation, 0)}°`}
          cut={summary.azimuthCut}
          max={ring}
          labels={["X", "Y", "−X", "−Y"]}
        />
        <PolarPlot
          title={`Вертикальна діаграма, азимут ${fixed(summary.azimuth, 0)}°`}
          cut={summary.elevationCut}
          max={ring}
          labels={["0°", "90°", "180°", "−90°"]}
          upperHalf={overGround}
        />
      </div>
      <p className="note">Зовнішнє коло: {ring} дБі. Кола проведено через 3, 10, 20 і 30 дБ нижче.</p>
    </>
  );
}
