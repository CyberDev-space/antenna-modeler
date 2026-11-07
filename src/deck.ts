import { placedWires } from "./geometry";
import { loadImpedance } from "./loads";
import { pulseSegment, type Load, type Model, type Wire } from "./model";

/** Segments per wavelength that the automatic segmentation aims at. */
const SEGMENTS_PER_WAVELENGTH = 40;

/** Steps of the pattern in degrees. Over a ground only the upper half is computed, on a finer grid. */
export const PHI_STEP = 5;
export const THETA_STEP_FREE = 5;
export const THETA_STEP_GROUND = 2;

/** Wavelength in metres at a frequency in MHz. */
export function wavelength(frequency: number): number {
  return 299.792458 / frequency;
}

export function wireLength(wire: Wire): number {
  return Math.hypot(wire.x2 - wire.x1, wire.y2 - wire.y1, wire.z2 - wire.z1);
}

/**
 * The number of segments of a wire: its own, or about forty for a wavelength.
 * A wire with the source or a load at its centre gets an odd number, so that
 * the centre is the middle of a segment.
 */
export function segmentCount(wire: Wire, frequency: number, centred: boolean): number {
  if (wire.segments > 0) return Math.round(wire.segments);
  let count = Math.max(1, Math.ceil((wireLength(wire) * SEGMENTS_PER_WAVELENGTH) / wavelength(frequency)));
  if (centred && count % 2 === 0) count += 1;
  return count;
}

export interface Deck {
  /** The cards for the engine. */
  text: string;
  /** The number of segments of every wire. */
  segments: number[];
  /** Why the model cannot be computed, in the language of the user; empty if it can. */
  errors: string[];
  /** What the user should know about the model. */
  warnings: string[];
}

const number = (value: number): string => String(Number(value.toPrecision(10)));

/** A height in metres within this of zero is the ground itself: the noise of a sum of two numbers. */
const ON_GROUND = 1e-9;

/** The most segments of a model: the engine of the page solves no more equations. */
export const MAX_SEGMENTS = 3000;

/** The most points that a sweep may have. */
export const MAX_SWEEP_POINTS = 201;

/** What the cards of the structure are made of. */
interface Structure {
  /** The cards of the wires, the ground and the source. */
  cards: string[];
  segments: number[];
  /** The loads that hold something, each with the tag and the segment that it sits in. */
  loads: { load: Load; tag: number; segment: number }[];
  errors: string[];
  warnings: string[];
}

/**
 * The cards of the structure, the ground and the source. The segments are
 * chosen for the frequency of the model, also when a sweep follows.
 */
function structure(model: Model): Structure {
  const { source, loads, frequency, ground } = model;
  const wires = placedWires(model);
  const overGround = ground.kind !== "free";
  const touches = (z: number): boolean => overGround && Math.abs(z) < ON_GROUND;
  const errors: string[] = [];
  const warnings: string[] = [];
  const result = (segments: number[] = [], cards: string[] = [], held: Structure["loads"] = []): Structure => ({
    cards,
    segments,
    loads: held,
    errors,
    warnings,
  });

  if (!(frequency > 0)) errors.push("Частота має бути більшою за нуль.");
  if (wires.length === 0) errors.push("У моделі немає жодного дроту.");
  if (source.wire >= wires.length) errors.push(`Джерело стоїть на дроті ${source.wire + 1}, якого немає.`);
  wires.forEach((wire, index) => {
    if (!(wireLength(wire) > 0)) errors.push(`Дріт ${index + 1} не має довжини.`);
    if (!(wire.radius > 0)) errors.push(`Радіус дроту ${index + 1} має бути більшим за нуль.`);
    if (overGround && (wire.z1 < -ON_GROUND || wire.z2 < -ON_GROUND)) errors.push(`Дріт ${index + 1} заходить під землю.`);
  });
  const lying = wires.flatMap((wire, index) => (touches(wire.z1) && touches(wire.z2) ? [index + 1] : []));
  if (lying.length > 0) {
    const which = lying.length === 1 ? `Дріт ${lying[0]} лежить` : `Дроти ${lying.join(", ")} лежать`;
    errors.push(`${which} на землі. Підніміть антену: поле «Додати висоту».`);
  }
  if (ground.kind === "real" && !(ground.permittivity > 0 || ground.conductivity > 0)) {
    errors.push("Реальній землі потрібна діелектрична проникність або провідність.");
  }
  loads.forEach((load, index) => {
    if (load.at.wire >= wires.length) errors.push(`Навантаження ${index + 1} стоїть на дроті ${load.at.wire + 1}, якого немає.`);
    if (load.kind === "lc" && (load.inductance < 0 || load.capacitance < 0 || load.q < 0)) {
      errors.push(`Навантаження ${index + 1}: L, C і Q не можуть бути від'ємними.`);
    }
  });
  if (model.wireConductivity < 0) errors.push("Провідність дротів не може бути від'ємною.");
  if (errors.length > 0) return result();

  // The source and the loads, with the words that the messages use for them.
  const pulses = [
    { at: source, name: "джерело", title: "Джерело" },
    ...loads.map((load, index) => ({ at: load.at, name: `навантаження ${index + 1}`, title: `Навантаження ${index + 1}` })),
  ];
  const lambda = wavelength(frequency);
  const segments = wires.map((wire, index) =>
    segmentCount(wire, frequency, pulses.some(({ at }) => at.wire === index && at.place === "c")),
  );
  const total = segments.reduce((sum, count) => sum + count, 0);
  if (total > MAX_SEGMENTS) {
    errors.push(`Модель має ${total} сегм., а програма рахує щонайбільше ${MAX_SEGMENTS}.`);
    return result(segments);
  }
  wires.forEach((wire, index) => {
    const length = wireLength(wire) / segments[index];
    if (length > lambda / 10) {
      warnings.push(`Сегменти дроту ${index + 1} довші за десяту частину хвилі: результат буде неточним.`);
    }
    if (length < 8 * wire.radius) {
      warnings.push(`Сегменти дроту ${index + 1} коротші за вісім радіусів: модель тонкого дроту тут неточна.`);
    }
  });
  if (ground.kind === "real") {
    wires.forEach((wire, index) => {
      if (touches(wire.z1) || touches(wire.z2)) {
        warnings.push(`Дріт ${index + 1} торкається реальної землі: таке заземлення NEC-2 рахує неточно.`);
      }
    });
  }

  // The segment that the source and every load sit in.
  const seats = pulses.map(({ at, name, title }) => {
    const count = segments[at.wire];
    const segment = pulseSegment(at, count);
    if (segment < 1 || segment > count) {
      errors.push(`${title} зсунуте за межі дроту ${at.wire + 1}: він має ${count} сегм.`);
    } else if (at.place === "c" && count % 2 === 0) {
      warnings.push(`Дріт ${at.wire + 1} має парну кількість сегментів: ${name} стоїть не точно в центрі.`);
    }
    return segment;
  });
  if (errors.length > 0) return result(segments);
  const seated = loads.flatMap((load, index) => {
    if (load.kind === "lc" && load.inductance === 0 && load.capacitance === 0) {
      warnings.push(`Навантаження ${index + 1} не має ні котушки, ні конденсатора: воно нічого не змінює.`);
      return [];
    }
    return [{ load, tag: load.at.wire + 1, segment: seats[index + 1] }];
  });

  // A wire end on the ground is joined to its image.
  const onGround = wires.some((wire) => touches(wire.z1) || touches(wire.z2));
  const cards = [`CM ${model.name.replace(/\s+/g, " ").trim() || "antenna-modeler"}`, "CE"];
  wires.forEach((wire, index) => {
    const height = (z: number): number => (touches(z) ? 0 : z);
    const ends = [wire.x1, wire.y1, height(wire.z1), wire.x2, wire.y2, height(wire.z2)].map(number).join(" ");
    cards.push(`GW ${index + 1} ${segments[index]} ${ends} ${number(wire.radius)}`);
  });
  cards.push(`GE ${onGround ? 1 : 0}`);
  if (ground.kind === "perfect") cards.push("GN 1");
  if (ground.kind === "real") cards.push(`GN 2 0 0 0 ${number(ground.permittivity)} ${number(ground.conductivity)}`);
  cards.push(`EX 0 ${source.wire + 1} ${seats[0]} 0 1 0`);
  return result(segments, cards, seated);
}

/**
 * The cards of the loss in the wires and of the loads at a frequency in MHz.
 * A group of these cards replaces the group before it.
 */
function loading(model: Model, { loads }: Structure, frequency: number): string[] {
  const cards: string[] = [];
  if (model.wireConductivity > 0) cards.push(`LD 5 0 0 0 ${number(model.wireConductivity)}`);
  for (const { load, tag, segment } of loads) {
    const impedance = loadImpedance(load, frequency);
    if (impedance) cards.push(`LD 4 ${tag} ${segment} ${segment} ${number(impedance[0])} ${number(impedance[1])}`);
  }
  return cards;
}

/**
 * The same loads for a deck that other programs will read: a coil or a
 * capacitor is written as such, so that the deck holds at other frequencies
 * too. The loss, which has no card of its own, is the resistance that the
 * quality factor gives at the frequency of the model.
 */
function lumped(model: Model, { loads }: Structure): string[] {
  const omega = 2 * Math.PI * model.frequency * 1e6;
  const cards: string[] = [];
  if (model.wireConductivity > 0) cards.push(`LD 5 0 0 0 ${number(model.wireConductivity)}`);
  for (const { load, tag, segment } of loads) {
    const at = `${tag} ${segment} ${segment}`;
    if (load.kind === "rx") {
      cards.push(`LD 4 ${at} ${number(load.resistance)} ${number(load.reactance)}`);
      continue;
    }
    const [henries, farads, q] = [load.inductance * 1e-6, load.capacitance * 1e-12, load.q];
    if (henries > 0 && farads > 0) {
      // In parallel: the coil with its loss in series becomes the coil and the resistor that stand side by side.
      const resistance = q > 0 ? ((omega * henries) / q) * (1 + q * q) : 0;
      const inductance = q > 0 ? henries * (1 + 1 / (q * q)) : henries;
      cards.push(`LD 1 ${at} ${number(resistance)} ${number(inductance)} ${number(farads)}`);
    } else if (henries > 0) {
      cards.push(`LD 0 ${at} ${number(q > 0 ? (omega * henries) / q : 0)} ${number(henries)} 0`);
    } else {
      cards.push(`LD 0 ${at} ${number(q > 0 ? 1 / (omega * farads * q) : 0)} 0 ${number(farads)}`);
    }
  }
  return cards;
}

const finish = ({ cards, segments, errors, warnings }: Structure, request: string[]): Deck => ({
  text: errors.length > 0 ? "" : [...cards, ...request, "EN"].join("\n") + "\n",
  segments,
  errors,
  warnings,
});

/** The cards of the frequency of the model and of the pattern: the whole sphere, or its upper half over a ground. */
function request(model: Model): string[] {
  const free = model.ground.kind === "free";
  const thetaStep = free ? THETA_STEP_FREE : THETA_STEP_GROUND;
  const thetaCount = (free ? 180 : 90) / thetaStep + 1;
  return [`FR 0 1 0 0 ${number(model.frequency)} 0`, `RP 0 ${thetaCount} ${360 / PHI_STEP} 1000 0 0 ${thetaStep} ${PHI_STEP}`];
}

/** The deck for the frequency of the model, with its pattern. */
export function buildDeck(model: Model): Deck {
  const base = structure(model);
  return finish(base, [...loading(model, base, model.frequency), ...request(model)]);
}

/** The deck of `buildDeck` for other programs that read NEC cards. */
export function exportDeck(model: Model): Deck {
  const base = structure(model);
  return finish(base, [...lumped(model, base), ...request(model)]);
}

/** The deck for the sweep of the model: the impedance at every frequency, without patterns. */
export function buildSweepDeck(model: Model): Deck {
  const { from, to, points } = model.sweep;
  const base = structure(model);
  if (!(from > 0)) base.errors.push("Початок розгортки має бути більшим за нуль.");
  if (!(to > from)) base.errors.push("Кінець розгортки має бути більшим за початок.");
  if (!Number.isInteger(points) || points < 2 || points > MAX_SWEEP_POINTS) {
    base.errors.push(`Розгортка має мати від 2 до ${MAX_SWEEP_POINTS} точок.`);
  }
  if (base.errors.length > 0) return finish(base, []);
  const step = (to - from) / (points - 1);
  // A coil or a capacitor has another impedance at every frequency: its
  // cards are written again for each one. Otherwise the engine steps itself.
  const steps = base.loads.some(({ load }) => load.kind === "lc")
    ? Array.from({ length: points }, (_, index) => from + index * step).flatMap((frequency) => [
        ...loading(model, base, frequency),
        `FR 0 1 0 0 ${number(frequency)} 0`,
        "XQ 0",
      ])
    : [...loading(model, base, model.frequency), `FR 0 ${points} 0 0 ${number(from)} ${number(step)}`, "XQ 0"];
  // The currents are not printed: the report of a sweep would be long for nothing.
  return finish(base, ["PT -1", ...steps]);
}
