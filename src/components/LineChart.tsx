import { useState, type PointerEvent } from "react";
import { ticks } from "../ticks";
import { fontScale, useSize } from "../useSize";

export interface Series {
  name: string;
  values: number[];
  /** Picks the colour: "a" or "b". */
  tone: "a" | "b";
}

interface Props {
  title: string;
  /** The values along the horizontal axis: frequencies in MHz, unless `xUnit` says otherwise. */
  x: number[];
  /** The unit of the horizontal axis for the readout, and how its values are written. */
  xUnit?: string;
  xFormat?: (value: number) => string;
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

/** Room around the plot for the labels, in pixels at the usual font size. */
const ROOM = { left: 52, right: 12, top: 10, bottom: 26 };

const megahertz = (value: number): string => Number(value.toFixed(3)).toString();

/** A chart of one or two quantities against frequency, with a readout under the pointer. It fills the space it is given. */
export function LineChart({ title, x, xUnit = "МГц", xFormat = megahertz, series, range, guides = [], marker, format }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [host, size] = useSize<HTMLDivElement>();
  const WIDTH = size.width || 520;
  const HEIGHT = size.height || 250;
  const k = fontScale();
  const [LEFT, RIGHT, TOP, BOTTOM] = [ROOM.left * k, ROOM.right * k, ROOM.top * k, ROOM.bottom * k];

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
        <span className="readout">
          {hover !== null && `${xFormat(x[hover])} ${xUnit} `}
          {series.map((one) => (
            <span key={one.name} className={`legend tone-${one.tone}`}>
              {one.name}
              {hover !== null && ` ${format(one.values[hover])}`}
            </span>
          ))}
        </span>
      </figcaption>
      <div className="chart-body" ref={host}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label={title}
        onPointerMove={move}
        onPointerDown={move}
        onPointerLeave={() => setHover(null)}
      >
        {ticks(low, high, Math.max(3, Math.round(HEIGHT / (55 * k)))).map((mark) => (
          <g key={mark}>
            <line className={mark === 0 ? "zero" : "grid"} x1={LEFT} x2={WIDTH - RIGHT} y1={py(mark)} y2={py(mark)} />
            <text className="tick" x={LEFT - 6 * k} y={py(mark) + 4 * k} textAnchor="end">
              {mark}
            </text>
          </g>
        ))}
        {ticks(first, last, Math.max(4, Math.round(WIDTH / (110 * k)))).map((mark) => (
          <g key={mark}>
            <line className="grid" x1={px(mark)} x2={px(mark)} y1={TOP} y2={HEIGHT - BOTTOM} />
            <text className="tick" x={px(mark)} y={HEIGHT - BOTTOM + 16 * k} textAnchor="middle">
              {xFormat(mark)}
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
      </div>
    </figure>
  );
}
