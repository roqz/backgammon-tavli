import type { GameState } from "@tavli/engine";
import { useEffect, useRef } from "react";
import { diceCupOn } from "./rewards";
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

const noiseBurst = (
  ac: AudioContext,
  at: number,
  dur: number,
  freq: number,
  gain: number,
  type: BiquadFilterType = "bandpass",
  q = 1.2,
) => {
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
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

/** Short tone whose pitch drops, like a hard object knocking on wood. */
const knock = (ac: AudioContext, at: number, freq: number, dur: number, gain: number) => {
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, at);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.55, at + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
};

/** One impact of a die: sharp click, wooden knock and a short resonance of the die itself. */
const dieImpact = (ac: AudioContext, at: number, amp: number) => {
  noiseBurst(ac, at, 0.008, 5000, amp * 0.9, "highpass", 0.7);
  knock(ac, at, 190 + Math.random() * 140, 0.06, amp * 0.55);
  noiseBurst(ac, at, 0.025, 2600 + Math.random() * 1800, amp * 0.5, "bandpass", 5);
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export const sounds = {
  /** Two dice landing: bounces with shrinking gaps and loudness, then a short roll-out. */
  dice() {
    const ac = audio();
    if (!ac) return;
    // the cup: a short rattle of the dice against the leather before the throw
    const cup = diceCupOn() ? 0.45 : 0;
    for (let i = 0; cup > 0 && i < 9; i++)
      noiseBurst(ac, ac.currentTime + i * rand(0.035, 0.05), 0.02, rand(1400, 2200), 0.35, "bandpass", 2);
    const t = ac.currentTime + 0.02 + cup;
    for (let d = 0; d < 2; d++) {
      let at = t + d * rand(0.03, 0.07);
      let gap = rand(0.1, 0.14);
      let amp = rand(0.5, 0.65);
      for (let k = 0; k < 6; k++) {
        dieImpact(ac, at, amp);
        at += gap * rand(0.85, 1.15);
        gap *= 0.66;
        amp *= 0.6;
      }
      for (let r = 0; r < 6; r++)
        noiseBurst(ac, at + r * rand(0.012, 0.022), 0.006, rand(3500, 6000), amp * 0.6, "bandpass", 3);
    }
    // the two dice clicking against each other
    noiseBurst(ac, t + rand(0.15, 0.25), 0.01, 4200, 0.25, "bandpass", 4);
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
  /** Soft two-note chime: it is your turn (app in the background). */
  yourTurn() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    tone(ac, t, 784, 0.18, 0.12);
    tone(ac, t + 0.14, 988, 0.3, 0.12);
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
