import { expect, it } from "vitest";
import { bounds, farthest, feedPoint, placedWires, roughMarks, type Point } from "./geometry";
import { defaultModel, type Load, type Model, type Wire } from "./model";

const wire = (ends: number[]): Wire => {
  const [x1, y1, z1, x2, y2, z2] = ends;
  return { x1, y1, z1, x2, y2, z2, radius: 0.001, segments: -1 };
};

const near = (point: Point | null, expected: Point) => {
  expect(point).not.toBeNull();
  point!.forEach((value, axis) => expect(value).toBeCloseTo(expected[axis], 12));
};

it("places the source and the loads roughly, for a model that has no deck", () => {
  const load = (wire: number, place: "b" | "c" | "e"): Load => ({ kind: "rx", at: { wire, place }, resistance: 50, reactance: 0 });
  const model: Model = { ...defaultModel, wires: [wire([0, 0, 0, 2, 4, 6])], loads: [load(0, "b"), load(4, "c"), load(0, "e")] };
  near(roughMarks({ ...model, sources: [{ at: { wire: 0, place: "c", offset: 3 }, phase: 0, voltage: 1 }] }).sources[0], [1, 2, 3]);
  expect(roughMarks({ ...model, sources: [{ at: { wire: 1, place: "c" }, phase: 0, voltage: 1 }] }).sources).toEqual([]);
  // The load on a wire that does not exist has no mark.
  const { loads } = roughMarks(model);
  expect(loads).toHaveLength(2);
  near(loads[0], [0, 0, 0]);
  near(loads[1], [2, 4, 6]);
});

it("lifts the wires by the height of the model, but only over a ground", () => {
  const model = { ...defaultModel, wires: [wire([0, 0, 0, 2, 4, 6])], height: 5 };
  expect(placedWires(model)).toEqual([wire([0, 0, 5, 2, 4, 11])]);
  expect(roughMarks(model).sources).toEqual([[1, 2, 8]]);
  const free = { ...model, ground: { ...model.ground, kind: "free" as const } };
  expect(placedWires(free)).toBe(free.wires);
  expect(roughMarks(free).sources).toEqual([[1, 2, 3]]);
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

it("puts the pattern at the feed point, or between the sources that drive the antenna", () => {
  const centre: Point = [1, 0, 10];
  expect(feedPoint([[0, 0, 10]], [true], centre)).toEqual([0, 0, 10]);
  // A phased pair: the middle of its two feed points.
  expect(feedPoint([[0, 0, 10], [2, 0, 10]], [true, true], centre)).toEqual([1, 0, 10]);
  // A source without voltage feeds nothing.
  expect(feedPoint([[0, 0, 10], [2, 0, 10]], [true, false], centre)).toEqual([0, 0, 10]);
  expect(feedPoint([], [], centre)).toEqual(centre);
  expect(feedPoint([[0, 0, 10]], [false], centre)).toEqual(centre);
});
