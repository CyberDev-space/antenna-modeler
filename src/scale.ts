import type { Model } from "./model";

/** A length to the nearest nanometre, without the noise of binary fractions. */
const clean = (metres: number): number => Math.round(metres * 1e9) / 1e9 + 0;

/** A value to its significant digits, without the noise of binary fractions. */
const digits = (value: number, count: number): number => Number(value.toPrecision(count));

/**
 * The model moved to another frequency, as the scaling of MMANA: every
 * length, the height over the ground among them, is multiplied by the old
 * frequency over the new one, so that the antenna is as many wavelengths
 * long there. With `diameters` the radii of the wires follow too; that alone
 * makes the scaled antenna the same antenna electrically, though a builder
 * may keep the tubes there are. Coils and capacitors get the values that
 * give their old reactances at the new frequency, and the sweep moves with
 * the frequency.
 */
export function scaleModel(model: Model, frequency: number, diameters: boolean): Model {
  const k = model.frequency / frequency;
  const length = (metres: number): number => clean(metres * k);
  return {
    ...model,
    frequency,
    wires: model.wires.map((wire) => ({
      ...wire,
      x1: length(wire.x1),
      y1: length(wire.y1),
      z1: length(wire.z1),
      x2: length(wire.x2),
      y2: length(wire.y2),
      z2: length(wire.z2),
      radius: diameters ? length(wire.radius) : wire.radius,
    })),
    height: length(model.height),
    loads: model.loads.map((load) =>
      load.kind === "lc" ? { ...load, inductance: digits(load.inductance * k, 6), capacitance: digits(load.capacitance * k, 6) } : load,
    ),
    sweep: { ...model.sweep, from: digits(model.sweep.from / k, 6), to: digits(model.sweep.to / k, 6) },
  };
}
