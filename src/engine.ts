import type { Output } from "nec2-wasm";
import type { Reply, Request } from "./engine.worker";

/** Why a computation gave no results, and the model that it was, as text. */
export interface Failure {
  model: string;
  lines: string[];
}

let worker: Worker | undefined;
let lastId = 0;
const waiting = new Map<number, { resolve: (output: Output) => void; reject: (error: Error) => void }>();

function start(): Worker {
  const created = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
  created.onmessage = (event: MessageEvent<Reply>) => {
    const reply = event.data;
    const request = waiting.get(reply.id);
    waiting.delete(reply.id);
    if (!request) return;
    if ("output" in reply) request.resolve(reply.output);
    else request.reject(new Error(reply.failure));
  };
  created.onerror = (event) => {
    for (const request of waiting.values()) request.reject(new Error(event.message || "the engine failed to start"));
    waiting.clear();
    worker = undefined;
  };
  return created;
}

/** The error of a computation that the user stopped. */
export class Stopped extends Error {
  constructor() {
    super("the computation was stopped");
    this.name = "Stopped";
  }
}

/**
 * Stops whatever the engine computes now: every computation that waits for
 * it fails with `Stopped`, and the next one starts the engine anew.
 */
export function stopEngine(): void {
  if (!worker) return;
  worker.terminate();
  worker = undefined;
  for (const request of waiting.values()) request.reject(new Stopped());
  waiting.clear();
}

/** Runs a deck of NEC cards in the engine, off the thread of the page. */
export function solve(deck: string): Promise<Output> {
  worker ??= start();
  const id = ++lastId;
  const request: Request = { id, deck };
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker!.postMessage(request);
  });
}
