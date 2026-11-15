import { readFile } from "node:fs/promises";
import init, { run } from "nec2-wasm";
import { beforeAll, describe, expect, it } from "vitest";
import { band, summarize, sweepPoints } from "./analysis";
import { buildDeck, buildSweepDeck } from "./deck";
import { defaultModel, type Model, type Wire } from "./model";
import { wavelength, wireLength } from "./segmentation";
import {
  delta,
  dipole,
  impedanceBy,
  invertedV,
  KINDS,
  leastHeight,
  makeTemplate,
  positions,
  quad,
  templateProblems,
  vertical,
  yagi,
  type TemplateInputs,
} from "./templates";

const ends = (wire: Wire): number[][] => [
  [wire.x1, wire.y1, wire.z1],
  [wire.x2, wire.y2, wire.z2],
];
const perimeter = (wires: Wire[]): number => wires.reduce((sum, wire) => sum + wireLength(wire), 0);

describe("the shapes of the templates", () => {
  it("puts the driven element of an array at the origin, the reflector behind it", () => {
    expect(positions([0.2, 0.15, 0.25], 10)).toEqual([-2, 0, 1.5, 4]);
  });

  it("feeds a dipole at its centre", () => {
    const { wires, sources } = dipole(10, 0.001);
    expect(wires).toHaveLength(1);
    expect(ends(wires[0])).toEqual([
      [0, -5, 0],
      [0, 5, 0],
    ]);
    expect(sources).toEqual([{ at: { wire: 0, place: "c" }, phase: 0, voltage: 1 }]);
  });

  it("gives an inverted V legs 120 degrees apart, fed at the apex where both wires meet", () => {
    const { wires, sources } = invertedV(5, 0.001);
    expect(wires).toHaveLength(2);
    expect(ends(wires[0])[1]).toEqual([0, 0, 0]);
    expect(ends(wires[1])[0]).toEqual([0, 0, 0]);
    for (const wire of wires) expect(wireLength(wire)).toBeCloseTo(5, 12);
    expect(wires[0].z1).toBeCloseTo(-2.5, 12);
    expect(wires[1].y2).toBeCloseTo(5 * Math.cos(Math.PI / 6), 12);
    expect(sources[0].at).toEqual({ wire: 1, place: "b" });
  });

  it("gives a vertical four radials as long as it, 45 degrees down", () => {
    const { wires, sources } = vertical(5, 0.001);
    expect(wires).toHaveLength(5);
    expect(ends(wires[0])).toEqual([
      [0, 0, 0],
      [0, 0, 5],
    ]);
    for (const radial of wires.slice(1)) {
      expect(ends(radial)[0]).toEqual([0, 0, 0]);
      expect(wireLength(radial)).toBeCloseTo(5, 12);
      expect(radial.z2).toBeCloseTo(-5 / Math.SQRT2, 12);
    }
    expect(sources[0].at).toEqual({ wire: 0, place: "b" });
  });

  it("closes a delta and a quad loop of the perimeter, fed at the middle of the bottom", () => {
    const triangle = delta(21, 0.001);
    expect(perimeter(triangle.wires)).toBeCloseTo(21, 12);
    for (const wire of triangle.wires) expect(wireLength(wire)).toBeCloseTo(7, 12);
    expect(Math.max(...triangle.wires.flatMap((wire) => [wire.z1, wire.z2]))).toBe(0);
    expect(triangle.wires[0].z1).toBe(triangle.wires[0].z2);
    expect(triangle.sources[0].at).toEqual({ wire: 0, place: "c" });

    const loops = quad([22, 20], [-3, 0], 1, 0.001);
    expect(loops.wires).toHaveLength(8);
    expect(perimeter(loops.wires.slice(0, 4))).toBeCloseTo(22, 12);
    expect(perimeter(loops.wires.slice(4))).toBeCloseTo(20, 12);
    // Each loop closes on itself, and the driven one is fed on its bottom side.
    expect(ends(loops.wires[7])[1]).toEqual(ends(loops.wires[4])[0]);
    expect(loops.wires[4].z1).toBe(-2.5);
    expect(loops.wires[4].z2).toBe(-2.5);
    expect(loops.sources[0].at).toEqual({ wire: 4, place: "c" });
  });

  it("lays Yagi elements across the boom, fed on the second", () => {
    const { wires, sources } = yagi([10.4, 10, 9.6], [-2, 0, 1.5], 1, 0.01);
    expect(wires.map((wire) => [wire.x1, wire.y1, wire.y2])).toEqual([
      [-2, -5.2, 5.2],
      [0, -5, 5],
      [1.5, -4.8, 4.8],
    ]);
    expect(sources[0].at).toEqual({ wire: 1, place: "c" });
  });
});

describe("the inputs of a template", () => {
  const inputs = (change: Partial<TemplateInputs>): TemplateInputs => ({ kind: "dipole", frequency: 14.15, height: 10, diameter: 2, elements: 3, ...change });

  it("asks only for what a kind can have", () => {
    expect(templateProblems(inputs({}), true)).toEqual([]);
    expect(templateProblems(inputs({ kind: "yagi", elements: 1 }), true)).toHaveLength(1);
    expect(templateProblems(inputs({ kind: "quad", elements: 4 }), true)).toHaveLength(1);
    expect(templateProblems(inputs({ frequency: 0 }), true)).toHaveLength(1);
    expect(templateProblems(inputs({ diameter: -1 }), true)).toHaveLength(1);
    for (const kind of KINDS) expect(kind.elements[0]).toBeLessThanOrEqual(kind.elements[1]);
  });

  it("keeps the lowest point of an antenna off the ground, and says how high it must hang", () => {
    // An inverted V for 80 m drops its ends an eighth of a wavelength below the apex.
    const low = inputs({ kind: "invertedV", frequency: 3.65, height: 8 });
    const least = leastHeight(low);
    expect(least).toBeGreaterThan(wavelength(3.65) / 8);
    expect(least).toBeLessThan(wavelength(3.65) / 5);
    expect(templateProblems(low, true)).toEqual([expect.stringContaining(String(least))]);
    expect(templateProblems({ ...low, height: least }, true)).toEqual([]);
    // In free space the height means nothing. A dipole and a Yagi hang from their own wire,
    // which needs only to be a fiftieth of a wavelength above the ground.
    expect(templateProblems(low, false)).toEqual([]);
    expect(leastHeight(inputs({ kind: "dipole" }))).toBe(0.5);
    expect(leastHeight(inputs({ kind: "yagi" }))).toBe(0.5);
  });
});

describe("the templates through the engine", () => {
  beforeAll(async () => {
    const wasm = await readFile(new URL(import.meta.resolve("nec2-wasm/nec2_bg.wasm")));
    await init({ module_or_path: wasm });
  });
  const impedance = impedanceBy(run);
  const make = (change: Partial<TemplateInputs>, base: Model = defaultModel) =>
    makeTemplate({ kind: "dipole", frequency: 14.15, height: 10, diameter: 2, elements: 3, ...change }, base, impedance);
  const solved = (model: Model) => {
    const deck = buildDeck(model);
    return summarize(run(deck.text).jobs[0].solutions[0], model.reference, deck.feeds);
  };

  it("cuts every kind to resonance at its height, and gives what the help says of it", async () => {
    // The table of the help: 14.15 MHz, 10 m above average ground, wire of 2 mm.
    // Resistance in ohms, gain in dBi and the angle of the lobe in degrees.
    const help: Record<string, [r: number, gain: number, elevation?: number]> = {
      "dipole 1": [73, 7.1, 30],
      "invertedV 1": [63, 6.4, 33],
      "vertical 1": [48, 1, 14],
      "delta 1": [124, 5.2, 47],
      "quad 1": [128, 7.5],
      "quad 2": [130, 11.1],
      "quad 3": [90, 11.9],
      "yagi 2": [58, 10.7],
      "yagi 6": [38, 14.2],
    };
    for (const { kind, elements } of KINDS) {
      for (let count = elements[0]; count <= elements[1]; count++) {
        const name = `${kind} ${count}`;
        const summary = solved(await make({ kind, elements: count }));
        expect(Math.abs(summary.impedance[1]), name).toBeLessThan(1);
        if (kind === "yagi") {
          expect(summary.impedance[0], name).toBeGreaterThanOrEqual(37.5);
          expect(summary.impedance[0], name).toBeLessThan(58.5);
        }
        const said = help[name];
        if (!said) continue;
        expect(Math.round(summary.impedance[0]), name).toBe(said[0]);
        expect(summary.gain, name).toBeCloseTo(said[1], 0.7);
        if (said[2] !== undefined) expect(Math.round(summary.elevation), name).toBe(said[2]);
      }
    }
  });

  it("keeps the ground, the metal and the feed line of the model, and hangs the antenna at its height", async () => {
    const base: Model = {
      ...defaultModel,
      ground: { kind: "real", permittivity: 5, conductivity: 0.001 },
      wireConductivity: 5.8e7,
      reference: 75,
      loads: [{ kind: "rx", at: { wire: 0, place: "c" }, resistance: 10, reactance: 0 }],
    };
    const model = await make({ kind: "invertedV", height: 12 }, base);
    expect(model.ground).toEqual(base.ground);
    expect(model.wireConductivity).toBe(5.8e7);
    expect(model.reference).toBe(75);
    expect(model.height).toBe(12);
    expect(model.loads).toEqual([]);
    expect(model.frequency).toBe(14.15);
    expect(model.sweep).toEqual({ from: 13.6, to: 14.7, points: 21 });
    expect(model.name).toBe("Інвертоване V, 14.15 МГц");
    // The apex is the point of the height.
    expect(Math.max(...model.wires.flatMap((wire) => [wire.z1, wire.z2]))).toBe(0);
  });

  it("makes the Yagis and quads of the table of the help, in free space, on tubes a thousandth of a wavelength thick", async () => {
    const free: Model = { ...defaultModel, ground: { ...defaultModel.ground, kind: "free" } };
    // Gain in dBi, the least F/B over ±1.5 % in dB and the boom in wavelengths.
    const help: [kind: "yagi" | "quad", count: number, gain: number, frontToBack: number, boom: number][] = [
      ["yagi", 2, 6.1, 10, 0.17],
      ["yagi", 3, 7.5, 20, 0.34],
      ["yagi", 4, 8.4, 20, 0.42],
      ["yagi", 5, 10.7, 22, 0.8],
      ["yagi", 6, 11.4, 22, 0.96],
      ["quad", 2, 7.2, 15, 0.15],
      ["quad", 3, 8.4, 20, 0.39],
    ];
    const lambda = wavelength(14.15);
    for (const [kind, count, gain, frontToBack, boom] of help) {
      const name = `${kind} ${count}`;
      const model = await make({ kind, elements: count, diameter: lambda }, free);
      const summary = solved(model);
      expect(summary.gain, name).toBeCloseTo(gain, 0.7);
      // The lobe is ahead, along X, and the reflector is behind.
      expect(summary.azimuth, name).toBe(0);
      const xs = model.wires.flatMap((wire) => [wire.x1, wire.x2]);
      expect((Math.max(...xs) - Math.min(...xs)) / lambda, name).toBeCloseTo(boom, 2);
      const swept = buildSweepDeck({ ...model, sweep: { from: 14.15 * 0.985, to: 14.15 * 1.015, points: 3 } }, { theta: 90, phi: 0 });
      for (const point of sweepPoints(run(swept.text).jobs[0].solutions, 50, swept.feeds)) {
        expect(point.frontToBack!, `${name} at ${point.frequency}`).toBeGreaterThan(frontToBack - 0.5);
        if (kind === "yagi") expect(point.swr, `${name} at ${point.frequency}`).toBeLessThan(1.55);
      }
    }
  });

  it("gives a vertical a low angle all round, and a sweep that holds the band", async () => {
    const model = await make({ kind: "vertical" });
    const summary = solved(model);
    expect(summary.elevation).toBeLessThan(20);
    expect(Math.abs(summary.frontToBack!)).toBeLessThan(0.5);
    const swept = buildSweepDeck(model);
    const found = band(sweepPoints(run(swept.text).jobs[0].solutions, 50, swept.feeds), 2);
    expect(found.edges![0]).toBeLessThan(14.0);
    expect(found.edges![1]).toBeGreaterThan(14.35);
  });

  it("refuses an antenna that would reach the ground, with the height it needs", async () => {
    await expect(make({ kind: "delta", frequency: 3.65, height: 10 })).rejects.toThrow(/\d+(\.\d)? м/);
  });
});
