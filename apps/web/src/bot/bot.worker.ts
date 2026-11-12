/// <reference lib="webworker" />
import { chooseMoves, shouldAcceptResign, shouldDouble, shouldTake } from "@tavli/ai";
import { cryptoRng } from "@tavli/engine";
import { reviewGame } from "../review";
import type { BotEnvelope, BotReply } from "./protocol";

/** Runs bot decisions off the main thread so animations stay smooth while the bot thinks. */
self.onmessage = (e: MessageEvent<BotEnvelope>) => {
  const { id, request } = e.data;
  let reply: BotReply;
  try {
    switch (request.kind) {
      case "moves":
        reply = {
          id,
          result: chooseMoves(request.state, request.level, cryptoRng),
        };
        break;
      case "double":
        reply = { id, result: shouldDouble(request.state, request.level, request.match) };
        break;
      case "take":
        reply = { id, result: shouldTake(request.state, request.level, request.match) };
        break;
      case "accept-resign":
        reply = { id, result: shouldAcceptResign(request.state, request.match) };
        break;
      case "review":
        reply = { id, result: reviewGame(request.variant, request.history) };
        break;
    }
  } catch (err) {
    reply = { id, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(reply);
};
