import { useState, type PointerEvent } from "react";
import { ticks } from "../ticks";

export interface Series {
  name: string;
  values: number[];
  /** Picks the colour: "a" or "b". */
  tone: "a" | "b";
}

interface Props {
  title: string;
  /** Frequencies in MHz. */
  x: number[];
  series: Series[];
  /** The range of the vertical axis; without it the range of the values. Values outside are drawn at the edge. */
  range?: [number, number];
  /** Horizontal lines to compare with. */
  guides?: number[];
  /** A frequency to mark. */
  marker?: number;
  /** Writes a value for the readout. */
  format: (value: number) => string;
}

const WIDTH = 520;
const HEIGHT = 250;
const LEFT = 46;
const RIGHT = 12;
const TOP = 10;
const BOTTOM = 26;

const megahertz = (value: number): string => Number(value.toFixed(3)).toString();

/** A chart of one or two quantities against frequency, with a readout under the pointer. */
export function LineChart({ title, x, series, range, guides = [], marker, format }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const values = series.flatMap((one) => one.values).filter(Number.isFinite);
  let [low, high] = range ?? [Math.min(...values), Math.max(...values)];
  if (!range) {
    const margin = (high - low || Math.abs(high) || 1) * 0.08;
    low -= margin;
    high += margin;
  }
  const [first, last] = [x[0], x[x.length - 1]];
  const px = (value: number): number => LEFT + ((value - first) / (last - first)) * (WIDTH - LEFT - RIGHT);
  const py = (value: number): number => {
    const clipped = Math.min(Math.max(value, low), high);
    return TOP + (1 - (clipped - low) / (high - low)) * (HEIGHT - TOP - BOTTOM);
  };

  const move = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const at = first + (((event.clientX - box.left) / box.width) * WIDTH - LEFT) * ((last - first) / (WIDTH - LEFT - RIGHT));
    let nearest = 0;
    for (let i = 1; i < x.length; i++) if (Math.abs(x[i] - at) < Math.abs(x[nearest] - at)) nearest = i;
    setHover(nearest);
  };


  return (
    <figure className="chart">
      <figcaption>
        <span>{title}</span>
        <span className="readout">
          {hover !== null && `${megahertz(x[hover])} МГц `}
          {series.map((one) => (
            <span key={one.name} className={`legend tone-${one.tone}`}>
              {one.name}
              {hover !== null && ` ${format(one.values[hover])}`}
            </span>
          ))}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={title}
        onPointerMove={move}
        onPointerDown={move}
        onPointerLeave={() => setHover(null)}
      >
        {ticks(low, high).map((mark) => (
          <g key={mark}>
            <line className={mark === 0 ? "zero" : "grid"} x1={LEFT} x2={WIDTH - RIGHT} y1={py(mark)} y2={py(mark)} />
            <text className="tick" x={LEFT - 6} y={py(mark) + 3} textAnchor="end">
              {mark}
            </text>
          </g>
        ))}
        {ticks(first, last, 6).map((mark) => (
          <g key={mark}>
            <line className="grid" x1={px(mark)} x2={px(mark)} y1={TOP} y2={HEIGHT - BOTTOM} />
            <text className="tick" x={px(mark)} y={HEIGHT - BOTTOM + 14} textAnchor="middle">
              {megahertz(mark)}
            </text>
          </g>
        ))}
        {guides
          .filter((guide) => guide > low && guide < high)
          .map((guide) => (
            <line key={guide} className="guide" x1={LEFT} x2={WIDTH - RIGHT} y1={py(guide)} y2={py(guide)} />
          ))}
        {marker !== undefined && marker >= first && marker <= last && (
          <line className="marker" x1={px(marker)} x2={px(marker)} y1={TOP} y2={HEIGHT - BOTTOM} />
        )}
        {series.map((one) => (
          <polyline
            key={one.name}
            className={`series tone-${one.tone}`}
            points={one.values.map((value, i) => `${px(x[i]).toFixed(1)},${py(value).toFixed(1)}`).join(" ")}
          />
        ))}
        {hover !== null && (
          <g>
            <line className="cursor" x1={px(x[hover])} x2={px(x[hover])} y1={TOP} y2={HEIGHT - BOTTOM} />
            {series.map((one) => (
              <circle key={one.name} className={`dot tone-${one.tone}`} cx={px(x[hover])} cy={py(one.values[hover])} r={3.5} />
            ))}
          </g>
        )}
      </svg>
    </figure>
  );
}
