import { describe, expect, it } from "vitest";
import { defaultModel, type Model, type Wire } from "./model";
import { boom, directionText, elements, millimetres, planAxes, planDimensions } from "./sheet";

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

describe("the dimensions of the drawing", () => {
  // The 4-element Yagi of DK7ZB along X, drawn from above at 0.5 units for a millimetre, Y upwards.
  const half = (x: number, length: number): Wire => wire(x, -length / 2, length / 2, 0.002);
  const yagi = model([half(0, 1.02), half(0.32, 0.949), half(0.86, 0.942), half(1.48, 0.922)]);
  const project = ([x, y]: number[]): [number, number] => [40 + x * 500, 300 - y * 500];
  const rows = elements(yagi);
  const { dimensions, numbers } = planDimensions(rows, boom(rows), [0, 1], project);

  it("give every element its length beside it, upright, and its number above it", () => {
    const lengths = dimensions.filter((dimension) => dimension.label.angle === -90);
    expect(lengths.map((dimension) => dimension.label.text)).toEqual(["1020", "949", "942", "922"]);
    // The first element: its line 14 units to its right, from its lower end to its upper end.
    expect(lengths[0].line).toEqual([
      [54, 555],
      [54, 45],
    ]);
    expect(numbers.map((number) => number.text)).toEqual(["1", "2", "3", "4"]);
    expect(numbers[0].at).toEqual([40, 33]);
  });

  it("chain the spacings below the elements, and the whole length below them", () => {
    const chains = dimensions.filter((dimension) => dimension.label.angle === 0);
    expect(chains.map((dimension) => dimension.label.text)).toEqual(["320", "540", "620", "1480"]);
    // Below the lowest end of all elements, which is the reflector's at 555.
    expect(chains[0].line).toEqual([
      [40, 581],
      [200, 581],
    ]);
    expect(chains[3].line).toEqual([
      [40, 605],
      [780, 605],
    ]);
    // The lines out from the ends of the elements.
    expect(chains[0].extensions[1]).toEqual([
      [200, 3 + 300 + 0.949 * 250],
      [200, 585],
    ]);
  });

  it("leave out the chains when the elements are not along a boom", () => {
    const bent = model([wire(0, -5, 5, 0.001), { x1: 3, y1: 0, z1: 0, x2: 3, y2: 0, z2: 5, radius: 0.001, segments: -1 }]);
    const annotated = planDimensions(elements(bent), boom(elements(bent)), [0, 1], project);
    expect(annotated.dimensions.map((dimension) => dimension.label.text)).toEqual(["10000"]);
  });
});
