import { describe, expect, it } from "vitest";
import { surface, viridis, type PatternGrid } from "./pattern";

/** A grid of 30 degrees with a gain that the test chooses. */
function grid(gain: (theta: number, phi: number) => number, thetaMax = 180): PatternGrid {
  const pattern: PatternGrid = { theta: [], phi: [], gain: [] };
  for (let theta = 0; theta <= thetaMax; theta += 30) {
    for (let phi = 0; phi < 360; phi += 30) {
      pattern.theta.push(theta);
      pattern.phi.push(phi);
      pattern.gain.push(gain(theta, phi));
    }
  }
  return pattern;
}

describe("the surface of a pattern", () => {
  it("is a sphere of the given size for a gain that is the same everywhere", () => {
    const { positions, colors, indices, top } = surface(grid(() => 2), [1, 2, 3], 5);
    expect(top).toBe(2);
    for (let i = 0; i < positions.length; i += 3) {
      expect(Math.hypot(positions[i] - 1, positions[i + 1] - 2, positions[i + 2] - 3)).toBeCloseTo(5, 12);
    }
    expect(colors.slice(0, 3)).toEqual(viridis(1));
    // Six rows of bands between seven angles of theta, twelve angles of phi around, two triangles each.
    expect(indices).toHaveLength(6 * 12 * 6);
    expect(Math.max(...indices)).toBe(7 * 12 - 1);
  });

  it("draws the gain on a scale of 40 dB below the maximum, and nothing below that", () => {
    // A beam towards the X axis on the horizon, 20 dB weaker elsewhere, and no field straight up.
    const beam = surface(grid((theta, phi) => (theta === 0 ? -999.99 : theta === 90 && phi === 0 ? 10 : -10)), [0, 0, 0], 4);
    const point = (theta: number, phi: number) => {
      const at = ((theta / 30) * 12 + phi / 30) * 3;
      return beam.positions.slice(at, at + 3);
    };
    expect(point(90, 0)[0]).toBeCloseTo(4, 12);
    expect(Math.hypot(...point(90, 90))).toBeCloseTo(2, 12);
    expect(Math.hypot(...point(0, 0))).toBe(0);
    expect(beam.colors.slice(0, 3)).toEqual(viridis(0));
  });

  it("covers only the upper half over a ground, and does not close an open cut", () => {
    expect(surface(grid(() => 0, 90), [0, 0, 0], 1).indices).toHaveLength(3 * 12 * 6);
    const cut: PatternGrid = { theta: [90, 90, 90], phi: [0, 10, 20], gain: [0, 0, 0] };
    expect(surface(cut, [0, 0, 0], 1).indices).toEqual([]);
  });
});
