import { type GameState, isDraw } from "@tavli/engine";
import { useEffect, useRef } from "react";
import { diceCupOn, diceSurfaceOn, soundSetOn } from "./rewards";
import { useGame } from "./store/game";
import { type DiceSurface, type SoundSet, useSettings } from "./store/settings";

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

/**
 * What the dice land on: click brightness, knock pitch, ring of the surface, number of bounces
 * and how fast they die down. Classic is the wooden board; the others come from the exchange.
 */
const SURFACES: Record<
  DiceSurface,
  {
    click: number;
    knock: [number, number];
    knockLen: number;
    ring: [number, number];
    bounces: number;
    damp: number;
    ping?: [number, number];
  }
> = {
  classic: { click: 5000, knock: [190, 330], knockLen: 0.06, ring: [2600, 4400], bounces: 6, damp: 0.6 },
  // a felt-lined tray: soft and short
  felt: { click: 2200, knock: [120, 180], knockLen: 0.05, ring: [900, 1400], bounces: 4, damp: 0.45 },
  // bone dice on a hard board: bright and dry
  bone: { click: 6500, knock: [330, 450], knockLen: 0.035, ring: [3600, 5200], bounces: 6, damp: 0.58 },
  // a marble table: hard, more bounces and a short ring of the stone
  marble: {
    click: 7500,
    knock: [420, 560],
    knockLen: 0.03,
    ring: [4200, 6000],
    bounces: 7,
    damp: 0.66,
    ping: [2400, 3100],
  },
};

/** One impact of a die: sharp click, knock and a short resonance of the die itself. */
const dieImpact = (ac: AudioContext, at: number, amp: number, s = SURFACES.classic) => {
  noiseBurst(ac, at, 0.008, s.click, amp * 0.9, "highpass", 0.7);
  knock(ac, at, rand(...s.knock), s.knockLen, amp * 0.55);
  noiseBurst(ac, at, 0.025, rand(...s.ring), amp * 0.5, "bandpass", 5);
  if (s.ping) tone(ac, at, rand(...s.ping), 0.07, amp * 0.06);
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** A struck bell or glass: a few inharmonic partials that ring out. */
const bell = (ac: AudioContext, at: number, f: number, dur: number, gain: number) => {
  for (const [ratio, g] of [
    [1, 1],
    [2.76, 0.45],
    [5.4, 0.2],
  ] as const)
    tone(ac, at, f * ratio, dur / ratio ** 0.4, gain * g);
};

/**
 * Sound sets from the exchange: checker, hit and game end in another material. The dice and
 * the cube keep their sound, so the game still sounds like itself.
 */
const SETS = {
  wood: {
    checker(ac: AudioContext, t: number) {
      knock(ac, t, rand(300, 360), 0.09, 0.5);
      noiseBurst(ac, t, 0.015, 900, 0.3, "bandpass", 3);
    },
    hit(ac: AudioContext, t: number) {
      knock(ac, t, 170, 0.22, 0.75);
      knock(ac, t + 0.05, 240, 0.12, 0.35);
      noiseBurst(ac, t, 0.04, 700, 0.5);
    },
    end(ac: AudioContext, t: number, won: boolean) {
      const notes = won ? [392, 494, 587, 784] : [392, 330, 262];
      for (const [i, f] of notes.entries()) knock(ac, t + i * 0.13, f, 0.3, 0.45);
    },
  },
  stone: {
    checker(ac: AudioContext, t: number) {
      noiseBurst(ac, t, 0.006, 6500, 0.5, "highpass", 0.8);
      tone(ac, t, rand(2000, 2300), 0.1, 0.05);
      knock(ac, t, 520, 0.04, 0.25);
    },
    hit(ac: AudioContext, t: number) {
      noiseBurst(ac, t, 0.01, 5200, 0.7, "highpass", 0.8);
      tone(ac, t, 1500, 0.22, 0.07);
      knock(ac, t, 380, 0.08, 0.4);
    },
    end(ac: AudioContext, t: number, won: boolean) {
      const notes = won ? [1047, 1319, 1568, 2093] : [784, 659, 523];
      for (const [i, f] of notes.entries()) tone(ac, t + i * 0.12, f, 0.5, 0.08);
    },
  },
  bells: {
    checker(ac: AudioContext, t: number) {
      noiseBurst(ac, t, 0.02, 1800, 0.3);
      bell(ac, t, rand(1180, 1260), 0.35, 0.05);
    },
    hit(ac: AudioContext, t: number) {
      noiseBurst(ac, t, 0.04, 1200, 0.5);
      bell(ac, t, 620, 0.7, 0.1);
    },
    end(ac: AudioContext, t: number, won: boolean) {
      const notes = won ? [659, 784, 988, 1319] : [587, 494, 392];
      for (const [i, f] of notes.entries()) bell(ac, t + i * 0.16, f, 1.1, 0.07);
    },
  },
} as const;

export const sounds = {
  /** Two dice landing: bounces with shrinking gaps and loudness, then a short roll-out. */
  dice(surface: DiceSurface = diceSurfaceOn()) {
    const ac = audio();
    if (!ac) return;
    const s = SURFACES[surface];
    // the cup: a short rattle of the dice against the leather before the throw
    const cup = diceCupOn() ? 0.45 : 0;
    for (let i = 0; cup > 0 && i < 9; i++)
      noiseBurst(ac, ac.currentTime + i * rand(0.035, 0.05), 0.02, rand(1400, 2200), 0.35, "bandpass", 2);
    const t = ac.currentTime + 0.02 + cup;
    for (let d = 0; d < 2; d++) {
      let at = t + d * rand(0.03, 0.07);
      let gap = rand(0.1, 0.14);
      let amp = rand(0.5, 0.65);
      for (let k = 0; k < s.bounces; k++) {
        dieImpact(ac, at, amp, s);
        at += gap * rand(0.85, 1.15);
        gap *= 0.66;
        amp *= s.damp;
      }
      for (let r = 0; r < (surface === "felt" ? 2 : 6); r++)
        noiseBurst(ac, at + r * rand(0.012, 0.022), 0.006, rand(...s.ring) * 1.3, amp * 0.6, "bandpass", 3);
    }
    // the two dice clicking against each other
    noiseBurst(ac, t + rand(0.15, 0.25), 0.01, 4200, 0.25, "bandpass", 4);
  },
  checker() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    const set = soundSetOn();
    if (set !== "classic") return SETS[set].checker(ac, t);
    noiseBurst(ac, t, 0.03, 1800, 0.5);
    tone(ac, t, 180, 0.08, 0.15, "triangle");
  },
  hit() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    const set = soundSetOn();
    if (set !== "classic") return SETS[set].hit(ac, t);
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
    const set = soundSetOn();
    if (set !== "classic") return SETS[set].end(ac, t, true);
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
    const set = soundSetOn();
    if (set !== "classic") return SETS[set].end(ac, t, false);
    for (const [i, f] of [392, 330, 262].entries()) tone(ac, t + i * 0.16, f, 0.4, 0.12);
  },
};

/** A short sample of a sound set (also one not taken yet): two checkers, a hit and a win. */
export const previewSoundSet = (set: SoundSet) => {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.02;
  if (set === "classic") {
    sounds.checker();
    setTimeout(() => sounds.hit(), 450);
    setTimeout(() => sounds.win(), 900);
    return;
  }
  const s = SETS[set];
  s.checker(ac, t);
  s.checker(ac, t + 0.22);
  s.hit(ac, t + 0.5);
  s.end(ac, t + 0.95, true);
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
      const humanWon = humans === 2 || isDraw(game.result) || players[game.result.winner].kind === "human";
      if (humanWon) sounds.win();
      else sounds.lose();
    }
  }, [enabled, game, openingSeq, players]);
}
