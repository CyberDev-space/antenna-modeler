import { placedWires, type Marks, type Point } from "./geometry";
import { loadImpedance } from "./loads";
import { pulseSegment, type Load, type Model } from "./model";
import { joinEnds, layout, segmentCount, wavelength, wireLength } from "./segmentation";

/** Steps of the pattern in degrees. Over a ground only the upper half is computed, on a finer grid. */
export const PHI_STEP = 5;
export const THETA_STEP_FREE = 5;
export const THETA_STEP_GROUND = 2;

export interface Deck {
  /** The cards for the engine. */
  text: string;
  /** The number of segments of every wire. */
  segments: number[];
  /** Where the sources and the loads sit; `null` when the model cannot be divided into segments. */
  marks: Marks | null;
  /**
   * For every source the segments that it sits in, numbered over the whole
   * structure as the engine reports its sources; empty when the model cannot
   * be computed. A source on the joint of two wires sits in two.
   */
  feeds: number[][];
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

/**
 * The joints where two wires of different radii go on in one line, as the
 * tubes of a tapered Yagi element, by the numbers of the wires from 1. NEC-2
 * is known to be inaccurate at such steps. The ends of joined wires must be
 * exactly one point, as `joinEnds` makes them.
 */
function radiusSteps(wires: Model["wires"]): [number, number][] {
  const ends = (wire: Model["wires"][number]): Point[] => [
    [wire.x1, wire.y1, wire.z1],
    [wire.x2, wire.y2, wire.z2],
  ];
  const direction = (wire: Model["wires"][number]): Point => {
    const length = wireLength(wire);
    return [(wire.x2 - wire.x1) / length, (wire.y2 - wire.y1) / length, (wire.z2 - wire.z1) / length];
  };
  const steps: [number, number][] = [];
  wires.forEach((a, i) => {
    wires.forEach((b, j) => {
      if (j <= i || Math.abs(a.radius - b.radius) <= 0.01 * Math.max(a.radius, b.radius)) return;
      const joined = ends(a).some((p) => ends(b).some((q) => p[0] === q[0] && p[1] === q[1] && p[2] === q[2]));
      if (!joined) return;
      const [u, v] = [direction(a), direction(b)];
      if (Math.abs(Math.abs(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) - 1) < 1e-6) steps.push([i + 1, j + 1]);
    });
  });
  return steps;
}

/** What the cards of the structure are made of. */
interface Structure {
  /** The cards of the wires, the ground and the source. */
  cards: string[];
  segments: number[];
  /**
   * The loads that hold something, each with the tag and the segment that it
   * sits in and the part of it that sits there: a load on the joint of two
   * wires has a half in each.
   */
  loads: { load: Load; tag: number; segment: number; share: number }[];
  marks: Marks | null;
  feeds: number[][];
  errors: string[];
  warnings: string[];
}

/**
 * The cards of the structure, the ground and the source. The segments are
 * chosen for the frequency of the model, also when a sweep follows.
 */
function structure(model: Model): Structure {
  const { sources, loads, frequency, ground } = model;
  const placed = placedWires(model);
  const overGround = ground.kind !== "free";
  const touches = (z: number): boolean => overGround && Math.abs(z) < ON_GROUND;
  const errors: string[] = [];
  const warnings: string[] = [];
  const result = (
    segments: number[] = [],
    cards: string[] = [],
    held: Structure["loads"] = [],
    marks: Marks | null = null,
    feeds: number[][] = [],
  ): Structure => ({ cards, segments, loads: held, marks, feeds, errors, warnings });
  // With one source the messages do not number it.
  const several = sources.length > 1;
  const sourceName = (index: number): string => (several ? `джерело ${index + 1}` : "джерело");
  const sourceTitle = (index: number): string => (several ? `Джерело ${index + 1}` : "Джерело");

  if (!(frequency > 0)) errors.push("Частота має бути більшою за нуль.");
  if (placed.length === 0) errors.push("У моделі немає жодного дроту.");
  if (sources.length === 0) errors.push("У моделі немає джерела.");
  sources.forEach(({ at }, index) => {
    if (at.wire >= placed.length) errors.push(`${sourceTitle(index)} стоїть на дроті ${at.wire + 1}, якого немає.`);
  });
  if (sources.length > 0 && sources.every((source) => source.voltage === 0)) {
    errors.push(several ? "Напруга всіх джерел дорівнює нулю: антену нічим не збуджено." : "Напруга джерела дорівнює нулю: антену нічим не збуджено.");
  }
  placed.forEach((wire, index) => {
    if (!(wireLength(wire) > 0)) errors.push(`Дріт ${index + 1} не має довжини.`);
    if (!(wire.radius > 0)) errors.push(`Радіус дроту ${index + 1} має бути більшим за нуль.`);
    if (overGround && (wire.z1 < -ON_GROUND || wire.z2 < -ON_GROUND)) errors.push(`Дріт ${index + 1} заходить під землю.`);
  });
  const lying = placed.flatMap((wire, index) => (touches(wire.z1) && touches(wire.z2) ? [index + 1] : []));
  if (lying.length > 0) {
    const which = lying.length === 1 ? `Дріт ${lying[0]} лежить` : `Дроти ${lying.join(", ")} лежать`;
    errors.push(`${which} на землі. Підніміть антену: поле «Додати висоту».`);
  }
  if (ground.kind === "real" && !(ground.permittivity > 0 || ground.conductivity > 0)) {
    errors.push("Реальній землі потрібна діелектрична проникність або провідність.");
  }
  loads.forEach((load, index) => {
    if (load.at.wire >= placed.length) errors.push(`Навантаження ${index + 1} стоїть на дроті ${load.at.wire + 1}, якого немає.`);
    if (load.kind === "lc" && (load.inductance < 0 || load.capacitance < 0 || load.q < 0)) {
      errors.push(`Навантаження ${index + 1}: L, C і Q не можуть бути від'ємними.`);
    }
  });
  if (model.wireConductivity < 0) errors.push("Провідність дротів не може бути від'ємною.");
  if (errors.length > 0) return result();
  const wires = joinEnds(placed);
  const steps = radiusSteps(wires);
  if (steps.length > 0) {
    const more = steps.length > 1 ? ` і ще ${steps.length - 1}` : "";
    warnings.push(
      `Труби різного діаметра стикуються на одній осі (дроти ${steps[0][0]} і ${steps[0][1]}${more}). NEC-2 на таких стиках неточний: резонанс елемента може зсунутися на відсотки. Поправки Лісона, якою це виправляє EZNEC, тут ще немає.`,
    );
  }

  // The sources and the loads, with the words that the messages use for them.
  const pulses = [
    ...sources.map(({ at }, index) => ({ at, name: sourceName(index), title: sourceTitle(index) })),
    ...loads.map((load, index) => ({ at: load.at, name: `навантаження ${index + 1}`, title: `Навантаження ${index + 1}` })),
  ];
  const lambda = wavelength(frequency);
  // The regular segments of every wire. The segments that the engine gets can be more: a load has short ones around it.
  const counts = wires.map((wire, index) =>
    segmentCount(wire, frequency, pulses.some(({ at }) => at.wire === index && at.place === "c")),
  );
  if (counts.reduce((sum, count) => sum + count, 0) > MAX_SEGMENTS) {
    errors.push(`Модель має ${counts.reduce((sum, count) => sum + count, 0)} сегм., а програма рахує щонайбільше ${MAX_SEGMENTS}.`);
    return result(counts);
  }
  wires.forEach((wire, index) => {
    const length = wireLength(wire) / counts[index];
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
  for (const { at, name, title } of pulses) {
    const count = counts[at.wire];
    const segment = pulseSegment(at, count);
    if (segment < 1 || segment > count) {
      errors.push(`${title} зсунуте за межі дроту ${at.wire + 1}: він має ${count} сегм.`);
    } else if (at.place === "c" && count % 2 === 0) {
      warnings.push(`Дріт ${at.wire + 1} має парну кількість сегментів: ${name} стоїть не точно в центрі.`);
    }
  }
  if (errors.length > 0) return result(counts);

  // The segments of the wires, and those that the sources and the loads sit in. Only a load asks for a short one.
  const { pieces, seats } = layout(
    wires,
    counts,
    pulses.map(({ at }, index) => ({ at, short: index >= sources.length })),
    lambda,
    (z) => ground.kind === "perfect" && touches(z),
  );
  const segments = pieces.map((ofWire) => ofWire.length);
  const total = segments.reduce((sum, count) => sum + count, 0);
  if (total > MAX_SEGMENTS) {
    errors.push(`Модель має ${total} сегм., а програма рахує щонайбільше ${MAX_SEGMENTS}.`);
    return result(segments);
  }
  // The engine keeps one source in a segment: a second one there would replace the first without a word.
  const taken = new Map<string, number>();
  const clashes = new Set<string>();
  seats.slice(0, sources.length).forEach((ofSource, index) => {
    for (const seat of ofSource) {
      const key = `${seat.wire} ${seat.segment}`;
      const other = taken.get(key);
      if (other !== undefined && other !== index) clashes.add(`Джерела ${other + 1} і ${index + 1} стоять в одному сегменті дроту ${seat.wire + 1}.`);
      taken.set(key, index);
    }
  });
  if (clashes.size > 0) {
    errors.push(...clashes);
    return result(segments);
  }
  const seated = loads.flatMap((load, index) => {
    if (load.kind === "lc" && load.inductance === 0 && load.capacitance === 0) {
      warnings.push(`Навантаження ${index + 1} не має ні котушки, ні конденсатора: воно нічого не змінює.`);
      return [];
    }
    const ofLoad = seats[sources.length + index];
    return ofLoad.map((seat) => ({ load, tag: seat.wire + 1, segment: seat.segment, share: 1 / ofLoad.length }));
  });

  // A point of a wire at a distance from its beginning. A wire end on the ground is joined to its image.
  const along = (index: number, distance: number): Point => {
    const wire = wires[index];
    const part = distance / wireLength(wire);
    const z = wire.z1 + (wire.z2 - wire.z1) * part;
    return [wire.x1 + (wire.x2 - wire.x1) * part, wire.y1 + (wire.y2 - wire.y1) * part, touches(z) ? 0 : z];
  };
  const onGround = wires.some((wire) => touches(wire.z1) || touches(wire.z2));
  const cards = [`CM ${model.name.replace(/\s+/g, " ").trim() || "antenna-modeler"}`, "CE"];
  wires.forEach((wire, index) => {
    // Segments of one length in a row make one card; the cards of a wire share its tag.
    const lengths = pieces[index];
    let [first, from] = [0, 0];
    while (first < lengths.length) {
      let last = first;
      while (last + 1 < lengths.length && Math.abs(lengths[last + 1] - lengths[first]) < 1e-9 * lengths[first]) last++;
      const run = lengths.slice(first, last + 1).reduce((sum, length) => sum + length, 0);
      const to = last + 1 === lengths.length ? wireLength(wire) : from + run;
      const ends = [...along(index, from), ...along(index, to)].map(number).join(" ");
      cards.push(`GW ${index + 1} ${last - first + 1} ${ends} ${number(wire.radius)}`);
      [first, from] = [last + 1, to];
    }
  });
  cards.push(`GE ${onGround ? 1 : 0}`);
  if (ground.kind === "perfect") cards.push("GN 1");
  if (ground.kind === "real") cards.push(`GN 2 0 0 0 ${number(ground.permittivity)} ${number(ground.conductivity)}`);
  // A source on the joint of two wires is two sources in series, half the voltage each.
  // A source without voltage is a plain segment, and the engine gets no card for it.
  sources.forEach((source, index) => {
    if (source.voltage === 0) return;
    const radians = (source.phase * Math.PI) / 180;
    const tidy = (value: number): number => (Math.abs(value) < 1e-12 * Math.abs(source.voltage) ? 0 : value);
    const [re, im] = [tidy(source.voltage * Math.cos(radians)), tidy(source.voltage * Math.sin(radians))];
    for (const seat of seats[index]) {
      const part = seat.sign / seats[index].length;
      cards.push(`EX 0 ${seat.wire + 1} ${seat.segment} 0 ${number(re * part)} ${number(im * part)}`);
    }
  });
  // The engine numbers its sources over the whole structure.
  const before = segments.map((_, index) => segments.slice(0, index).reduce((sum, count) => sum + count, 0));
  const feeds = seats.slice(0, sources.length).map((ofSource) => ofSource.map((seat) => before[seat.wire] + seat.segment));

  // Where the pulses are: in the middle of the segment, or on the joint.
  const places = pulses.map(({ at }, index): Point => {
    const ofPulse = seats[index];
    if (ofPulse.length > 1) return along(at.wire, at.place === "b" ? 0 : wireLength(wires[at.wire]));
    const { wire, segment } = ofPulse[0];
    const before = pieces[wire].slice(0, segment - 1).reduce((sum, length) => sum + length, 0);
    return along(wire, before + pieces[wire][segment - 1] / 2);
  });
  return result(segments, cards, seated, { sources: places.slice(0, sources.length), loads: places.slice(sources.length) }, feeds);
}

/**
 * The cards of the loss in the wires and of the loads at a frequency in MHz.
 * A group of these cards replaces the group before it.
 */
function loading(model: Model, { loads }: Structure, frequency: number): string[] {
  const cards: string[] = [];
  if (model.wireConductivity > 0) cards.push(`LD 5 0 0 0 ${number(model.wireConductivity)}`);
  for (const { load, tag, segment, share } of loads) {
    const impedance = loadImpedance(load, frequency);
    if (impedance) cards.push(`LD 4 ${tag} ${segment} ${segment} ${number(impedance[0] * share)} ${number(impedance[1] * share)}`);
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
  for (const { load, tag, segment, share } of loads) {
    const at = `${tag} ${segment} ${segment}`;
    if (load.kind === "rx") {
      cards.push(`LD 4 ${at} ${number(load.resistance * share)} ${number(load.reactance * share)}`);
      continue;
    }
    // A part of a load has that part of its coil and of its resistance, and a capacitor that much larger.
    const [henries, farads, q] = [load.inductance * 1e-6 * share, (load.capacitance * 1e-12) / share, load.q];
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

const finish = ({ cards, segments, marks, feeds, errors, warnings }: Structure, request: string[]): Deck => ({
  text: errors.length > 0 ? "" : [...cards, ...request, "EN"].join("\n") + "\n",
  segments,
  marks,
  feeds: errors.length > 0 ? [] : feeds,
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
