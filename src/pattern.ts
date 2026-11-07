import type { Point } from "./geometry";

/** A pattern as the engine computes it: gains in dBi at angles in degrees, theta from the zenith and phi from the X axis. */
export interface PatternGrid {
  theta: number[];
  phi: number[];
  gain: number[];
}

/** The pattern is shown this many dB below its maximum, as in the polar plots. */
export const PATTERN_RANGE = 40;

/** A colour map for a quantity from low to high that reads alike in light and dark and for those who see colours differently. */
const VIRIDIS: [number, number, number][] = [
  [0.267, 0.005, 0.329],
  [0.229, 0.322, 0.546],
  [0.128, 0.567, 0.551],
  [0.369, 0.789, 0.383],
  [0.993, 0.906, 0.144],
];

/** The colour, as red, green and blue from 0 to 1 in sRGB, for a part from 0 to 1 of the range. */
export function viridis(part: number): [number, number, number] {
  const at = Math.min(1, Math.max(0, part)) * (VIRIDIS.length - 1);
  const low = Math.min(VIRIDIS.length - 2, Math.floor(at));
  const share = at - low;
  return VIRIDIS[low].map((value, k) => value + (VIRIDIS[low + 1][k] - value) * share) as [number, number, number];
}

export interface Surface {
  /** Three numbers for every point, and the colour of every point in sRGB. */
  positions: number[];
  colors: number[];
  /** Three points for every triangle. */
  indices: number[];
  /** The largest gain in dBi: the gain at the distance `size`. */
  top: number;
}

/**
 * The surface of a pattern around a centre. In every direction its distance
 * from the centre, and its colour, stand for the gain there: `size` for the
 * maximum, nothing for PATTERN_RANGE dB below it and less. The grid closes
 * around the Z axis when its angles of phi go all the way round.
 */
export function surface(grid: PatternGrid, centre: Point, size: number): Surface {
  const thetas = [...new Set(grid.theta)].sort((a, b) => a - b);
  const phis = [...new Set(grid.phi)].sort((a, b) => a - b);
  const gains = new Map<string, number>();
  grid.gain.forEach((gain, index) => gains.set(`${grid.theta[index]} ${grid.phi[index]}`, gain));
  const top = Math.max(...grid.gain);
  const positions: number[] = [];
  const colors: number[] = [];
  for (const theta of thetas) {
    for (const phi of phis) {
      const gain = gains.get(`${theta} ${phi}`) ?? -Infinity;
      const part = Math.min(1, Math.max(0, (gain - top + PATTERN_RANGE) / PATTERN_RANGE));
      const [t, p] = [(theta * Math.PI) / 180, (phi * Math.PI) / 180];
      const direction = [Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p), Math.cos(t)];
      positions.push(...direction.map((value, k) => centre[k] + value * part * size));
      colors.push(...viridis(part));
    }
  }
  // The last angle of phi joins the first when they are one step apart around the circle.
  const step = phis.length > 1 ? phis[1] - phis[0] : 0;
  const closed = phis.length > 2 && Math.abs(360 - (phis.at(-1)! - phis[0]) - step) < 1e-6;
  const columns = closed ? phis.length : phis.length - 1;
  const index = (row: number, column: number): number => row * phis.length + (column % phis.length);
  const indices: number[] = [];
  for (let row = 0; row + 1 < thetas.length; row++) {
    for (let column = 0; column < columns; column++) {
      const [a, b, c, d] = [index(row, column), index(row + 1, column), index(row + 1, column + 1), index(row, column + 1)];
      indices.push(a, b, c, a, c, d);
    }
  }
  return { positions, colors, indices, top };
}
