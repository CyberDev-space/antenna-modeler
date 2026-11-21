import { useId, useState, type PointerEvent } from "react";
import { swr } from "../analysis";
import { reactanceAngle, reactanceCircle, reflection, resistanceCircle, swrRadius } from "../smith";
import { fontScale, useSize } from "../useSize";
import { impedance, swrText } from "./Results";
import { t } from "../i18n";

interface Props {
  title: string;
  /** MHz, with the impedance at each in ohms. */
  frequencies: number[];
  impedances: [number, number][];
  /** The impedance of the line, at the centre of the chart. */
  reference: number;
  /** A frequency to mark: that of the model. */
  marker?: number;
  /** The impedances of a variant kept for comparison, drawn dashed. */
  compare?: [number, number][];
}

/** The normalized resistances and reactances of the grid. */
const GRID = [0.2, 0.5, 1, 2, 5];

/** The SWR circles drawn for comparison, as on the chart of the SWR. */
const GUIDES = [1.5, 2];

/** Room around the circle for the labels of the reactances, in pixels at the usual font size. */
const ROOM = 30;

const megahertz = (value: number): string => value.toFixed(3);

/** A value of the grid in ohms on this line, without the noise of binary fractions. */
const inOhms = (normalized: number, reference: number): string => String(Number((normalized * reference).toPrecision(3)));

/**
 * The impedance over the sweep on the Smith chart of the line: the centre is
 * a perfect match, the circles of the grid are resistances and the arcs
 * reactances, both labelled in ohms. A readout follows the pointer.
 */
export function SmithChart({ title, frequencies, impedances, reference, marker, compare }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [host, size] = useSize<HTMLDivElement>();
  // The circle that clips the grid, by a name that is safe in a reference to it.
  const clip = `smith-clip-${useId().replace(/[^\w-]/g, "")}`;
  const WIDTH = size.width || 320;
  const HEIGHT = size.height || 320;
  const k = fontScale();
  const radius = Math.max(20, Math.min(WIDTH, HEIGHT) / 2 - ROOM * k);
  const [cx, cy] = [WIDTH / 2, HEIGHT / 2];
  const place = ([u, v]: [number, number]): [number, number] => [cx + u * radius, cy - v * radius];

  const points = impedances.map((z) => place(reflection(z, reference)));
  // The point of the frequency of the model, between the two points of the sweep around it.
  const marked = ((): [number, number] | null => {
    if (marker === undefined || frequencies.length < 2) return null;
    const after = frequencies.findIndex((frequency) => frequency >= marker);
    if (after < 0 || (after === 0 && frequencies[0] > marker)) return null;
    if (after === 0) return points[0];
    const part = (marker - frequencies[after - 1]) / (frequencies[after] - frequencies[after - 1]);
    const [a, b] = [points[after - 1], points[after]];
    return [a[0] + part * (b[0] - a[0]), a[1] + part * (b[1] - a[1])];
  })();

  const move = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const [x, y] = [((event.clientX - box.left) / box.width) * WIDTH, ((event.clientY - box.top) / box.height) * HEIGHT];
    let nearest = 0;
    points.forEach(([px, py], index) => {
      if (Math.hypot(px - x, py - y) < Math.hypot(points[nearest][0] - x, points[nearest][1] - y)) nearest = index;
    });
    setHover(nearest);
  };

  return (
    <figure className="chart smith">
      <figcaption>
        <span className="readout">
          {hover !== null && `${megahertz(frequencies[hover])} ${t("МГц")} `}
          <span className="legend tone-a">
            Z{hover !== null && ` ${impedance(impedances[hover])}, ${t("КСХ")} ${swrText(swr(impedances[hover], reference))}`}
          </span>
          {compare && <span className="legend pinned">{t("порівняння")}</span>}
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
          <defs>
            <clipPath id={clip}>
              <circle cx={cx} cy={cy} r={radius} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clip})`}>
            {GRID.map((r) => {
              const circle = resistanceCircle(r);
              return <circle key={`r${r}`} className="grid" cx={cx + circle.cx * radius} cy={cy} r={circle.radius * radius} fill="none" />;
            })}
            {GRID.flatMap((x) => [x, -x]).map((x) => {
              const circle = reactanceCircle(x);
              return <circle key={`x${x}`} className="grid" cx={cx + circle.cx * radius} cy={cy - circle.cy * radius} r={circle.radius * radius} fill="none" />;
            })}
            <line className="grid" x1={cx - radius} x2={cx + radius} y1={cy} y2={cy} />
          </g>
          <circle className="zero" cx={cx} cy={cy} r={radius} fill="none" />
          {GUIDES.map((guide) => (
            <circle key={guide} className="guide" cx={cx} cy={cy} r={swrRadius(guide) * radius} fill="none" />
          ))}
          {GRID.map((r) => (
            <text key={`r${r}`} className="tick" x={cx + ((r - 1) / (r + 1)) * radius + 3 * k} y={cy - 4 * k}>
              {inOhms(r, reference)}
            </text>
          ))}
          {GRID.flatMap((x) => [x, -x]).map((x) => {
            const angle = reactanceAngle(x);
            const [dx, dy] = [Math.cos(angle), -Math.sin(angle)];
            const anchor = dx > 0.3 ? "start" : dx < -0.3 ? "end" : "middle";
            return (
              <text
                key={`x${x}`}
                className="tick"
                x={cx + dx * (radius + 5 * k)}
                y={cy + dy * (radius + 5 * k) + (dy > 0.3 ? 10 * k : dy < -0.3 ? -2 * k : 4 * k)}
                textAnchor={anchor}
              >
                {x > 0 ? "+" : "−"}j{inOhms(Math.abs(x), reference)}
              </text>
            );
          })}
          {compare && (
            <polyline
              className="series pinned tone-a"
              points={compare.map((z) => place(reflection(z, reference)).map((value) => value.toFixed(1)).join(",")).join(" ")}
            />
          )}
          <polyline className="series tone-a" points={points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} />
          {points.length > 0 && <circle className="start" cx={points[0][0]} cy={points[0][1]} r={3 * k} />}
          {marked && <circle className="model-point" cx={marked[0]} cy={marked[1]} r={4.5 * k} />}
          {hover !== null && <circle className="dot tone-a" cx={points[hover][0]} cy={points[hover][1]} r={3.5} />}
        </svg>
      </div>
    </figure>
  );
}
