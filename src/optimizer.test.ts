import { describe, expect, it } from "vitest";
import type { Summary } from "./analysis";
import { defaultModel, type Model, type Wire } from "./model";
import { element } from "./geometry";
import { apply, check, defaultGoals, optimize, read, score, type Goals, type Setting } from "./optimizer";

const wire = (ends: number[], radius = 0.001): Wire => {
  const [x1, y1, z1, x2, y2, z2] = ends;
  return { x1, y1, z1, x2, y2, z2, radius, segments: -1 };
};
const model = (wires: Wire[]): Model => ({ ...defaultModel, wires });
const ends = (w: Wire) => [w.x1, w.y1, w.z1, w.x2, w.y2, w.z2].map((value) => Number(value.toFixed(9)) + 0);

describe("an element", () => {
  // A tapered element of three tubes, the middle one pointing back, and a wire that hangs from its centre.
  const tubes = [wire([0, -5, 0, 0, -1, 0]), wire([0, 1, 0, 0, -1, 0], 0.015), wire([0, 1, 0, 0, 5, 0]), wire([0, 0, 0, 0, 0, -3])];

  it("is the wires in one line joined end to end", () => {
    // From one end of the element to the other: wire 1 points to -Y, so its element is walked that way.
    expect(element(tubes, 1)).toEqual([
      { wire: 2, reversed: true },
      { wire: 1, reversed: false },
      { wire: 0, reversed: true },
    ]);
    expect(element(tubes, 2)).toEqual([
      { wire: 0, reversed: false },
      { wire: 1, reversed: true },
      { wire: 2, reversed: false },
    ]);
    // A wire across the line is an element of its own, and so is every side of a loop.
    expect(element(tubes, 3)).toEqual([{ wire: 3, reversed: false }]);
    const loop = [wire([0, 0, 0, 1, 0, 0]), wire([1, 0, 0, 0.5, 1, 0]), wire([0.5, 1, 0, 0, 0, 0])];
    expect(element(loop, 1)).toEqual([{ wire: 1, reversed: false }]);
  });

  it("changes its length at its outer ends, keeping its centre and its inner joints", () => {
    const longer = apply(model(tubes), { kind: "length", wire: 1 }, 12);
    expect(read(model(tubes), { kind: "length", wire: 1 })).toBe(10);
    expect(longer.wires.slice(0, 3).map(ends)).toEqual([
      [0, -6, 0, 0, -1, 0],
      [0, 1, 0, 0, -1, 0],
      [0, 1, 0, 0, 6, 0],
    ]);
    expect(read(longer, { kind: "length", wire: 0 })).toBeCloseTo(12, 12);
    // The coordinates come out without the noise of binary fractions.
    const odd = apply(model([wire([0, -5.18, 10, 0, 5.18, 10])]), { kind: "length", wire: 0 }, 10.35825);
    expect([odd.wires[0].y1, odd.wires[0].y2]).toEqual([-5.179125, 5.179125]);
  });

  it("moves along an axis with the ends of the wires joined to it", () => {
    // A dipole, and a wire from its end down to the ground.
    const hung = model([wire([0, -5, 10, 0, 5, 10]), wire([0, 5, 10, 0, 5, 0])]);
    const variable = { kind: "position", wire: 0, axis: "x" } as const;
    expect(read(hung, variable)).toBe(0);
    const moved = apply(hung, variable, 2);
    expect(moved.wires.map(ends)).toEqual([
      [2, -5, 10, 2, 5, 10],
      [2, 5, 10, 0, 5, 0],
    ]);
    // A longer dipole drags the end of the hanging wire too.
    expect(apply(hung, { kind: "length", wire: 0 }, 12).wires[1].y1).toBeCloseTo(6, 12);
  });

  it("gives loads and phases as variables", () => {
    const loaded: Model = {
      ...model([wire([0, -5, 0, 0, 5, 0])]),
      loads: [{ kind: "lc", at: { wire: 0, place: "c" }, inductance: 10, capacitance: 0, q: 0 }],
      sources: [{ at: { wire: 0, place: "c" }, phase: 0, voltage: 1 }],
    };
    expect(read(apply(loaded, { kind: "load", load: 0, part: "inductance" }, 12), { kind: "load", load: 0, part: "inductance" })).toBe(12);
    expect(apply(loaded, { kind: "phase", source: 0 }, 90).sources[0].phase).toBe(90);
  });
});

describe("the settings of the optimizer", () => {
  it("are refused with a reason when they do not fit the model", () => {
    const settings: Setting[] = [
      { kind: "length", wire: 3, min: 1, max: 2, step: 0.1 },
      { kind: "load", load: 0, part: "inductance", min: 1, max: 2, step: 0.1 },
      { kind: "phase", source: 0, min: 10, max: 10, step: 0 },
      { kind: "length", wire: 0, min: 0, max: 2, step: 0.1 },
    ];
    expect(check(defaultModel, settings)).toEqual([
      "Змінна 1: дроту 4 немає.",
      "Змінна 2: навантаження 1 немає.",
      "Змінна 3: «від» має бути меншим за «до».",
      "Змінна 3: крок має бути більшим за нуль.",
      "Змінна 4: довжина має бути більшою за нуль.",
    ]);
    const rx: Model = { ...defaultModel, loads: [{ kind: "rx", at: { wire: 0, place: "c" }, resistance: 50, reactance: 0 }] };
    expect(check(rx, [{ kind: "load", load: 0, part: "inductance", min: 1, max: 2, step: 0.1 }])).toEqual([
      "Змінна 1: навантаження 1 не має такої величини.",
    ]);
  });
});

/** A result with the numbers that the score reads. */
const result = (change: Partial<Summary>): Summary =>
  ({ gain: 0, frontToBack: 0, swr: 1, impedance: [50, 0], elevation: 0, ...change }) as Summary;

describe("the score", () => {
  it("adds the points of every goal times its weight", () => {
    const goals: Goals = { gain: 1, frontToBack: 1, swr: 1, reactance: 1, elevation: 1, target: 20 };
    expect(score(result({ gain: 7, frontToBack: 24, swr: 2, impedance: [30, -40], elevation: 14 }), goals)).toBeCloseTo(7 + 8 - 4 - 2 - 2, 12);
    // F/B beyond 30 dB counts as 30.
    expect(score(result({ frontToBack: 45 }), { ...goals, gain: 0, swr: 0, reactance: 0, elevation: 0 })).toBe(10);
    // A goal without weight leaves out even an infinite SWR.
    expect(score(result({ gain: 3, swr: Infinity }), { ...defaultGoals, frontToBack: 0, swr: 0 })).toBe(15);
  });
});

describe("the search", () => {
  // The length of the dipole is best at 7 m: its "gain" falls off with the square of the distance.
  const dipole = model([wire([0, -5, 0, 0, 5, 0])]);
  const fake = async (candidate: Model) => ({ summary: result({ gain: -((read(candidate, { kind: "length", wire: 0 }) - 7) ** 2) }) });
  const goals: Goals = { ...defaultGoals, gain: 1, frontToBack: 0, swr: 0 };
  const setting: Setting = { kind: "length", wire: 0, min: 4, max: 12, step: 0.5 };

  it("finds the best value and tells of every improvement", async () => {
    const seen: number[] = [];
    const outcome = await optimize(dipole, [setting], goals, fake, (better) => seen.push(read(better, setting)), () => false);
    expect(outcome.reason).toBe("converged");
    expect(read(outcome.model, setting)).toBeCloseTo(7, 1);
    expect(seen.length).toBeGreaterThan(2);
    expect(seen.every((value, index) => index === 0 || Math.abs(value - 7) <= Math.abs(seen[index - 1] - 7) + 1e-12)).toBe(true);
  });

  it("stays within the limits, and stops when it is told or out of evaluations", async () => {
    const bounded = await optimize(dipole, [{ ...setting, max: 6 }], goals, fake, () => {}, () => false);
    expect(read(bounded.model, setting)).toBeCloseTo(6, 9);
    let asked = 0;
    const stopped = await optimize(dipole, [setting], goals, fake, () => {}, () => ++asked > 3);
    expect(stopped.reason).toBe("stopped");
    const limited = await optimize(dipole, [setting], goals, fake, () => {}, () => false, 4);
    expect([limited.reason, limited.evaluations]).toEqual(["limit", 4]);
    // A model that cannot be computed is no improvement.
    const nothing = await optimize(dipole, [setting], goals, async (candidate) => (candidate === dipole ? fake(candidate) : null), () => {}, () => false);
    expect(nothing.model).toBe(dipole);
  });
});
