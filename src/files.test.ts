import { describe, expect, it } from "vitest";
import { encodeAnsi, fileName, openModel, restoreModel, saveModel } from "./files";
import { defaultModel, type Model } from "./model";

const loaded: Model = {
  ...defaultModel,
  name: "Вертикал із котушкою",
  source: { wire: 0, place: "b", offset: 1 },
  loads: [
    { kind: "lc", at: { wire: 0, place: "c", offset: -2 }, inductance: 12.5, capacitance: 0, q: 300 },
    { kind: "rx", at: { wire: 0, place: "e" }, resistance: 50, reactance: -7 },
  ],
  height: 2.5,
  wireConductivity: 5.8e7,
};

describe("a model in the store or in a file of the program", () => {
  it("comes back as it was saved", () => {
    expect(openModel(saveModel(loaded), defaultModel)).toEqual({ model: loaded, notes: [] });
    expect(restoreModel(JSON.parse(JSON.stringify(defaultModel)))).toEqual(defaultModel);
  });

  it("gets what an older version did not write", () => {
    const { name, loads, height, wireConductivity, sweep, ...old } = defaultModel;
    expect(restoreModel(old)).toEqual({ ...defaultModel, name: "" });
    expect([name, loads, height, wireConductivity, sweep]).toHaveLength(5);
  });

  it("is refused when it is not a model", () => {
    const broken: unknown[] = [
      null,
      42,
      "model",
      [],
      {},
      { ...defaultModel, wires: null },
      { ...defaultModel, wires: [{ ...defaultModel.wires[0], x1: "0" }] },
      { ...defaultModel, wires: [{ ...defaultModel.wires[0], radius: null }] },
      { ...defaultModel, source: { wire: -1, place: "c" } },
      { ...defaultModel, source: { wire: 0, place: "x" } },
      { ...defaultModel, source: { wire: 0, place: "c", offset: 1.5 } },
      { ...defaultModel, loads: [{ kind: "lc", at: { wire: 0, place: "c" }, inductance: 1 }] },
      { ...defaultModel, loads: [{ kind: "coil", at: { wire: 0, place: "c" } }] },
      { ...defaultModel, frequency: "14" },
      { ...defaultModel, ground: { ...defaultModel.ground, kind: "sea" } },
      { ...defaultModel, ground: { kind: "real" } },
      { ...defaultModel, sweep: { from: 1, to: 2 } },
    ];
    for (const value of broken) expect(restoreModel(value)).toBeNull();
  });
});

describe("the text of a file", () => {
  it("is taken as a file of MMANA unless it is JSON", () => {
    const maa = "Dipole\r\n*\r\n7.1\r\n***Wires***\r\n1\r\n0.0, -10.0, 0.0, 0.0, 10.0, 0.0, 8.0e-04, -1\r\n***Source***\r\n1, 1\r\nw1c, 0.0, 1.0\r\n";
    const { model, notes } = openModel(maa, defaultModel);
    expect(model.name).toBe("Dipole");
    expect(model.frequency).toBe(7.1);
    expect(notes).toEqual([]);
    expect(() => openModel("CM cards of NEC\nCE\nEN\n", defaultModel)).toThrow(/Це не файл антени MMANA/);
  });

  it("is refused with a reason when it is JSON of something else", () => {
    expect(() => openModel('{"format": "antenna-modeler", "model": ', defaultModel)).toThrow(/це не JSON/);
    expect(() => openModel('{"wires": []}', defaultModel)).toThrow(/не файл моделі цієї програми/);
    expect(() => openModel(JSON.stringify({ format: "antenna-modeler", model: { wires: 1 } }), defaultModel)).toThrow(/не файл моделі/);
  });

  it("is written for MMANA in the code page of Windows", () => {
    expect([...encodeAnsi("Yagi 2 m")]).toEqual([0x59, 0x61, 0x67, 0x69, 0x20, 0x32, 0x20, 0x6d]);
    expect([...encodeAnsi("Диполь ґї№ → λ")]).toEqual([0xc4, 0xe8, 0xef, 0xee, 0xeb, 0xfc, 0x20, 0xb4, 0xbf, 0xb9, 0x20, 0x3f, 0x20, 0x3f]);
    expect(new TextDecoder("windows-1251").decode(encodeAnsi("Антена «Дельта» на 7 МГц"))).toBe("Антена «Дельта» на 7 МГц");
  });

  it("gets a name that a file system takes", () => {
    expect(fileName(loaded, "maa")).toBe("Вертикал із котушкою.maa");
    expect(fileName({ ...loaded, name: ' 40/20 m: "trap" <v2>? ' }, "json")).toBe("40 20 m trap v2.json");
    expect(fileName({ ...loaded, name: " / " }, "nec")).toBe("antenna.nec");
  });
});
