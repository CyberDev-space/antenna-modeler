import type { Cut } from "../analysis";

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
const SIZE = 300;
const RADIUS = 118;
const CENTRE = SIZE / 2;

const radius = (gain: number, max: number): number => RADIUS * Math.max(0, 1 + (gain - max) / RANGE);

function point(angle: number, r: number): [number, number] {
  const radians = (angle * Math.PI) / 180;
  return [CENTRE + r * Math.cos(radians), CENTRE - r * Math.sin(radians)];
}

/** A polar plot of gain in dB below the maximum, angles counted anticlockwise from the right. */
export function PolarPlot({ title, cut, max, labels, upperHalf }: Props) {
  const closed = !upperHalf && cut.angle.length > 2;
  const path =
    cut.angle
      .map((angle, i) => {
        const [x, y] = point(angle, radius(cut.gain[i], max));
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + (closed ? " Z" : "");
  const height = upperHalf ? CENTRE + 22 : SIZE;

  return (
    <figure className="plot">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${SIZE} ${height}`} role="img" aria-label={title}>
        {RINGS.map((ring) => {
          const r = RADIUS * (1 + ring / RANGE);
          return upperHalf ? (
            <path key={ring} className="ring" d={`M${CENTRE - r},${CENTRE} A${r},${r} 0 0 1 ${CENTRE + r},${CENTRE}`} />
          ) : (
            <circle key={ring} className="ring" cx={CENTRE} cy={CENTRE} r={r} />
          );
        })}
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
          .filter((angle) => !upperHalf || angle <= 180)
          .map((angle) => {
            const [x, y] = point(angle, RADIUS);
            return <line key={angle} className="spoke" x1={CENTRE} y1={CENTRE} x2={x} y2={y} />;
          })}
        {RINGS.slice(1).map((ring) => (
          <text key={ring} className="ring-label" x={CENTRE + 3} y={CENTRE - RADIUS * (1 + ring / RANGE) - 2}>
            {ring}
          </text>
        ))}
        <path className="pattern" d={path} />
        {labels.map((label, i) => {
          if (upperHalf && i === 3) return null;
          const [x, y] = point(i * 90, RADIUS + 14);
          return (
            <text key={i} className="axis-label" x={x} y={y + 4} textAnchor="middle">
              {label}
            </text>
          );
        })}
      </svg>
    </figure>
  );
}
