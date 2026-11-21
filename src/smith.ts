/*
 * The geometry of the Smith chart: the plane of the reflection coefficient
 * Γ = (Z - Z0) / (Z + Z0), in which every passive impedance lies within the
 * unit circle. Circles are given by their centre and radius in that plane.
 */

export interface Circle {
  cx: number;
  cy: number;
  radius: number;
}

/** The reflection coefficient of an impedance on a line of `reference` ohms, as its real and imaginary parts. */
export function reflection([r, x]: [number, number], reference: number): [number, number] {
  // (z - 1) / (z + 1) with z = (r + jx) / Z0, multiplied out.
  const [a, b] = [r / reference, x / reference];
  const denominator = (a + 1) ** 2 + b ** 2;
  return [(a * a + b * b - 1) / denominator, (2 * b) / denominator];
}

/** The circle of the impedances with a normalized resistance `r`: from Γ = (r - 1) / (r + 1) to Γ = 1. */
export const resistanceCircle = (r: number): Circle => ({ cx: r / (1 + r), cy: 0, radius: 1 / (1 + r) });

/** The circle, of which the unit circle cuts an arc, of the impedances with a normalized reactance `x`, not zero. */
export const reactanceCircle = (x: number): Circle => ({ cx: 1, cy: 1 / x, radius: 1 / Math.abs(x) });

/** Where the arc of a normalized reactance meets the edge of the chart, as an angle in radians from the positive real axis. */
export const reactanceAngle = (x: number): number => Math.PI * Math.sign(x) - 2 * Math.atan(x);

/** The radius of the circle of a standing wave ratio around the centre. */
export const swrRadius = (swr: number): number => (swr - 1) / (swr + 1);
