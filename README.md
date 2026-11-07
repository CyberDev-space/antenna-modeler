# antenna-modeler

Working title. A program for modeling wire antennas in the browser: as easy to use as MMANA, with the accuracy of NEC-2 and a real ground.

## Status

The computing engine is ready and tested: it is a separate project, [nec2-rs](https://github.com/CyberDev-space/nec2-rs), and runs in the browser as the WebAssembly package [nec2-wasm](https://www.npmjs.com/package/nec2-wasm).

The program itself is in development. This works now:

- **The model.** A table of wires as in MMANA: ends in metres, radius in millimetres, automatic segmentation. One source, written as `w1c`. Loads: a coil, a capacitor, a trap (a coil and a capacitor in parallel) with a quality factor, or a fixed R + jX. The material of the wires: no loss, copper, aluminium or a conductivity of your own. The ground: free space, perfect or real, with the height that MMANA calls "Add height".
- **The results for one frequency.** Input impedance, SWR, gain, front-to-back ratio, elevation angle and azimuth of the maximum, efficiency, and two cuts of the pattern.
- **A sweep over frequency.** SWR, R and X against frequency, the frequency of the lowest SWR and the band where the SWR stays below 2. Coils, capacitors and traps follow the frequency.
- **A view of the antenna in space**, over the ground when there is one, with the source and the loads marked.
- **Files.** Antenna files of MMANA (`.maa`) are opened and written. A model is saved in a JSON format of its own, which holds everything. The cards of NEC-2 are exported for other programs (`.nec`).
- **Checks before the engine runs.** A model that cannot be computed gets a message in plain words: a wire on the ground or under it, a source beyond the end of its wire. A model that NEC-2 computes with less accuracy gets a warning: segments that are too long, or too short for their radius, a wire that touches a real ground.

Not there yet: several sources, the optimizer, the pattern in space, the currents on the wires, a link that holds a model. The interface is in Ukrainian.

### What a file of MMANA loses

MMANA and this program do not model the same things, so a `.maa` file does not carry everything across. When a file is opened, the page lists what it left out:

- a wire with a combined radius (a negative R, which points to a table of tubes of several diameters) gets a radius of 1 mm, so an antenna with such elements gives other results than in MMANA;
- a wire with the radius 0, which MMANA uses as an insulator, is left out;
- of several sources only the first is taken;
- a load that is given as a polynomial (the type "S") is left out;
- the automatic segmentation is the one of this program, equal segments of about a fortieth of a wavelength, where MMANA tapers them;
- a source or a load at the joint of two wires (`w2b`) sits in the first segment of its wire, half a segment away from the joint. For a trap this moves the resonance by about one percent; more segments on the wires bring it back.

A `.maa` file does not hold the parameters of a real ground or the range of the sweep. Save the model in the format of the program to keep them.

## Checked against MMANA-GAL

`DP20.MAA` is the dipole of the library that comes with MMANA-GAL: 10.34 m of wire for 14.05 MHz. The numbers of MMANA-GAL are those that the [tutorial of NH7O](https://www.tcpsas.com/sezioneIV/MMANA-GAL/docs/quickstart.pdf) prints for it.

| | MMANA-GAL | This program |
|---|---|---|
| Free space, no loss | 71.5 Ω, SWR 1.43, 2.13 dBi | 71.7 − j2.3 Ω, SWR 1.44, 2.14 dBi |
| Copper wire, 20 m over a real ground: the impedance over a perfect ground, which is how MMANA computes it | 78.6 Ω, SWR 1.61 | 78.1 − j9.6 Ω, SWR 1.60 |
| The same over the real ground itself | — | 75.1 − j6.8 Ω, SWR 1.52 |
| Elevation angle of the lobe over the real ground | 14.9° | 14.9° |

The program reads the file of MMANA and gives its numbers where the two programs model the same thing. The third row is what the real ground changes: 3.5 Ω at this height of almost a wavelength, and much more for a low antenna, as the example below shows. The tests of the program hold these numbers.

## Run it

It needs a current Node (22 or newer).

```sh
npm install
npm run dev      # the page at http://localhost:5173
npm test         # the tests, the example through the engine among them
npm run build    # the files of the site in dist/
```

The computation runs in a Web Worker, so the page stays responsive. The model is kept in the storage of the browser between visits; save it to a file to keep it for good.

## Why

- **MMANA-GAL** is the most popular antenna program among Ukrainian radio amateurs. But it runs only on Windows, its source is closed, and it computes the impedance of an antenna over a perfect ground (its engine is MININEC). For low HF antennas the error is noticeable.
- **xnec2c, 4nec2 and EZNEC** use the NEC-2 engine with a real ground. But a model is entered there as NEC cards, which is hard for a beginner. 4nec2 and EZNEC run only on Windows and are no longer developed.

The goal: a table of wires as in MMANA, NEC-2 with a Sommerfeld ground, a program that runs in the browser, an interface in Ukrainian, and import of `.maa` files.

## Example: what a real ground changes

A horizontal dipole for 14.2 MHz (10.1 m long, wire 2 mm in diameter) 3 m above the ground, which is 0.14 wavelengths:

| Ground | Input impedance | Gain towards the zenith |
|---|---|---|
| Perfect | 39 + j12 Ω | 8.6 dBi |
| Average (ε = 13, σ = 0.005 S/m) | 58 − j3 Ω | 5.4 dBi |

A perfect ground is what MMANA uses for the impedance. The difference between the two rows is the error that a real ground removes.

The numbers are computed with nec2-rs. This is the model, to check them (for the perfect ground the ground card is `GN 1`):

```
CM Horizontal dipole for 14 MHz, 3 m above the ground
CE
GW 1 21 0 -5.05 3 0 5.05 3 0.001
GE 0
GN 2 0 0 0 13 0.005
EX 0 1 11 0 1 0
FR 0 1 0 0 14.2 0
RP 0 4 1 1000 0 0 30 0
EN
```

## Stack

| Layer | Choice |
|---|---|
| User interface | TypeScript, React, Vite |
| Engine | our own NEC-2 engine in Rust, [nec2-rs](https://github.com/CyberDev-space/nec2-rs) (MIT license), compiled to WebAssembly and hidden behind an interface of its own |
| Parallelism | a Web Worker runs the engine; a pool of workers for the points of a sweep and the variants of the optimizer is planned |
| 3D | three.js |
| Charts | our own SVG: line charts for sweeps and polar plots for patterns; a Smith chart is planned |
| Format | our own JSON; import and export of `.maa`; export of `.nec`; a link that holds a model is planned |
| Tests | Vitest; reference results from nec2c |
| License | MIT, like the engine |

At first the engine was to be the ready-made package [`@necpp-engine/wasm`](https://www.npmjs.com/package/@necpp-engine/wasm) (NEC2++, GPL). On 2026-11-21 it was decided to write an engine of our own instead: a port of the public-domain nec2c to Rust. The code of NEC2++ and xnec2c is not read for it. The rules are in [PROVENANCE.md](https://github.com/CyberDev-space/nec2-rs/blob/main/PROVENANCE.md) of nec2-rs.

A fork of xnec2c does not fit. Its interface is GTK, and its parallel computation uses `fork()`. Neither works in a browser.

## What must be as easy as in MMANA

1. A table of wires: coordinates, radius, number of segments (−1 means "automatic"), wire ends that snap to other wires, the source written as `w1c`.
2. Automatic segmentation, and warnings when a model goes beyond the limits of NEC-2.
3. One "Compute" button. The result: impedance, SWR, gain, front-to-back ratio, elevation angle of the radiation, patterns.
4. Ground: free space, perfect or real.
5. An optimizer with goals and weights.
6. Import of `.maa` files.
