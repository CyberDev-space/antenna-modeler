/// <reference lib="webworker" />
// The engine runs here, so that a long computation does not freeze the page.
import init, { runWith, type Output } from "nec2-wasm";
import { MAX_SEGMENTS } from "./deck";

export interface Request {
  id: number;
  deck: string;
}

export type Reply = { id: number; output: Output } | { id: number; failure: string };

const ready = init();

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, deck } = event.data;
  let reply: Reply;
  try {
    await ready;
    reply = { id, output: runWith(deck, { maxEquations: MAX_SEGMENTS }) };
  } catch (error) {
    reply = { id, failure: String(error) };
  }
  self.postMessage(reply);
};
