import { describe, expect, it } from "vitest";
import { buildDeck, buildSweepDeck, exportDeck } from "./deck";
import { equivalentCylinder } from "./leeson";
import { loadImpedance } from "./loads";
import { defaultModel, formatPulse, parsePulse, type Load, type Model, type Wire } from "./model";
import { segmentCount, wavelength } from "./segmentation";

const wire = (change: Partial<Wire> = {}): Wire => ({ ...defaultModel.wires[0], ...change });

describe("the source in the notation of MMANA", () => {
  it("is read and written", () => {
    expect(parsePulse("w1c")).toEqual({ wire: 0, place: "c" });
    expect(parsePulse(" W12e ")).toEqual({ wire: 11, place: "e" });
    expect(formatPulse({ wire: 2, place: "b" })).toBe("w3b");
  });

  it("can be some segments away from its place", () => {
    expect(parsePulse("w3c1")).toEqual({ wire: 2, place: "c", offset: 1 });
    expect(parsePulse("w2c-2")).toEqual({ wire: 1, place: "c", offset: -2 });
    expect(parsePulse("w5e3")).toEqual({ wire: 4, place: "e", offset: 3 });
    expect(formatPulse({ wire: 1, place: "c", offset: -2 })).toBe("w2c-2");
    expect(formatPulse({ wire: 0, place: "b", offset: 0 })).toBe("w1b");
  });

  it("is refused when it is something else", () => {
    for (const text of ["", "w0c", "w1", "1c", "w1x", "w1cc", "w1b-1", "w1c1.5"]) expect(parsePulse(text)).toBeNull();
  });
});

describe("automatic segmentation", () => {
  it("aims at forty segments for a wavelength", () => {
    const lambda = wavelength(14.15);
    expect(segmentCount(wire({ y1: 0, y2: lambda }), 14.15, false)).toBe(40);
    expect(segmentCount(wire({ y1: 0, y2: lambda / 1000 }), 14.15, false)).toBe(1);
  });

  it("gives a wire that is fed at its centre an odd number", () => {
    expect(segmentCount(wire(), 14.15, false)).toBe(20);
    expect(segmentCount(wire(), 14.15, true)).toBe(21);
  });

  it("keeps the number that the user gave", () => {
    expect(segmentCount(wire({ segments: 8 }), 14.15, true)).toBe(8);
  });
});

describe("the deck of a model", () => {
  it("has the cards of the example", () => {
    const deck = buildDeck(defaultModel);
    expect(deck.errors).toEqual([]);
    expect(deck.warnings).toEqual([]);
    expect(deck.segments).toEqual([21]);
    expect(deck.text.split("\n")).toEqual([
      "CM Диполь на 20 м",
      "CE",
      "GW 1 21 0 -5.18 10 0 5.18 10 0.001",
      "GE 0",
      "GN 2 0 0 0 13 0.005",
      "EX 0 1 11 0 1 0",
      "FR 0 1 0 0 14.15 0",
      "RP 0 46 72 1000 0 0 2 5",
      "EN",
      "",
    ]);
  });

  it("follows the ground and the place of the source", () => {
    const monopole: Model = {
      ...defaultModel,
      wires: [wire({ y1: 0, z1: 0, y2: 0, z2: 5 }), wire({ segments: 10 })],
      sources: [{ at: { wire: 0, place: "b" }, phase: 0, voltage: 1 }],
      ground: { ...defaultModel.ground, kind: "perfect" },
    };
    const cards = buildDeck(monopole).text.split("\n");
    expect(cards).toContain("GE 1");
    expect(cards).toContain("GN 1");
    expect(cards).toContain("EX 0 1 1 0 1 0");

    const free = buildDeck({ ...defaultModel, ground: { ...defaultModel.ground, kind: "free" }, sources: [{ at: { wire: 0, place: "e" }, phase: 0, voltage: 1 }] });
    expect(free.text).not.toContain("GN");
    expect(free.text).toContain("EX 0 1 20 0 1 0");
    expect(free.text).toContain("RP 0 37 72 1000 0 0 5 5");
  });

  it("moves the source by segments and refuses a move off the wire", () => {
    const at = (place: "b" | "c" | "e", offset: number) =>
      buildDeck({ ...defaultModel, sources: [{ at: { wire: 0, place, offset }, phase: 0, voltage: 1 }] });
    expect(at("c", 2).text).toContain("EX 0 1 13 0 1 0");
    expect(at("c", -3).text).toContain("EX 0 1 8 0 1 0");
    expect(at("b", 1).text).toContain("EX 0 1 2 0 1 0");
    // A wire that is not fed at its centre has twenty segments here.
    expect(at("e", 1).text).toContain("EX 0 1 19 0 1 0");
    expect(at("c", 11).errors.join(" ")).toMatch(/за межі дроту 1: він має 21 сегм/);
    expect(at("e", 21).text).toBe("");
  });

  it("names what is wrong with a model", () => {
    const broken: Model = {
      ...defaultModel,
      wires: [wire({ y1: 1, y2: 1, radius: 0 }), wire({ z1: -1 })],
      sources: [{ at: { wire: 2, place: "c" }, phase: 0, voltage: 1 }],
      frequency: 0,
    };
    const { errors, text } = buildDeck(broken);
    expect(text).toBe("");
    expect(errors).toHaveLength(5);
    expect(errors.join(" ")).toMatch(/Частота.*дроті 3.*Дріт 1 не має довжини.*Радіус дроту 1.*Дріт 2 заходить під землю/);
  });

  it("adds the height of the model to every wire over a ground", () => {
    const lifted = buildDeck({ ...defaultModel, wires: [wire({ z1: 0, z2: 0 })], height: 7.5 });
    expect(lifted.errors).toEqual([]);
    expect(lifted.text).toContain("GW 1 21 0 -5.18 7.5 0 5.18 7.5 0.001");
    const free = buildDeck({ ...defaultModel, height: 7.5, ground: { ...defaultModel.ground, kind: "free" } });
    expect(free.text).toContain("GW 1 21 0 -5.18 10 0 5.18 10 0.001");
    // A height that brings a wire end down to the ground joins it to the ground.
    const sloper = buildDeck({ ...defaultModel, wires: [wire({ z1: 0.3, z2: 5 })], height: -0.1 - 0.2 });
    expect(sloper.errors).toEqual([]);
    expect(sloper.text).toContain("GW 1 23 0 -5.18 0 0 5.18 4.7 0.001\nGE 1");
  });

  it("refuses wires that lie on the ground and warns about a wire that touches a real one", () => {
    const flat = (count: number) =>
      buildDeck({ ...defaultModel, wires: Array.from({ length: count }, () => wire({ z1: 0, z2: 0 })) });
    expect(flat(1).errors).toEqual(["Дріт 1 лежить на землі. Підніміть антену: поле «Додати висоту»."]);
    expect(flat(3).errors).toEqual(["Дроти 1, 2, 3 лежать на землі. Підніміть антену: поле «Додати висоту»."]);
    const free = buildDeck({ ...defaultModel, wires: [wire({ z1: 0, z2: 0 })], ground: { ...defaultModel.ground, kind: "free" } });
    expect(free.errors).toEqual([]);

    const vertical: Model = { ...defaultModel, wires: [wire({ y1: 0, z1: 0, y2: 0, z2: 5 })], sources: [{ at: { wire: 0, place: "b" }, phase: 0, voltage: 1 }] };
    expect(buildDeck(vertical).warnings).toEqual(["Дріт 1 торкається реальної землі: таке заземлення NEC-2 рахує неточно."]);
    expect(buildDeck({ ...vertical, ground: { ...vertical.ground, kind: "perfect" } }).warnings).toEqual([]);
  });

  it("refuses a model with more segments than the engine of the page solves", () => {
    const large = buildDeck({ ...defaultModel, wires: [wire({ segments: 2999 }), wire({ x1: 1, x2: 1, segments: 2 })] });
    expect(large.errors).toEqual(["Модель має 3001 сегм., а програма рахує щонайбільше 3000."]);
    expect(large.text).toBe("");
    expect(large.segments).toEqual([2999, 2]);
  });

  it("for a sweep keeps the structure and asks for the frequencies without patterns", () => {
    const sweep = buildSweepDeck(defaultModel);
    expect(sweep.errors).toEqual([]);
    const cards = sweep.text.split("\n");
    expect(cards.slice(0, 6)).toEqual(buildDeck(defaultModel).text.split("\n").slice(0, 6));
    expect(cards.slice(6)).toEqual(["PT -1", "FR 0 23 0 0 13.6 0.05", "XQ 0", "EN", ""]);
  });

  it("refuses a sweep without a range", () => {
    const sweep = (change: Partial<Model["sweep"]>) =>
      buildSweepDeck({ ...defaultModel, sweep: { ...defaultModel.sweep, ...change } });
    expect(sweep({ to: 13.6 }).errors.join(" ")).toMatch(/Кінець розгортки/);
    expect(sweep({ from: 0 }).errors.join(" ")).toMatch(/Початок розгортки/);
    for (const points of [1, 202, 2.5]) expect(sweep({ points }).errors.join(" ")).toMatch(/від 2 до 201 точок/);
    expect(sweep({ points: 1 }).text).toBe("");
  });

  it("warns about segments that are too long, too short or leave the source off centre", () => {
    const coarse = buildDeck({ ...defaultModel, wires: [wire({ segments: 2 })] });
    expect(coarse.warnings).toHaveLength(2);
    expect(coarse.warnings[0]).toMatch(/довші за десяту частину хвилі/);
    expect(coarse.warnings[1]).toMatch(/парну кількість сегментів/);
    const thick = buildDeck({ ...defaultModel, wires: [wire({ radius: 0.1 })] });
    expect(thick.warnings.join(" ")).toMatch(/коротші за вісім радіусів/);
  });
});

describe("the loads of a model", () => {
  // The reactance in ohms of a coil in microhenries at a frequency in MHz, as a card holds it.
  const coilOhms = (frequency: number, microhenries: number): number =>
    Number((2 * Math.PI * frequency * microhenries).toPrecision(10));
  const coil: Load = { kind: "lc", at: { wire: 0, place: "c", offset: 3 }, inductance: 10, capacitance: 0, q: 0 };
  const resistor: Load = { kind: "rx", at: { wire: 0, place: "b" }, resistance: 50, reactance: -20 };
  const cards = (deck: { text: string }): string[] => deck.text.split("\n");
  const loadCards = (deck: { text: string }): string[] => cards(deck).filter((card) => card.startsWith("LD"));
  /** The segment of the first card of a load of the given type. */
  const seat = (deck: { text: string }, type: number): number => Number(loadCards(deck).find((card) => card.startsWith(`LD ${type} 1`))!.split(" ")[3]);

  it("become impedances at the frequency of the model, after the loss of the wires", () => {
    const deck = buildDeck({ ...defaultModel, wireConductivity: 5.8e7, loads: [coil, resistor] });
    expect(deck.errors).toEqual([]);
    const coilSeat = seat(deck, 4);
    expect(loadCards(deck)).toEqual(["LD 5 0 0 0 58000000", `LD 4 1 ${coilSeat} ${coilSeat} 0 ${coilOhms(14.15, 10)}`, "LD 4 1 1 1 50 -20"]);
    // The loads come after the source and before the frequency.
    const all = cards(deck);
    expect(all.indexOf("LD 5 0 0 0 58000000")).toBe(all.findIndex((card) => card.startsWith("EX")) + 1);
    expect(all[all.indexOf("LD 4 1 1 1 50 -20") + 1]).toBe("FR 0 1 0 0 14.15 0");
  });

  it("sit in a short segment in the middle of their place, with equal segments beside it", () => {
    const centre: Load = { ...coil, at: { wire: 0, place: "c" } };
    const deck = buildDeck({ ...defaultModel, sources: [{ at: { wire: 0, place: "b" }, phase: 0, voltage: 1 }], loads: [centre] });
    // The wire is cut in several cards with one tag: the regular ends, then shorter and shorter segments.
    const wires = cards(deck).filter((card) => card.startsWith("GW"));
    expect(wires.length).toBeGreaterThan(3);
    expect(wires.every((card) => card.startsWith("GW 1 "))).toBe(true);
    expect(deck.segments[0]).toBe(wires.reduce((total, card) => total + Number(card.split(" ")[2]), 0));
    // The load sits exactly at the centre of the wire.
    deck.marks!.loads[0].forEach((value, axis) => expect(value).toBeCloseTo([0, 0, 10][axis], 12));
    // A load in the segment of the source shares it: that segment stays regular.
    const shared = buildDeck({ ...defaultModel, loads: [centre] });
    expect(cards(shared).filter((card) => card.startsWith("GW"))).toEqual(["GW 1 21 0 -5.18 10 0 5.18 10 0.001"]);
    expect(seat(shared, 4)).toBe(11);
    // Without loads the wire is one card of regular segments.
    expect(cards(buildDeck(defaultModel)).filter((card) => card.startsWith("GW"))).toEqual(["GW 1 21 0 -5.18 10 0 5.18 10 0.001"]);
  });

  it("are written again for every frequency of a sweep when they depend on it", () => {
    const sweep = { from: 14, to: 14.2, points: 3 };
    const model = { ...defaultModel, sweep, loads: [coil] };
    const at = seat(buildDeck(model), 4);
    const stepped = buildSweepDeck(model);
    const request = cards(stepped).slice(cards(stepped).indexOf("PT -1"));
    expect(request).toEqual([
      "PT -1",
      `LD 4 1 ${at} ${at} 0 ${coilOhms(14, 10)}`,
      "FR 0 1 0 0 14 0",
      "XQ 0",
      `LD 4 1 ${at} ${at} 0 ${coilOhms(14.1, 10)}`,
      "FR 0 1 0 0 14.1 0",
      "XQ 0",
      `LD 4 1 ${at} ${at} 0 ${coilOhms(14.2, 10)}`,
      "FR 0 1 0 0 14.2 0",
      "XQ 0",
      "EN",
      "",
    ]);
    // A fixed impedance and the loss of the wires are the same cards at every frequency.
    const fixed = buildSweepDeck({ ...defaultModel, sweep, wireConductivity: 3.5e7, loads: [resistor] });
    expect(cards(fixed).slice(cards(fixed).indexOf("PT -1"))).toEqual([
      "PT -1",
      "LD 5 0 0 0 35000000",
      "LD 4 1 1 1 50 -20",
      "FR 0 3 0 0 14 0.1",
      "XQ 0",
      "EN",
      "",
    ]);
  });

  it("are coils and capacitors in the deck for other programs, in the same segments", () => {
    const loads: Load[] = [
      { ...coil, q: 200 },
      { kind: "lc", at: { wire: 0, place: "e", offset: 1 }, inductance: 0, capacitance: 50, q: 0 },
      { kind: "lc", at: { wire: 0, place: "c", offset: -3 }, inductance: 10, capacitance: 50, q: 0 },
      resistor,
    ];
    const model = { ...defaultModel, loads };
    const portable = exportDeck(model);
    expect(portable.errors).toEqual([]);
    const segments = loadCards(buildDeck(model)).map((card) => card.split(" ").slice(3, 5).join(" "));
    expect(loadCards(portable)).toEqual([
      `LD 0 1 ${segments[0]} ${Number((coilOhms(14.15, 10) / 200).toPrecision(10))} 0.00001 0`,
      `LD 0 1 ${segments[1]} 0 0 5e-11`,
      `LD 1 1 ${segments[2]} 0 0.00001 5e-11`,
      "LD 4 1 1 1 50 -20",
    ]);
    // Everything else is the deck of the page.
    const rest = (deck: { text: string }) => cards(deck).filter((card) => !card.startsWith("LD"));
    expect(rest(portable)).toEqual(rest(buildDeck(model)));
  });

  it("on the joint of two wires are halves in the two segments that meet there", () => {
    const trap: Load = { kind: "lc", at: { wire: 1, place: "b" }, inductance: 10, capacitance: 50, q: 0 };
    const model: Model = {
      ...defaultModel,
      wires: [wire({ y1: -5, y2: 5 }), wire({ y1: 5, y2: 8 })],
      loads: [trap, { kind: "rx", at: { wire: 1, place: "b" }, resistance: 10, reactance: 4 }],
    };
    const deck = buildDeck(model);
    expect(deck.errors).toEqual([]);
    const [first, second] = [deck.segments[0], 1];
    const impedance = loadImpedance(trap, 14.15)!.map((part) => Number((part / 2).toPrecision(10)));
    expect(loadCards(deck)).toEqual([
      `LD 4 2 ${second} ${second} ${impedance[0]} ${impedance[1]}`,
      `LD 4 1 ${first} ${first} ${impedance[0]} ${impedance[1]}`,
      "LD 4 2 1 1 5 2",
      `LD 4 1 ${first} ${first} 5 2`,
    ]);
    // A half of a trap is a trap with half the coil and twice the capacitor.
    expect(loadCards(exportDeck(model)).slice(0, 2)).toEqual([`LD 1 2 1 1 0 0.000005 1e-10`, `LD 1 1 ${first} ${first} 0 0.000005 1e-10`]);
    expect(deck.marks!.loads).toEqual([[0, 5, 10], [0, 5, 10]]);
  });

  it("are refused or warned about when they make no sense", () => {
    const at = (load: Load) => buildDeck({ ...defaultModel, loads: [load] });
    expect(at({ ...coil, at: { wire: 3, place: "c" } }).errors).toEqual(["Навантаження 1 стоїть на дроті 4, якого немає."]);
    expect(at({ ...coil, inductance: -1 }).errors).toEqual(["Навантаження 1: L, C і Q не можуть бути від'ємними."]);
    expect(at({ ...coil, at: { wire: 0, place: "e", offset: 30 } }).errors).toEqual([
      "Навантаження 1 зсунуте за межі дроту 1: він має 21 сегм.",
    ]);
    const empty = at({ ...coil, inductance: 0 });
    expect(empty.warnings).toEqual(["Навантаження 1 не має ні котушки, ні конденсатора: воно нічого не змінює."]);
    expect(empty.text).not.toContain("LD");
    const even = buildDeck({ ...defaultModel, wires: [wire({ segments: 20 })], sources: [{ at: { wire: 0, place: "b" }, phase: 0, voltage: 1 }], loads: [{ ...coil, at: { wire: 0, place: "c" } }] });
    expect(even.warnings).toEqual(["Дріт 1 має парну кількість сегментів: навантаження 1 стоїть не точно в центрі."]);
    expect(buildDeck({ ...defaultModel, wireConductivity: -1 }).errors).toEqual(["Провідність дротів не може бути від'ємною."]);
  });
});

describe("the source on the joint of two wires", () => {
  it("is two sources in series, half the voltage each, in the direction of the first wire", () => {
    const half = (y1: number, y2: number) => wire({ y1, y2 });
    const along: Model = { ...defaultModel, wires: [half(-5.18, 0), half(0, 5.18)], sources: [{ at: { wire: 0, place: "e" }, phase: 0, voltage: 1 }] };
    const sources = (model: Model) => buildDeck(model).text.split("\n").filter((card) => card.startsWith("EX"));
    const [left] = buildDeck(along).segments;
    expect(sources(along)).toEqual([`EX 0 1 ${left} 0 0.5 0`, "EX 0 2 1 0 0.5 0"]);
    // The second wire points back to the joint: its half goes the other way.
    const against: Model = { ...along, wires: [half(-5.18, 0), half(5.18, 0)] };
    const [, right] = buildDeck(against).segments;
    expect(sources(against)).toEqual([`EX 0 1 ${left} 0 0.5 0`, `EX 0 2 ${right} 0 -0.5 0`]);
    expect(buildDeck(along).marks!.sources).toEqual([[0, 0, 10]]);
  });
});

describe("several sources", () => {
  // Two elements fed as HB9CV: the second 135 degrees ahead in phase.
  const beam: Model = {
    ...defaultModel,
    wires: [wire({ y1: -4.945, y2: 4.945 }), wire({ x1: -2.65, x2: -2.65, y1: -5.31, y2: 5.31 })],
    sources: [
      { at: { wire: 0, place: "c" }, phase: 0, voltage: 0.5 },
      { at: { wire: 1, place: "c" }, phase: 135, voltage: 0.5 },
    ],
  };
  const sources = (deck: { text: string }) => deck.text.split("\n").filter((card) => card.startsWith("EX"));

  it("are cards with the voltage as real and imaginary parts, and the engine numbers them over the structure", () => {
    const deck = buildDeck(beam);
    expect(deck.errors).toEqual([]);
    const [first, second] = deck.segments;
    const [centre1, centre2] = [(first + 1) / 2, (second + 1) / 2];
    expect(sources(deck)).toEqual([`EX 0 1 ${centre1} 0 0.5 0`, `EX 0 2 ${centre2} 0 -0.3535533906 0.3535533906`]);
    expect(deck.feeds).toEqual([[centre1], [first + centre2]]);
    expect(deck.marks!.sources).toHaveLength(2);
  });

  it("leave out the card of a source without voltage, which is then a plain segment", () => {
    const idle = buildDeck({ ...beam, sources: [beam.sources[0], { ...beam.sources[1], voltage: 0 }] });
    expect(sources(idle)).toHaveLength(1);
    expect(idle.feeds).toHaveLength(2);
  });

  it("on a joint keep their phase in both halves", () => {
    const half = (y1: number, y2: number) => wire({ y1, y2 });
    const deck = buildDeck({
      ...defaultModel,
      wires: [half(-5.18, 0), half(0, 5.18)],
      sources: [{ at: { wire: 0, place: "e" }, phase: 90, voltage: 1 }],
    });
    expect(sources(deck)).toEqual([`EX 0 1 ${deck.segments[0]} 0 0 0.5`, "EX 0 2 1 0 0 0.5"]);
    expect(deck.feeds).toEqual([[deck.segments[0], deck.segments[0] + 1]]);
  });

  it("are refused with a reason when they cannot be computed", () => {
    expect(buildDeck({ ...defaultModel, sources: [] }).errors).toEqual(["У моделі немає джерела."]);
    expect(buildDeck({ ...defaultModel, sources: [{ ...defaultModel.sources[0], voltage: 0 }] }).errors).toEqual([
      "Напруга джерела дорівнює нулю: антену нічим не збуджено.",
    ]);
    const silent = beam.sources.map((source) => ({ ...source, voltage: 0 }));
    expect(buildDeck({ ...beam, sources: silent }).errors).toEqual(["Напруга всіх джерел дорівнює нулю: антену нічим не збуджено."]);
    // Several sources are named by their number.
    const far = buildDeck({ ...beam, sources: [beam.sources[0], { ...beam.sources[1], at: { wire: 4, place: "c" } }] });
    expect(far.errors).toEqual(["Джерело 2 стоїть на дроті 5, якого немає."]);
    const off = buildDeck({ ...beam, sources: [beam.sources[0], { ...beam.sources[1], at: { wire: 0, place: "e", offset: 40 } }] });
    expect(off.errors).toEqual([`Джерело 2 зсунуте за межі дроту 1: він має ${buildDeck(beam).segments[0]} сегм.`]);
    // The engine keeps one source in a segment.
    const twice = buildDeck({ ...beam, sources: [beam.sources[0], { ...beam.sources[1], at: { wire: 0, place: "c" } }] });
    expect(twice.errors).toEqual(["Джерела 1 і 2 стоять в одному сегменті дроту 1."]);
    expect(twice.text).toBe("");
    expect(twice.feeds).toEqual([]);
  });
});

describe("tubes of different radii in one line", () => {
  const tube = (y1: number, y2: number, radius: number) => wire({ y1, y2, radius });
  const fed = (at: Model["sources"][number]["at"]) => [{ at, phase: 0, voltage: 1 }];
  // A dipole of three tubes, fed in the middle of its centre tube, half a wavelength long at 14.15 MHz.
  const tapered: Model = { ...defaultModel, wires: [tube(-5.18, -1, 0.01), tube(-1, 1, 0.015), tube(1, 5.18, 0.01)], sources: fed({ wire: 1, place: "c" }) };
  const cards = (deck: { text: string }, kind: string) => deck.text.split("\n").filter((card) => card.startsWith(`${kind} `));
  const step = (words: string) =>
    `Труби різного діаметра стикуються на одній осі (дроти 1 і 2${words}). NEC-2 на таких стиках неточний: резонанс елемента може зсунутися на відсотки.`;

  it("become Leeson's equivalent cylinder, one wire around the same centre", () => {
    const deck = buildDeck(tapered);
    expect(deck.errors).toEqual([]);
    expect(deck.warnings).toEqual([]);
    const cylinder = equivalentCylinder([{ length: 1, radius: 0.015 }, { length: 4.18, radius: 0.01 }])!;
    expect(deck.equivalents).toHaveLength(1);
    const [equivalent] = deck.equivalents;
    expect(equivalent.wires).toEqual([0, 1, 2]);
    expect(equivalent.length).toBeCloseTo(2 * cylinder.halfLength, 9);
    expect(equivalent.radius).toBeCloseTo(cylinder.radius, 12);
    // The wire is named after the centre tube; the tubes have no segments of their own.
    const [card] = cards(deck, "GW");
    expect(cards(deck, "GW")).toHaveLength(1);
    const [, tag, count, x1, y1, z1, x2, y2, z2, radius] = card.split(" ").map(Number);
    expect([tag, count]).toEqual([2, equivalent.segments]);
    expect(count % 2).toBe(1);
    expect([x1, z1, x2, z2]).toEqual([0, 10, 0, 10]);
    expect(y1).toBeCloseTo(-cylinder.halfLength, 9);
    expect(y2).toBeCloseTo(cylinder.halfLength, 9);
    expect(radius).toBeCloseTo(cylinder.radius, 9);
    expect(deck.segments).toEqual([0, 0, 0]);
    // The source stays in the centre.
    expect(cards(deck, "EX")).toEqual([`EX 0 2 ${(count + 1) / 2} 0 1 0`]);
    expect(deck.feeds).toEqual([[(count + 1) / 2]]);
    deck.marks!.sources[0].forEach((value, i) => expect(value).toBeCloseTo([0, 0, 10][i], 9));
    // The deck says what it did, also to other programs; the sweep gets the same wire.
    const tidy = (value: number) => Number(value.toPrecision(10));
    expect(cards(deck, "CM")[1]).toBe(`CM Leeson equivalent of wires 1-3: length ${tidy(equivalent.length)} m, radius ${tidy(equivalent.radius)} m`);
    expect(cards(exportDeck(tapered), "CM")[1]).toBe(cards(deck, "CM")[1]);
    expect(cards(buildSweepDeck(tapered), "GW")).toEqual([card]);
  });

  it("are fed on the joint in the middle of a centre tube of two wires", () => {
    const split: Model = {
      ...tapered,
      wires: [tube(-5.18, -1, 0.01), tube(-1, 0, 0.015), tube(0, 1, 0.015), tube(1, 5.18, 0.01)],
      sources: fed({ wire: 1, place: "e" }),
    };
    const deck = buildDeck(split);
    expect(deck.warnings).toEqual([]);
    expect(deck.equivalents.map((one) => one.wires)).toEqual([[0, 1, 2, 3]]);
    // The same element as before, under the number of a wire of its centre tube.
    const [card] = cards(deck, "GW");
    expect(card.split(" ").slice(2)).toEqual(cards(buildDeck(tapered), "GW")[0].split(" ").slice(2));
    expect(card.split(" ")[1]).toBe("3");
    expect(cards(deck, "EX")).toHaveLength(1);
  });

  it("keep their tubes and a warning when the correction is off", () => {
    const deck = buildDeck({ ...tapered, taperCorrection: false });
    expect(deck.equivalents).toEqual([]);
    expect(cards(deck, "GW").map((card) => card.split(" ")[1])).toEqual(["1", "2", "3"]);
    expect(deck.warnings).toEqual([`${step(" і ще 1")} Поправку Лісона, яка це виправляє, вимкнено.`]);
  });

  it("keep their tubes where the method does not hold, and say why", () => {
    const why = (model: Model): string[] => {
      const deck = buildDeck(model);
      expect(deck.equivalents).toEqual([]);
      return deck.warnings;
    };
    const left = (reason: string) =>
      `Елемент з дротів 1–3: поправку Лісона не застосовано, бо ${reason}. NEC-2 на стиках труб неточний: резонанс елемента може зсунутися на відсотки.`;
    expect(why({ ...tapered, loads: [{ kind: "rx", at: { wire: 0, place: "c" }, resistance: 10, reactance: 0 }] })).toEqual([
      left("на ньому стоїть навантаження"),
    ]);
    expect(why({ ...tapered, sources: fed({ wire: 1, place: "c", offset: 1 }) })).toEqual([left("джерело стоїть не в центрі елемента")]);
    expect(why({ ...tapered, sources: fed({ wire: 0, place: "c" }) })).toEqual([left("джерело стоїть не в центрі елемента")]);
    // A wire joined at a step between the tubes: a match, a feed line, a boom.
    expect(why({ ...tapered, wires: [...tapered.wires, wire({ y1: -1, y2: -1, z1: 10, z2: 9 })] })).toEqual([left("до нього приєднано інші дроти")]);
    // Far from resonance the method does not hold.
    const short = tapered.wires.map((one) => ({ ...one, y1: one.y1 / 2, y2: one.y2 / 2 }));
    expect(why({ ...tapered, wires: short })).toEqual([left("його довжина 0,24 λ: поправка розрахована на елементи довжиною 0,4–0,6 λ")]);
  });

  it("are warned about where no element of the method is", () => {
    // Two tubes that differ from side to side.
    const lopsided = buildDeck({ ...defaultModel, wires: [tube(-5.18, 0, 0.01), tube(0, 5.18, 0.015)] });
    expect(lopsided.equivalents).toEqual([]);
    expect(lopsided.warnings).toEqual([`${step("")} Поправка Лісона діє лише на прямі елементи, симетричні щодо центру.`]);
    // One radius, or a bend, is no step.
    const even = buildDeck({ ...defaultModel, wires: [tube(-5.18, 0, 0.001), tube(0, 5.18, 0.001)] });
    expect(even.warnings).toEqual([]);
    expect(even.equivalents).toEqual([]);
    const bent = buildDeck({ ...defaultModel, wires: [tube(-5.18, 0, 0.001), wire({ y1: 0, y2: 0, z1: 10, z2: 15, radius: 0.01 })] });
    expect(bent.warnings).toEqual([]);
  });
});
