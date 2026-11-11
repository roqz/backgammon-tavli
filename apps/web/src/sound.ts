import type { GameState } from "@tavli/engine";
import { useEffect, useRef } from "react";
import { useGame } from "./store/game";
import { useSettings } from "./store/settings";

/**
 * Tiny synthesized sound effects (Web Audio, no asset files): dice, checker clicks, hits,
 * cube and game end.
 */
let ctx: AudioContext | null = null;

const audio = (): AudioContext | null => {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
};

const noiseBurst = (ac: AudioContext, at: number, dur: number, freq: number, gain: number) => {
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = 1.2;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(at);
};

const tone = (
  ac: AudioContext,
  at: number,
  freq: number,
  dur: number,
  gain: number,
  type: OscillatorType = "sine",
) => {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
};

export const sounds = {
  dice() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    for (let i = 0; i < 7; i++)
      noiseBurst(ac, t + i * 0.045 + Math.random() * 0.02, 0.04, 2500 + Math.random() * 2500, 0.35);
  },
  checker() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    noiseBurst(ac, t, 0.03, 1800, 0.5);
    tone(ac, t, 180, 0.08, 0.15, "triangle");
  },
  hit() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    noiseBurst(ac, t, 0.05, 1200, 0.7);
    tone(ac, t, 110, 0.18, 0.35, "triangle");
  },
  cube() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    tone(ac, t, 440, 0.15, 0.15);
    tone(ac, t + 0.12, 660, 0.25, 0.15);
  },
  win() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    for (const [i, f] of [523, 659, 784, 1047].entries()) tone(ac, t + i * 0.11, f, 0.35, 0.14);
  },
  lose() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    for (const [i, f] of [392, 330, 262].entries()) tone(ac, t + i * 0.16, f, 0.4, 0.12);
  },
};

/** Plays sounds for game events by watching the game state. */
export function useGameSounds() {
  const enabled = useSettings((s) => s.sound);
  const game = useGame((s) => s.match?.game ?? null);
  const players = useGame((s) => s.players);
  const openingSeq = useGame((s) => s.opening?.seq ?? 0);
  const prev = useRef<{ game: GameState | null; openingSeq: number }>({ game, openingSeq });

  useEffect(() => {
    const before = prev.current;
    prev.current = { game, openingSeq };
    if (!enabled || !game || !before.game || before.game === game) {
      if (enabled && openingSeq !== before.openingSeq) sounds.dice();
      return;
    }
    const b = before.game;
    if (game.dice && game.dice !== b.dice) sounds.dice();
    if (game.played.length !== b.played.length) {
      const last = game.played[game.played.length - 1];
      if (game.played.length > b.played.length && last?.hit) sounds.hit();
      else sounds.checker();
    }
    if (game.phase === "cube-offered" && b.phase !== "cube-offered") sounds.cube();
    if (game.result && !b.result) {
      const humans = players.filter((p) => p.kind === "human").length;
      const humanWon = humans === 2 || players[game.result.winner].kind === "human";
      if (humanWon) sounds.win();
      else sounds.lose();
    }
  }, [enabled, game, openingSeq, players]);
}
