import { expect, it } from "vitest";
import { bounds, farthest, marks, placedWires, type Point } from "./geometry";
import { defaultModel, type Load, type Model, type Wire } from "./model";

const wire = (ends: number[]): Wire => {
  const [x1, y1, z1, x2, y2, z2] = ends;
  return { x1, y1, z1, x2, y2, z2, radius: 0.001, segments: -1 };
};

const near = (point: Point | null, expected: Point) => {
  expect(point).not.toBeNull();
  point!.forEach((value, axis) => expect(value).toBeCloseTo(expected[axis], 12));
};

it("places the source in the middle of its segment, or at its place when the segments are not known", () => {
  const model: Model = { ...defaultModel, wires: [wire([0, 0, 0, 2, 4, 6])] };
  const source = (place: "b" | "c" | "e", segments: number[], offset?: number) =>
    marks({ ...model, source: { wire: 0, place, offset } }, segments).source;
  near(source("b", [5]), [0.2, 0.4, 0.6]);
  near(source("c", [5]), [1, 2, 3]);
  near(source("e", [5]), [1.8, 3.6, 5.4]);
  near(source("c", [5], 1), [1.4, 2.8, 4.2]);
  // An offset beyond the wire stays on its last segment.
  near(source("c", [5], 9), [1.8, 3.6, 5.4]);
  near(source("b", []), [0, 0, 0]);
  near(source("c", []), [1, 2, 3]);
  near(source("e", []), [2, 4, 6]);
  expect(marks({ ...model, source: { wire: 1, place: "c" } }, [5]).source).toBeNull();
});

it("marks the loads whose wire exists", () => {
  const load = (wire: number, offset: number): Load => ({ kind: "rx", at: { wire, place: "c", offset }, resistance: 50, reactance: 0 });
  const model: Model = { ...defaultModel, wires: [wire([0, 0, 0, 0, 0, 10])], loads: [load(0, -2), load(4, 0), load(0, 2)] };
  const { loads } = marks(model, [5]);
  expect(loads).toHaveLength(2);
  near(loads[0], [0, 0, 1]);
  near(loads[1], [0, 0, 9]);
});

it("lifts the wires by the height of the model, but only over a ground", () => {
  const model = { ...defaultModel, wires: [wire([0, 0, 0, 2, 4, 6])], height: 5 };
  expect(placedWires(model)).toEqual([wire([0, 0, 5, 2, 4, 11])]);
  expect(marks(model, []).source).toEqual([1, 2, 8]);
  const free = { ...model, ground: { ...model.ground, kind: "free" as const } };
  expect(placedWires(free)).toBe(free.wires);
  expect(marks(free, []).source).toEqual([1, 2, 3]);
});

it("finds the sphere that holds the wires", () => {
  expect(bounds([wire([0, -5, 10, 0, 5, 10])])).toEqual({ centre: [0, 0, 10], radius: 5 });
  const box = bounds([wire([0, 0, 0, 2, 0, 0]), wire([0, 0, 0, 0, 4, 4])]);
  expect(box.centre).toEqual([1, 2, 2]);
  expect(box.radius).toBeCloseTo(3, 12);
  expect(bounds([])).toEqual({ centre: [0, 0, 0], radius: 1 });
});

it("finds how far the wires reach from a point", () => {
  const wires = [wire([0, 0, 0, 0, 0, 6]), wire([0, 0, 0, 4, 0, 0])];
  expect(farthest(wires, [0, 0, 0])).toBe(6);
  expect(farthest(wires, [4, 0, 3])).toBe(5);
  expect(farthest([], [1, 2, 3])).toBe(0);
});
