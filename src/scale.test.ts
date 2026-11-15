import { describe, expect, it } from "vitest";
import { defaultModel, type Model } from "./model";
import { scaleModel } from "./scale";

describe("moving a model to another frequency", () => {
  const trap: Model = {
    ...defaultModel,
    height: 10,
    loads: [{ kind: "lc", at: { wire: 0, place: "c" }, inductance: 8, capacitance: 50, q: 200 }],
  };

  it("scales every length by the ratio of the frequencies, and the radii if asked", () => {
    const twice = scaleModel(trap, 28.3, true);
    expect(twice.frequency).toBe(28.3);
    expect(twice.wires[0]).toMatchObject({ y1: -2.59, y2: 2.59, z1: 5, z2: 5, radius: 0.0005 });
    expect(twice.height).toBe(5);
    expect(scaleModel(trap, 28.3, false).wires[0].radius).toBe(0.001);
  });

  it("keeps the reactances of coils and capacitors at the new frequency, and moves the sweep", () => {
    const twice = scaleModel(trap, 28.3, true);
    expect(twice.loads[0]).toMatchObject({ inductance: 4, capacitance: 25, q: 200 });
    // 2πfL and 1/(2πfC) stay as they were.
    expect(28.3 * (twice.loads[0] as { inductance: number }).inductance).toBeCloseTo(14.15 * 8, 9);
    expect(twice.sweep).toEqual({ ...trap.sweep, from: 27.2, to: 29.4 });
  });

  it("leaves a fixed impedance as it is", () => {
    const fixed: Model = { ...defaultModel, loads: [{ kind: "rx", at: { wire: 0, place: "c" }, resistance: 50, reactance: 10 }] };
    expect(scaleModel(fixed, 7, true).loads).toEqual(fixed.loads);
  });
});
