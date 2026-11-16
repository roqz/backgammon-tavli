import type { EmoteId } from "@tavli/protocol";
import type { IconName } from "./Icon";

/** The icon in front of each quick message (picker, speech bubble, note under the name). */
export const EMOTE_ICON: Record<EmoteId, IconName> = {
  hi: "face-smile",
  gl: "clover",
  gg: "handshake",
  nice: "star",
  lucky: "dice",
  oops: "face-sweat",
  think: "face-think",
  thanks: "heart",
  opa: "fireworks",
  yassou: "cheers",
  bravo: "trophy",
  siga: "hourglass",
  pame: "forward",
  rematch: "rematch",
  respect: "medal",
  wow: "face-wow",
  close: "face-grimace",
  phew: "face-phew",
};
