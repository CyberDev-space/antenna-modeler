import { useState, type PointerEvent } from "react";
import type { Cut } from "../analysis";
import { useSize } from "../useSize";

interface Props {
  title: string;
  cut: Cut;
  /** The gain of the outer ring in dBi. */
  max: number;
  /** Labels at 0, 90, 180 and 270 degrees. */
  labels: [string, string, string, string];
  /** Only the upper half is drawn: a pattern over a ground. */
  upperHalf?: boolean;
}

/** The plot shows this many dB below the maximum. */
const RANGE = 40;
const RINGS = [0, -3, -10, -20, -30];
/** Room around the outer ring for the labels, in pixels. */
const MARGIN = 26;

/**
 * A polar plot of gain in dB below the maximum, angles counted anticlockwise
 * from the right. It fills the space it is given; the pointer reads the gain
 * at the nearest angle.
 */
export function PolarPlot({ title, cut, max, labels, upperHalf }: Props) {
  const [host, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const width = size.width || 300;
  const height = size.height || (upperHalf ? 170 : 300);
  const radius = Math.max(40, upperHalf ? Math.min(width / 2 - MARGIN, height - MARGIN - 18) : Math.min(width, height) / 2 - MARGIN);
  const cx = width / 2;
  const cy = upperHalf ? MARGIN + radius : height / 2;
  const r = (gain: number): number => radius * Math.max(0, 1 + (gain - max) / RANGE);
  const point = (angle: number, distance: number): [number, number] => {
    const radians = (angle * Math.PI) / 180;
    return [cx + distance * Math.cos(radians), cy - distance * Math.sin(radians)];
  };
  const closed = !upperHalf && cut.angle.length > 2;
  const path =
    cut.angle
      .map((angle, i) => {
        const [x, y] = point(angle, r(cut.gain[i]));
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + (closed ? " Z" : "");

  const move = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const angle = (((Math.atan2(cy - (event.clientY - box.top), event.clientX - box.left - cx) * 180) / Math.PI) + 360) % 360;
    let nearest = 0;
    const gap = (a: number): number => Math.min(Math.abs(a - angle), 360 - Math.abs(a - angle));
    cut.angle.forEach((a, i) => {
      if (gap(a) < gap(cut.angle[nearest])) nearest = i;
    });
    setHover(cut.angle.length > 0 ? nearest : null);
  };
  const readout = hover === null ? null : `${Number(cut.angle[hover].toFixed(1))}°: ${cut.gain[hover] <= -900 ? "немає поля" : `${cut.gain[hover].toFixed(2)} дБі`}`;

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
            <text key={ring} className="ring-label" x={cx + 3} y={cy - radius * (1 + ring / RANGE) - 3}>
              {ring}
            </text>
          ))}
          <path className="pattern" d={path} />
          {hover !== null && (
            <g>
              <line className="cursor" x1={cx} y1={cy} {...(([x2, y2]) => ({ x2, y2 }))(point(cut.angle[hover], radius))} />
              {cut.gain[hover] > -900 && <circle className="dot tone-a" cx={point(cut.angle[hover], r(cut.gain[hover]))[0]} cy={point(cut.angle[hover], r(cut.gain[hover]))[1]} r={4} />}
            </g>
          )}
          {labels.map((label, i) => {
            if (upperHalf && i === 3) return null;
            const [x, y] = point(i * 90, radius + 14);
            return (
              <text key={i} className="axis-label" x={x} y={y + 4} textAnchor="middle">
                {label}
              </text>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}
