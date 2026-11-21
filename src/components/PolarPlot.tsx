import { useState, type PointerEvent } from "react";
import type { Cut } from "../analysis";
import { fontScale, useSize } from "../useSize";
import { t } from "../i18n";

interface Props {
  title: string;
  cut: Cut;
  /** The gain of the outer ring in dBi. */
  max: number;
  /** Labels at 0, 90, 180 and 270 degrees. */
  labels: [string, string, string, string];
  /** Only the upper half is drawn: a pattern over a ground. */
  upperHalf?: boolean;
  /** The cut of a variant kept for comparison, drawn dashed on the same scale and read in brackets. */
  compare?: Cut;
}

/** The plot shows this many dB below the maximum. */
const RANGE = 40;
const RINGS = [0, -3, -10, -20, -30];
/** Room around the outer ring for the labels, in pixels at the usual font size. */
const MARGIN = 26;

/**
 * A polar plot of gain in dB below the maximum, angles counted anticlockwise
 * from the right. It fills the space it is given; the pointer reads the gain
 * at the nearest angle.
 */
export function PolarPlot({ title, cut, max, labels, upperHalf, compare }: Props) {
  const [host, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const width = size.width || 300;
  const height = size.height || (upperHalf ? 170 : 300);
  const k = fontScale();
  const margin = MARGIN * k;
  const radius = Math.max(40, upperHalf ? Math.min(width / 2 - margin, height - margin - 18 * k) : Math.min(width, height) / 2 - margin);
  const cx = width / 2;
  const cy = upperHalf ? margin + radius : height / 2;
  const r = (gain: number): number => radius * Math.max(0, 1 + (gain - max) / RANGE);
  const point = (angle: number, distance: number): [number, number] => {
    const radians = (angle * Math.PI) / 180;
    return [cx + distance * Math.cos(radians), cy - distance * Math.sin(radians)];
  };
  // A cut all round closes on itself; one over a ground covers the upper half alone.
  const outline = (one: Cut): string =>
    one.angle
      .map((angle, i) => {
        const [x, y] = point(angle, r(one.gain[i]));
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + (!upperHalf && one.angle.length > 2 && one.angle.at(-1)! - one.angle[0] > 180 ? " Z" : "");
  // A variant in free space compared over a ground: only its upper half is on the plot.
  const kept =
    compare && upperHalf
      ? (({ angle, gain }: Cut): Cut => {
          const shown = angle.flatMap((one, i) => (one <= 180 ? [i] : []));
          return { angle: shown.map((i) => angle[i]), gain: shown.map((i) => gain[i]) };
        })(compare)
      : compare;
  const gap = (a: number, b: number): number => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  /** The index of the angle of a cut nearest to an angle. */
  const nearest = (one: Cut, angle: number): number => one.angle.reduce((best, a, i) => (gap(a, angle) < gap(one.angle[best], angle) ? i : best), 0);

  const move = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const angle = (((Math.atan2(cy - (event.clientY - box.top), event.clientX - box.left - cx) * 180) / Math.PI) + 360) % 360;
    setHover(cut.angle.length > 0 ? nearest(cut, angle) : null);
  };
  const gainText = (gain: number): string => (gain <= -900 ? t("немає поля") : t("{gain} дБі", { gain: gain.toFixed(2) }));
  const other = hover !== null && kept && kept.angle.length > 0 ? kept.gain[nearest(kept, cut.angle[hover])] : null;
  const readout =
    hover === null ? null : `${Number(cut.angle[hover].toFixed(1))}°: ${gainText(cut.gain[hover])}${other === null ? "" : ` (${gainText(other)})`}`;

  return (
    <figure className="plot">
      <div className="plot-body" ref={host}>
        {readout && <span className="readout overlay">{readout}</span>}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={title}
          onPointerMove={move}
          onPointerDown={move}
          onPointerLeave={() => setHover(null)}
        >
          {RINGS.map((ring) => {
            const distance = radius * (1 + ring / RANGE);
            return upperHalf ? (
              <path key={ring} className="ring" d={`M${cx - distance},${cy} A${distance},${distance} 0 0 1 ${cx + distance},${cy}`} />
            ) : (
              <circle key={ring} className="ring" cx={cx} cy={cy} r={distance} />
            );
          })}
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
            .filter((angle) => !upperHalf || angle <= 180)
            .map((angle) => {
              const [x, y] = point(angle, radius);
              return <line key={angle} className="spoke" x1={cx} y1={cy} x2={x} y2={y} />;
            })}
          {RINGS.slice(1).map((ring) => (
            <text key={ring} className="ring-label" x={cx + 3 * k} y={cy - radius * (1 + ring / RANGE) - 3 * k}>
              {ring}
            </text>
          ))}
          {kept && kept.angle.length > 0 && <path className="pattern-pinned" d={outline(kept)} />}
          <path className="pattern" d={outline(cut)} />
          {hover !== null && (
            <g>
              <line className="cursor" x1={cx} y1={cy} {...(([x2, y2]) => ({ x2, y2 }))(point(cut.angle[hover], radius))} />
              {cut.gain[hover] > -900 && <circle className="dot tone-a" cx={point(cut.angle[hover], r(cut.gain[hover]))[0]} cy={point(cut.angle[hover], r(cut.gain[hover]))[1]} r={4} />}
            </g>
          )}
          {labels.map((label, i) => {
            if (upperHalf && i === 3) return null;
            const [x, y] = point(i * 90, radius + 15 * k);
            return (
              <text key={i} className="axis-label" x={x} y={y + 4.5 * k} textAnchor="middle">
                {label}
              </text>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}
