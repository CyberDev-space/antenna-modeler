import { describe, expect, it } from "vitest";
import { swr } from "./analysis";
import { reactanceAngle, reactanceCircle, reflection, resistanceCircle, swrRadius, type Circle } from "./smith";

const on = ({ cx, cy, radius }: Circle, [u, v]: [number, number]): number => Math.hypot(u - cx, v - cy) - radius;

describe("the Smith chart", () => {
  it("puts a matched load at the centre, a short and an open circuit at the ends of the real axis", () => {
    const [u, v] = reflection([50, 0], 50);
    expect(u).toBeCloseTo(0, 12);
    expect(v).toBeCloseTo(0, 12);
    expect(reflection([0, 0], 50)).toEqual([-1, 0]);
    expect(reflection([1e12, 0], 50)[0]).toBeCloseTo(1, 9);
    // A reactance equal to the line is a quarter turn: inductive up, capacitive down.
    expect(reflection([0, 75], 75)[0]).toBeCloseTo(0, 12);
    expect(reflection([0, 75], 75)[1]).toBeCloseTo(1, 12);
    expect(reflection([0, -75], 75)[1]).toBeCloseTo(-1, 12);
  });

  it("keeps the distance from the centre that the SWR gives", () => {
    for (const z of [[25, 0], [41.1, 12], [120, -60], [5, 300]] as [number, number][]) {
      const [u, v] = reflection(z, 50);
      expect(Math.hypot(u, v)).toBeCloseTo(swrRadius(swr(z, 50)), 12);
    }
    expect(swrRadius(2)).toBeCloseTo(1 / 3, 12);
    expect(swrRadius(1)).toBe(0);
  });

  it("draws the circles of resistance and of reactance through their impedances", () => {
    for (const r of [0.2, 0.5, 1, 2, 5]) {
      for (const x of [-3, -0.4, 0, 0.7, 10]) {
        expect(on(resistanceCircle(r), reflection([r * 50, x * 50], 50))).toBeCloseTo(0, 12);
        if (x !== 0) expect(on(reactanceCircle(x), reflection([r * 50, x * 50], 50))).toBeCloseTo(0, 12);
      }
    }
  });

  it("meets the edge of the chart where a pure reactance lies", () => {
    for (const x of [-5, -1, -0.2, 0.2, 1, 5]) {
      const [u, v] = reflection([0, x * 50], 50);
      const angle = reactanceAngle(x);
      expect(Math.cos(angle)).toBeCloseTo(u, 12);
      expect(Math.sin(angle)).toBeCloseTo(v, 12);
    }
  });
});
