import { describe, expect, it } from "vitest";
import { defaultModel, type Model, type Wire } from "./model";
import { boom, directionText, elements, millimetres, planAxes } from "./sheet";

const wire = (x: number, y1: number, y2: number, radius: number, z = 0): Wire => ({ x1: x, y1, z1: z, x2: x, y2, z2: z, radius, segments: -1 });
const model = (wires: Wire[], change: Partial<Model> = {}): Model => ({ ...defaultModel, ground: { ...defaultModel.ground, kind: "free" }, wires, ...change });

describe("the build sheet", () => {
  // A beam of three elements along X: a reflector of tubes, a driven element in two halves, a director.
  const beam = model([
    wire(-2, -5.4, -2.7, 0.01),
    wire(-2, -2.7, -0.9, 0.0125),
    wire(-2, -0.9, 0.9, 0.015),
    wire(-2, 0.9, 2.7, 0.0125),
    wire(-2, 2.7, 5.4, 0.01),
    wire(0, -5.1, 0, 0.006),
    wire(0, 0, 5.1, 0.006),
    wire(2.5, -4.8, 4.8, 0.006),
  ]);

  it("lists the elements with their lengths, centres and tubes", () => {
    const rows = elements(beam);
    expect(rows.map((row) => row.wires)).toEqual([[0, 1, 2, 3, 4], [5, 6], [7]]);
    expect(rows.map((row) => Number(row.length.toFixed(9)))).toEqual([10.8, 10.2, 9.6]);
    expect(rows[1].centre).toEqual([0, 0, 0]);
    expect(rows[1].diameter).toBe(0.012);
    expect(rows[0].diameter).toBeNull();
    expect(rows[0].tubes!.map((tube) => [Number(tube.length.toFixed(9)), tube.diameter, tube.pieces])).toEqual([
      [1.8, 0.03, 1],
      [1.8, 0.025, 2],
      [2.7, 0.02, 2],
    ]);
    expect(directionText(rows[2].direction)).toBe("уздовж Y");
  });

  it("finds the boom of parallel elements, with positions and spacings", () => {
    const layout = boom(elements(beam))!;
    expect(layout.axis).toBe(0);
    expect(layout.rows).toEqual([
      { number: 1, position: 0, spacing: null },
      { number: 2, position: 2, spacing: 2 },
      { number: 3, position: 4.5, spacing: 2.5 },
    ]);
    // Elements that are not parallel have no boom, and neither has one element.
    const bent = model([wire(0, -5, 5, 0.001), { x1: 3, y1: 0, z1: 0, x2: 3, y2: 0, z2: 5, radius: 0.001, segments: -1 }]);
    expect(boom(elements(bent))).toBeNull();
    expect(boom(elements(model([wire(0, -5, 5, 0.001)])))).toBeNull();
  });

  it("draws in the plane where the wires reach farthest", () => {
    expect(planAxes(beam)).toEqual([0, 1]);
    const vertical = model([{ x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 10, radius: 0.001, segments: -1 }, wire(0, 0, 3, 0.001)]);
    expect(planAxes(vertical)).toEqual([1, 2]);
  });

  it("gives millimetres for a builder", () => {
    expect(millimetres(10.36)).toBe("10360");
    expect(millimetres(0.5155)).toBe("515.5");
    expect(millimetres(-0.0254)).toBe("−25.4");
  });
});
