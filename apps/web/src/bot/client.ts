import type { BotEnvelope, BotReply, BotRequest, BotResponse } from "./protocol";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

const getWorker = (): Worker => {
  if (worker) return worker;
  worker = new Worker(new URL("./bot.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<BotReply>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.error) p.reject(new Error(e.data.error));
    else p.resolve(e.data.result);
  };
  return worker;
};

/** Ask the bot worker for a decision. */
export const askBot = <R extends BotRequest>(request: R): Promise<BotResponse<R>> => {
  const id = nextId++;
  const envelope: BotEnvelope = { id, request };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    getWorker().postMessage(envelope);
  });
};
