import { describe, expect, it } from "vitest";
import { buildDeck } from "./deck";
import { exportMaa, importMaa } from "./maa";
import { ALUMINIUM, COPPER, defaultModel, type Model } from "./model";

// Files in the layout that MMANA writes: fields separated by a comma and a tab.
const yagi = [
  "Three elements for 2 m",
  "*",
  "145.0",
  "***Wires***",
  "3",
  "-0.41,\t-0.52,\t0.0,\t-0.41,\t0.52,\t0.0,\t0.003,\t-1",
  "0.0,\t-0.49,\t0.0,\t0.0,\t0.49,\t0.0,\t0.003,\t-1",
  "0.31,\t-0.457,\t0.0,\t0.31,\t0.457,\t0.0,\t0.003,\t21",
  "***Source***",
  "1,\t0",
  "w2c,\t0.0,\t1.0",
  "***Load***",
  "0,\t1",
  "***Segmentation***",
  "800,\t80,\t2.0,\t2",
  "***G/H/M/R/AzEl/X***",
  "0,\t5.0,\t1,\t50.0,\t120,\t60,\t0.0",
  "",
].join("\r\n");

const mixed = [
  "Low dipole with extras",
  "*",
  "7.05",
  "***Wires***",
  "4",
  "0.0,\t-10.0,\t0.0,\t0.0,\t10.0,\t0.0,\t8.0e-04,\t-1",
  "0.0,\t-10.0,\t0.0,\t0.0,\t-12.0,\t-1.0,\t0.0,\t-1",
  "0.0,\t10.0,\t0.0,\t0.0,\t12.0,\t-1.0,\t-1.0,\t0",
  "0.0,\t0.0,\t0.0,\t0.0,\t0.0,\t-3.0,\t8.0e-04,\t-2",
  "***Source***",
  "2,\t1",
  "w4b2,\t0.0,\t1.0",
  "w1c,\t90.0,\t1.0",
  "***Load***",
  "1,\t1",
  "w1c,\t0,\t0.03,\t0.0,\t0.0",
  "***Segmentation***",
  "400,\t40,\t2.0,\t1",
  "***G/H/M/R/AzEl/X***",
  "2,\t12.0,\t1,\t75.0,\t120,\t60,\t0.0",
  "### Comment ###",
  "anything",
].join("\n");

describe("an antenna file of MMANA", () => {
  it("gives the wires, the source, the frequency and the line", () => {
    const { model, notes } = importMaa(yagi, defaultModel);
    expect(model.name).toBe("Three elements for 2 m");
    expect(notes).toEqual(["Матеріал дротів у файлі має код 1: узято мідь."]);
    expect(model.wireConductivity).toBe(COPPER);
    expect(model.loads).toEqual([]);
    expect(model.frequency).toBe(145);
    expect(model.reference).toBe(50);
    expect(model.source).toEqual({ wire: 1, place: "c" });
    // Free space: the height of the file does not apply yet, and the ground of the page is kept for later.
    expect(model.ground).toEqual({ ...defaultModel.ground, kind: "free" });
    expect(model.height).toBe(5);
    expect(model.wires).toHaveLength(3);
    expect(model.wires[0]).toEqual({ x1: -0.41, y1: -0.52, z1: 0, x2: -0.41, y2: 0.52, z2: 0, radius: 0.003, segments: -1 });
    expect(model.wires[2].segments).toBe(21);
    // The sweep follows the frequency.
    expect(model.sweep).toEqual({ from: 139.4, to: 150.6, points: 23 });
    expect(buildDeck(model).errors).toEqual([]);
  });

  it("keeps the height over a ground and says what it leaves out", () => {
    const { model, notes } = importMaa(mixed, defaultModel);
    expect(model.ground).toEqual({ kind: "real", permittivity: 13, conductivity: 0.005 });
    expect(model.reference).toBe(75);
    // The wire without a radius is an insulator and is left out; the others stand 12 m higher.
    expect(model.wires).toHaveLength(3);
    expect(model.wires.map((wire) => [wire.z1, wire.z2])).toEqual([[0, 0], [0, -1], [0, -3]]);
    expect(model.height).toBe(12);
    expect(buildDeck(model).text).toContain("GW 3 3 0 0 12 0 0 9 0.0008");
    expect(model.wires[1].radius).toBe(0.001);
    expect(model.wires.map((wire) => wire.segments)).toEqual([-1, -1, -1]);
    // The source was on wire 4 of the file, which is now wire 3.
    expect(model.source).toEqual({ wire: 2, place: "b", offset: 2 });
    // The coil of the file sits at the centre of wire 1.
    expect(model.loads).toEqual([{ kind: "lc", at: { wire: 0, place: "c" }, inductance: 0.03, capacitance: 0, q: 0 }]);
    expect(notes).toHaveLength(5);
    expect(notes.join(" ")).toMatch(/Дріт 2 має радіус 0.*Дріт 3 складено з труб різного радіуса.*2 джерел.*середню землю.*код 1: узято мідь/);
    expect(buildDeck(model).errors).toEqual([]);
  });

  it("gives the loads of every kind that the program has", () => {
    const loaded = yagi
      .replace("0,\t1\r\n***Segmentation***", [
        "4,\t0",
        "w1c,\t0,\t3.3,\t0.0,\t250.0",
        "w2c-2,\t0,\t10.0,\t50.0,\t100.0",
        "w3e1,\t1,\t50.0,\t-12.5",
        "w3b,\t2,\t1.0,\t0.0,\t2.0e-11,\t0.0",
        "***Segmentation***",
      ].join("\r\n"))
      .replace("0,\t5.0,\t1,\t50.0", "1,\t5.0,\t4,\t50.0");
    const { model, notes } = importMaa(loaded, defaultModel);
    expect(model.loads).toEqual([
      { kind: "lc", at: { wire: 0, place: "c" }, inductance: 3.3, capacitance: 0, q: 250 },
      { kind: "lc", at: { wire: 1, place: "c", offset: -2 }, inductance: 10, capacitance: 50, q: 100 },
      { kind: "rx", at: { wire: 2, place: "e", offset: 1 }, resistance: 50, reactance: -12.5 },
    ]);
    expect(model.wireConductivity).toBe(ALUMINIUM);
    expect(model.ground.kind).toBe("perfect");
    expect(notes).toEqual([
      "Навантаження 4 (w3b) задане многочленом: такі ще не підтримуються, його пропущено.",
      "У файлі навантаження позначені вимкненими. Тут вони працюють: вилучіть зайві.",
      "Матеріал дротів у файлі має код 4: узято алюміній.",
    ]);
    expect(buildDeck(model).errors).toEqual([]);
  });

  it("tells the materials that it does not know or cannot model in full", () => {
    const material = (code: number) => importMaa(yagi.replace("0,\t5.0,\t1,\t50.0", `0,\t5.0,\t${code},\t50.0`), defaultModel);
    expect(material(0)).toMatchObject({ model: { wireConductivity: 0 }, notes: [] });
    expect(material(5).model.wireConductivity).toBe(1e7);
    expect(material(5).notes.join(" ")).toMatch(/залізо.*без магнітних властивостей/);
    expect(material(9)).toMatchObject({ model: { wireConductivity: 0 }, notes: ["Невідомий матеріал дротів у файлі (код 9): узято дроти без втрат."] });
  });

  it("is refused with a reason when it is something else or damaged", () => {
    expect(() => importMaa("CM a deck of NEC cards\nCE\nEN\n", defaultModel)).toThrow(/Це не файл антени MMANA/);
    expect(() => importMaa("Name\n*\nnot a frequency\n***Wires***\n", defaultModel)).toThrow(/частоту: «not a frequency»/);
    expect(() => importMaa("Name\n*\n14.1\n1\n0, 0, 0, 0, 0, 1, 0.001, -1\n", defaultModel)).toThrow(/Це не файл антени MMANA/);
    expect(() => importMaa(yagi.replace("145.0", "abc"), defaultModel)).toThrow(/частоту/);
    expect(() => importMaa(yagi.replace("0.003,\t21", "0.003"), defaultModel)).toThrow(/дріт 3/);
    expect(() => importMaa(yagi.replace("w2c", "w7c"), defaultModel)).toThrow(/джерело: «w7c»/);
    expect(() => importMaa(yagi.replace("0,\t5.0,\t1,\t50.0", "9,\t5.0,\t1,\t50.0"), defaultModel)).toThrow(/тип землі/);
    expect(() => importMaa(mixed.replace("w1c,\t0,\t0.03", "w9c,\t0,\t0.03"), defaultModel)).toThrow(/навантаження 1: «w9c/);
    expect(() => importMaa(mixed.replace("0.03,\t0.0,\t0.0", "0.03,\t,\t0.0"), defaultModel)).toThrow(/навантаження 1/);
  });
});

describe("a model written as a file of MMANA", () => {
  const model: Model = {
    ...defaultModel,
    name: "Трап-диполь  40/20",
    wires: [
      { x1: 0, y1: -10.2, z1: 0, x2: 0, y2: 10.2, z2: 0, radius: 0.0008, segments: -1 },
      { x1: 0, y1: 10.2, z1: 0, x2: 0, y2: 10.2, z2: -1.5, radius: 0.0008, segments: 7 },
    ],
    source: { wire: 0, place: "c" },
    loads: [
      { kind: "lc", at: { wire: 0, place: "c", offset: 6 }, inductance: 10, capacitance: 50, q: 150 },
      { kind: "rx", at: { wire: 1, place: "e" }, resistance: 470, reactance: -3.5 },
    ],
    frequency: 7.05,
    height: 12,
    wireConductivity: COPPER,
    reference: 75,
    sweep: { from: 6.9, to: 7.2, points: 31 },
  };

  it("has the lines of such a file", () => {
    const { text, notes } = exportMaa(model);
    expect(notes).toEqual(["Параметри реальної землі у файлі MMANA не зберігаються."]);
    expect(text.split("\r\n")).toEqual([
      "Трап-диполь 40/20",
      "*",
      "7.05",
      "***Wires***",
      "2",
      "0.0,\t-10.2,\t0.0,\t0.0,\t10.2,\t0.0,\t0.0008,\t-1",
      "0.0,\t10.2,\t0.0,\t0.0,\t10.2,\t-1.5,\t0.0008,\t7",
      "*** Source ***",
      "1,\t1",
      "w1c,\t0.0,\t1.0",
      "*** Load ***",
      "2,\t1",
      "w1c6,\t0,\t10.0,\t50.0,\t150.0",
      "w2e,\t1,\t470.0,\t-3.5",
      "*** Segmentation ***",
      "400,\t40,\t2.0,\t1",
      "*** G/H/M/R/AzEl/X ***",
      "2,\t12.0,\t1,\t75.0,\t120,\t60,\t0.0",
      "",
    ]);
  });

  it("comes back the same when it is read", () => {
    const back = importMaa(exportMaa(model).text, model).model;
    expect(back).toEqual({ ...model, name: "Трап-диполь 40/20" });
    const free: Model = { ...model, ground: { ...model.ground, kind: "free" }, wireConductivity: 0, loads: [] };
    expect(exportMaa(free).notes).toEqual([]);
    expect(importMaa(exportMaa(free).text, free)).toEqual({ model: { ...free, name: "Трап-диполь 40/20" }, notes: [] });
  });

  it("names the nearest material for a conductivity of the user", () => {
    const { text, notes } = exportMaa({ ...model, wireConductivity: 3.0e7, ground: { ...model.ground, kind: "perfect" } });
    expect(text).toContain("1,\t12.0,\t3,\t75.0");
    expect(notes).toEqual(["Файл MMANA знає лише готові матеріали: замість вашої провідності записано найближчий, алюміній."]);
    expect(exportMaa({ ...model, wireConductivity: 1.4e6 }).text).toContain("2,\t12.0,\t5,\t75.0");
  });
});

// Files as the library of MMANA-GAL has them. Their headings differ: MMANA
// writes them in the language of its interface, and some were edited by hand.
describe("the files of the library of MMANA", () => {
  const dipole = [
    "Dipole 20 m",
    "*",
    "14.05",
    "* Провода *",
    "1",
    "0.0,\t-5.17,\t0.0,\t0.0,\t5.17,\t0.0,\t0.001,\t-1",
    "*** Источ. ***",
    "1,\t1",
    "w1c,\t0.0,\t1.0",
    "*** Нагрузка ***",
    "0,\t1",
    "*** Автосегм ***",
    "400,\t40,\t2.0,\t1",
    "*G/H/M/R/AzEl/X*",
    "0,\t20.0,\t0,\t50.0,\t120,\t60,\t0",
    "",
  ].join("\r\n");

  const vertical = [
    "Simple vertical",
    "*",
    "14.05",
    "***Wires***",
    "1",
    "0.0,\t0.0,\t0.0,\t0.0,\t0.0,\t5.19,\t0.001,\t-1",
    "*** Source ***",
    "1,\t1",
    "w1b,\t0.0,\t1.0",
    "*** Load ***",
    "0,\t1",
    "*** Segmentation ***",
    "400,\t40,\t2.0,\t1",
    "*** G/H/M/R/AzEl/X ***",
    "2,\t0.0,\t1,\t50.0,\t120,\t60,\t0.0",
  ].join("\r\n");

  const trapDipole = [
    "W3DZZm",
    "*",
    "7.04",
    "* \u00cf\u00f0\u00ee\u00e2\u00ee\u00e4\u00e0 *",
    "3",
    "-1.893e-15,\t-10.3,\t0.0,\t6.310e-16,\t10.3,\t0.0,\t0.0015,\t-1",
    "6.310e-16,\t10.3,\t0.0,\t1.075e-15,\t17.55,\t0.0,\t0.0015,\t-1",
    "-1.893e-15,\t-10.3,\t0.0,\t-3.225e-15,\t-17.55,\t0.0,\t0.0015,\t-1",
    "***   Source   ***",
    "1,\t1",
    "w1c,\t0.0,\t1.0",
    "***   Load   ***",
    "2,\t1",
    "w2b,\t0,\t9.26615,\t55.0,\t300.0",
    "w3b,\t0,\t9.26615,\t55.0,\t300.0",
    "**Segmentation**",
    "400,\t40,\t2.0,\t1",
    "*GH/??/R/AzEl/X*",
    "2,\t10.0,\t3,\t50.0,\t120,\t60,\t0",
    "### Comment ###",
    "* a line of the comment that looks like a heading *",
  ].join("\n");

  const taperedBeam = [
    "4ele 20m (30mm/25mm/20mm Pipe)",
    "*",
    "14.05",
    "***Wires***",
    "2",
    "0.0,\t-5.185,\t0.0,\t0.0,\t5.185,\t0.0,\t-0.001,\t-1",
    "-2.95,\t-5.405,\t0.0,\t-2.95,\t5.405,\t0.0,\t-0.001,\t-1",
    "*** Source ***",
    "1,\t1",
    "w1c,\t0.0,\t1.0",
    "*** Load ***",
    "0,\t1",
    "*** Segmentation ***",
    "400,\t50,\t2.0,\t1",
    "*** G/H/M/R/AzEl/X ***",
    "2,\t11.5,\t3,\t50.0,\t120,\t60,\t0.0",
    "$$$ Taper wire set $$$",
    "1",
    "-0.001,\t0,\t1.8,\t0.015,\t1.8,\t0.0125,\t99999.9,\t0.01",
  ].join("\r\n");

  it("are read whatever the language of their headings", () => {
    const { model, notes } = importMaa(dipole, defaultModel);
    expect(notes).toEqual([]);
    expect(model).toMatchObject({
      name: "Dipole 20 m",
      frequency: 14.05,
      source: { wire: 0, place: "c" },
      loads: [],
      height: 20,
      wireConductivity: 0,
      reference: 50,
    });
    expect(model.ground.kind).toBe("free");
    expect(model.wires).toEqual([{ x1: 0, y1: -5.17, z1: 0, x2: 0, y2: 5.17, z2: 0, radius: 0.001, segments: -1 }]);
  });

  it("are read with spaces in their headings", () => {
    const { model, notes } = importMaa(vertical, defaultModel);
    expect(model.source).toEqual({ wire: 0, place: "b" });
    expect(model.ground.kind).toBe("real");
    expect(model.wireConductivity).toBe(COPPER);
    expect(model.wires[0].z2).toBe(5.19);
    expect(notes).toHaveLength(2);
    // The wire stands on the real ground.
    expect(buildDeck(model).warnings).toEqual(["Дріт 1 торкається реальної землі: таке заземлення NEC-2 рахує неточно."]);
  });

  it("are read with headings that were spoiled or edited, and with a comment after them", () => {
    const { model } = importMaa(trapDipole, defaultModel);
    expect(model.wires).toHaveLength(3);
    expect(model.loads).toEqual([
      { kind: "lc", at: { wire: 1, place: "b" }, inductance: 9.26615, capacitance: 55, q: 300 },
      { kind: "lc", at: { wire: 2, place: "b" }, inductance: 9.26615, capacitance: 55, q: 300 },
    ]);
    expect(model.height).toBe(10);
    expect(model.ground.kind).toBe("real");
    expect(model.wireConductivity).toBe(ALUMINIUM);
    expect(buildDeck(model).errors).toEqual([]);
  });

  it("say that elements of several tubes are not modelled yet", () => {
    const { model, notes } = importMaa(taperedBeam, defaultModel);
    expect(model.wires.map((wire) => wire.radius)).toEqual([0.001, 0.001]);
    expect(notes.filter((note) => /складено з труб різного радіуса/.test(note))).toHaveLength(2);
    expect(model.height).toBe(11.5);
  });
});
