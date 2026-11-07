import type { Pattern, Solution } from "nec2-wasm";

/** A cut through a pattern: gain in dBi against an angle in degrees. */
export interface Cut {
  angle: number[];
  gain: number[];
}

export interface Summary {
  /** Input impedance in ohms: resistance and reactance. */
  impedance: [number, number];
  swr: number;
  /** Radiated power over input power, or `null` if the engine gave no power budget. */
  efficiency: number | null;
  /**
   * The largest gain in dBi and its direction: azimuth from the X axis,
   * elevation above the horizon. The top of the lobe is found between the
   * points of the pattern, so the elevation is not a multiple of their step.
   */
  gain: number;
  azimuth: number;
  elevation: number;
  /** The elevation of the points of the pattern that the cut against azimuth is made of. */
  cutElevation: number;
  /** Gain in the direction of the maximum over the gain in the opposite azimuth, in dB. */
  frontToBack: number | null;
  /** Gain against azimuth at the elevation of the maximum. */
  azimuthCut: Cut;
  /**
   * Gain in the vertical plane through the maximum: 0 is the horizon in the
   * direction of the maximum, 90 the zenith, 180 the horizon behind.
   */
  elevationCut: Cut;
}

/** NEC-2 prints this gain where there is no field. */
const NO_FIELD = -900;

/** Gains closer than this, in dB, count as equal. */
const EQUAL = 0.01;

/** Standing-wave ratio of an impedance on a line of the given impedance. */
export function swr(impedance: [number, number], reference: number): number {
  const [r, x] = impedance;
  const reflection = Math.hypot(r - reference, x) / Math.hypot(r + reference, x);
  return reflection >= 1 ? Infinity : (1 + reflection) / (1 - reflection);
}

const turn = (angle: number): number => ((angle % 360) + 360) % 360;

/** Hundredths of a degree or of a decibel, and never a negative zero. */
const round = (value: number): number => Math.round(value * 100) / 100 + 0;

function cuts(
  pattern: Pattern,
): Pick<Summary, "gain" | "azimuth" | "elevation" | "cutElevation" | "frontToBack" | "azimuthCut" | "elevationCut"> {
  const { theta, phi, gainTotal } = pattern;
  const top = Math.max(...gainTotal);
  if (!(top > NO_FIELD)) throw new Error("the pattern has no field");
  // A dipole in free space has the same gain all around its axis. Of the
  // directions that are equal within the precision of the gains, the one
  // nearest to the horizon stands for the maximum.
  let best = -1;
  for (let i = 0; i < gainTotal.length; i++) {
    if (gainTotal[i] < top - EQUAL) continue;
    if (best < 0 || Math.abs(90 - theta[i]) < Math.abs(90 - theta[best])) best = i;
  }
  const [thetaMax, phiMax] = [theta[best], phi[best]];
  const behind = turn(phiMax + 180);

  const azimuthCut: Cut = { angle: [], gain: [] };
  const vertical = new Map<number, number>();
  let back: number | null = null;
  for (let i = 0; i < gainTotal.length; i++) {
    const gain = Math.max(gainTotal[i], NO_FIELD);
    if (theta[i] === thetaMax) {
      azimuthCut.angle.push(phi[i]);
      azimuthCut.gain.push(gain);
      if (phi[i] === behind) back = gain;
    }
    // The half plane of the maximum and the half plane behind it.
    if (phi[i] === phiMax) vertical.set(turn(90 - theta[i]), gain);
    else if (phi[i] === behind) vertical.set(turn(90 + theta[i]), gain);
  }
  const angles = [...vertical.keys()].sort((a, b) => a - b);
  const elevationCut: Cut = { angle: angles, gain: angles.map((angle) => vertical.get(angle)!) };

  // The top of the lobe lies between the points of the pattern. A parabola
  // through the best point and its two neighbours in elevation finds it.
  let [gainTop, elevationTop] = [gainTotal[best], 90 - thetaMax];
  const at = angles.indexOf(turn(90 - thetaMax));
  const [lower, upper] = [angles[at - 1], angles[at + 1]];
  if (lower !== undefined && upper !== undefined && upper - angles[at] === angles[at] - lower) {
    const [below, above] = [vertical.get(lower)!, vertical.get(upper)!];
    const bend = below - 2 * gainTop + above;
    if (below > NO_FIELD && above > NO_FIELD && bend < 0) {
      const shift = (0.5 * (below - above)) / bend;
      elevationTop += shift * (upper - angles[at]);
      gainTop -= 0.25 * (below - above) * shift;
    }
  }

  return {
    gain: round(gainTop),
    azimuth: phiMax,
    elevation: round(elevationTop),
    cutElevation: 90 - thetaMax,
    // Straight up there is no front and no back.
    frontToBack: back === null || thetaMax === 0 || thetaMax === 180 ? null : gainTotal[best] - back,
    azimuthCut,
    elevationCut,
  };
}

/** The impedance at one frequency of a sweep. */
export interface SweepPoint {
  /** MHz. */
  frequency: number;
  impedance: [number, number];
  swr: number;
}

/** The points of a sweep from its solutions, one for every frequency. */
export function sweepPoints(solutions: Solution[], reference: number): SweepPoint[] {
  return solutions.map((solution) => {
    const [source] = solution.sources;
    if (!source) throw new Error("a solution of the sweep has no source");
    return { frequency: solution.frequency, impedance: source.impedance, swr: swr(source.impedance, reference) };
  });
}

/** The band around the best point of a sweep in which the SWR stays within a limit. */
export interface Band {
  /** The frequency of the smallest SWR in MHz, and that SWR. */
  best: number;
  swr: number;
  /** The edges of the band in MHz, or `null` if the best SWR is above the limit. */
  edges: [number, number] | null;
  /** The band reaches an end of the sweep: it is wider than shown. */
  open: [boolean, boolean];
}

/** Finds the point of the smallest SWR and the band around it where the SWR is at most `limit`. */
export function band(points: SweepPoint[], limit: number): Band {
  let best = 0;
  for (let i = 1; i < points.length; i++) if (points[i].swr < points[best].swr) best = i;
  const found: Band = { best: points[best].frequency, swr: points[best].swr, edges: null, open: [false, false] };
  if (points[best].swr > limit) return found;

  // Walks from the best point to the first point above the limit and
  // interpolates the crossing between the two.
  const edge = (step: -1 | 1): [number, boolean] => {
    let i = best;
    while (points[i + step] && points[i + step].swr <= limit) i += step;
    const [inside, outside] = [points[i], points[i + step]];
    if (!outside) return [inside.frequency, true];
    const part = (limit - inside.swr) / (outside.swr - inside.swr);
    return [inside.frequency + part * (outside.frequency - inside.frequency), false];
  };
  const [low, lowOpen] = edge(-1);
  const [high, highOpen] = edge(1);
  return { ...found, edges: [low, high], open: [lowOpen, highOpen] };
}

/** The numbers of the result screen from a solution of the engine. */
export function summarize(solution: Solution, reference: number): Summary {
  const [source] = solution.sources;
  const [pattern] = solution.patterns;
  if (!source || !pattern) throw new Error("the solution has no source or no pattern");
  const power = solution.power;
  return {
    impedance: source.impedance,
    swr: swr(source.impedance, reference),
    efficiency: power && power.input > 0 ? power.radiated / power.input : null,
    ...cuts(pattern),
  };
}
