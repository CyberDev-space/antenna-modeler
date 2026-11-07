# antenna-modeler

Working title. A program for modeling wire antennas in the browser: as easy to use as MMANA, with the accuracy of NEC-2 and a real ground.

## Status

The project is at its very beginning. The computing engine is ready and tested: it is a separate project, [nec2-rs](https://github.com/CyberDev-space/nec2-rs). There is no user interface yet. This page describes what it is meant to be.

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
| Parallelism | a pool of Web Workers: the points of a sweep and the variants of the optimizer are computed separately |
| 3D | three.js |
| Charts | uPlot for sweeps, our own SVG for polar patterns and the Smith chart |
| Format | our own JSON; import and export of `.maa` and `.nec`; a link that holds a model |
| Tests | Vitest; reference results from nec2c |
| License | not chosen yet: an engine of our own under MIT does not oblige the program to the GPL |

At first the engine was to be the ready-made package [`@necpp-engine/wasm`](https://www.npmjs.com/package/@necpp-engine/wasm) (NEC2++, GPL). On 2026-11-21 it was decided to write an engine of our own instead: a port of the public-domain nec2c to Rust. The code of NEC2++ and xnec2c is not read for it. The rules are in [PROVENANCE.md](https://github.com/CyberDev-space/nec2-rs/blob/main/PROVENANCE.md) of nec2-rs.

A fork of xnec2c does not fit. Its interface is GTK, and its parallel computation uses `fork()`. Neither works in a browser.

## What must be as easy as in MMANA

1. A table of wires: coordinates, radius, number of segments (−1 means "automatic"), wire ends that snap to other wires, the source written as `w1c`.
2. Automatic segmentation, and warnings when a model goes beyond the limits of NEC-2.
3. One "Compute" button. The result: impedance, SWR, gain, front-to-back ratio, elevation angle of the radiation, patterns.
4. Ground: free space, perfect or real.
5. An optimizer with goals and weights.
6. Import of `.maa` files.
