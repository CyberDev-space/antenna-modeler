import { expect, it } from "vitest";
import { ticks } from "./ticks";

it("marks an axis with round values", () => {
  expect(ticks(1, 3)).toEqual([1, 1.5, 2, 2.5, 3]);
  expect(ticks(13.9, 14.4, 6)).toEqual([13.9, 14, 14.1, 14.2, 14.3, 14.4]);
  expect(ticks(-37, 112)).toEqual([0, 50, 100]);
  expect(ticks(0, 1000)).toEqual([0, 200, 400, 600, 800, 1000]);
  expect(ticks(5, 5)).toEqual([5]);
});
