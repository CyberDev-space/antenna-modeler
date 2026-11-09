import type { Complex, Segment } from "nec2-wasm";
import { describe, expect, it } from "vitest";
import { currentLines, magnitude, phase, unwrap } from "./currents";
import type { Equivalent } from "./deck";
import type { Wire } from "./model";

const wire = (y1: number, y2: number, z = 0): Wire => ({ x1: 0, y1, z1: z, x2: 0, y2, z2: z, radius: 0.001, segments: -1 });

/** The segments of the engine along a straight piece in the direction of Y. */
const pieces = (tag: number, y1: number, y2: number, count: number, z = 0): Segment[] =>
  Array.from({ length: count }, (_, k) => {
    const [a, b] = [y1 + ((y2 - y1) * k) / count, y1 + ((y2 - y1) * (k + 1)) / count];
    return { tag, end1: [0, a, z], end2: [0, b, z], radius: 0.001 };
  });

const real = (values: number[]): Complex[] => values.map((value) => [value, 0]);

describe("the currents along the elements", () => {
  it("run from end to end of a wire, root mean square at 100 W, and fall to nothing at its free ends", () => {
    // 50 W of peak currents: at 100 W the root mean square values are the same numbers.
    const [line] = currentLines([wire(-1, 1)], [], pieces(1, -1, 1, 4), real([1, 2, 2, 1]), 50, false);
    expect(line.wires).toEqual([0]);
    expect(line.length).toBe(2);
    expect(line.samples.map((sample) => sample.distance)).toEqual([0, 0.25, 0.75, 1.25, 1.75, 2]);
    expect(line.samples.map((sample) => sample.current[0])).toEqual([0, 1, 2, 2, 1, 0]);
    expect(line.equivalent).toBe(false);
  });

  it("keep one direction along an element whose wires point different ways", () => {
    // The second wire runs from the tip back to the joint: its current, positive its own way, is negative along the element.
    const lines = currentLines([wire(-1, 0), wire(1, 0)], [], [...pieces(1, -1, 0, 2), ...pieces(2, 1, 0, 2)], real([1, 2, -1, -2]), 50, false);
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line.wires).toEqual([0, 1]);
    expect(line.samples.map((sample) => [sample.distance, sample.current[0]])).toEqual([
      [0, 0],
      [0.25, 1],
      [0.75, 2],
      [1.25, 2],
      [1.75, 1],
      [2, 0],
    ]);
  });

  it("go on at a joint with another wire and at the ground", () => {
    // A bend at the end of the first wire, and a wire standing on the ground.
    const bent: Wire = { x1: 0, y1: 1, z1: 0, x2: 1, y2: 1, z2: 0, radius: 0.001, segments: -1 };
    const lines = currentLines([wire(-1, 1), bent], [], [...pieces(1, -1, 1, 2), { tag: 2, end1: [0, 1, 0], end2: [1, 1, 0], radius: 0.001 }], real([1, 3, 2]), 50, false);
    expect(lines[0].samples.at(-1)!.current[0]).toBe(3);
    expect(lines[0].samples[0].current[0]).toBe(0);
    const standing: Wire = { x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 5, radius: 0.001, segments: -1 };
    const up: Segment[] = [0, 1].map((k) => ({ tag: 1, end1: [0, 0, 2.5 * k], end2: [0, 0, 2.5 * (k + 1)], radius: 0.001 }));
    const [vertical] = currentLines([standing], [], up, real([2, 1]), 50, true);
    expect(vertical.samples.map((sample) => sample.current[0])).toEqual([2, 2, 1, 0]);
  });

  it("stretch the current of Leeson's cylinder over the tubes of its element", () => {
    const tubes = [wire(-5, -1, 10), wire(-1, 1, 10), wire(1, 5, 10)];
    const equivalent: Equivalent = { wires: [0, 1, 2], tag: 2, ends: [[0, -5, 10], [0, 5, 10]], length: 9.6, radius: 0.012, segments: 4 };
    const [line] = currentLines(tubes, [equivalent], pieces(2, -4.8, 4.8, 4, 10), real([1, 2, 2, 1]), 50, false);
    expect(line.equivalent).toBe(true);
    expect(line.wires).toEqual([0, 1, 2]);
    expect(line.length).toBe(10);
    line.samples.forEach((sample, k) => expect(sample.distance).toBeCloseTo([0, 1.25, 3.75, 6.25, 8.75, 10][k], 12));
  });

  it("give the magnitude and the phase, and phases without jumps", () => {
    expect(magnitude([3, 4])).toBe(5);
    expect(phase([0, 1])).toBe(90);
    expect(unwrap([170, -170, -160, 175])).toEqual([170, 190, 200, 175]);
  });
});
