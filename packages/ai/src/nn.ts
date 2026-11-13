import { type Board, checkerTotal, getVariant, opponent, type Player, type VariantId } from "@tavli/engine";
import type { Outcomes } from "./evaluate";
import { NET_LOADERS } from "./nets";

/**
 * Neural network evaluation (TD-Gammon style): a position with the player on roll goes through
 * one sigmoid hidden layer to five sigmoid outputs, the unconditional chances of the player on
 * roll to win, win a gammon, win a backgammon, lose a gammon and lose a backgammon (cubeless).
 * The networks are trained by self-play with temporal-difference learning
 * (scripts/train-nn.ts) and shipped as quantised weights (src/nets/*.ts).
 */
export interface Net {
  readonly model: NetModel;
  readonly inputs: number;
  readonly hidden: number;
  /** Input-to-hidden weights, laid out [input][hidden] (sparse inputs add whole rows). */
  readonly w1: Float32Array;
  readonly b1: Float32Array;
  /** Hidden-to-output weights, laid out [output][hidden]. */
  readonly w2: Float32Array;
  readonly b2: Float32Array;
}

export const NET_OUTPUTS = 5;

/** One network per family of variants with the same board logic. */
export type NetModel = "backgammon" | "hypergammon" | "portes" | "plakoto" | "fevga";

export const NET_OF: Record<VariantId, NetModel> = {
  backgammon: "backgammon",
  hypergammon: "hypergammon",
  portes: "portes",
  tavla: "portes",
  plakoto: "plakoto",
  fevga: "fevga",
  narde: "fevga",
};

/** Units per point and player: 1, 2, 3 and more than 3 checkers (TD-Gammon encoding). */
const POINT_UNITS = 4;

/** Plakoto adds one unit per point for a pinned checker. */
const pins = (model: NetModel): boolean => model === "plakoto";

/** Inputs per side: points, pinned checkers (Plakoto), bar, borne off, pip count. */
const sideInputs = (model: NetModel): number => 24 * POINT_UNITS + (pins(model) ? 24 : 0) + 3;

export const netInputs = (model: NetModel): number => 2 * sideInputs(model);

/** Sparse input: indices and values of the non-zero inputs. */
export interface Encoded {
  readonly idx: Int32Array;
  readonly val: Float32Array;
  n: number;
}

export const encodedBuffer = (): Encoded => ({ idx: new Int32Array(320), val: new Float32Array(320), n: 0 });

/** Encodes `b` from the view of `onRoll` (first block) and the opponent (second block). */
export const encode = (
  model: NetModel,
  variant: VariantId,
  b: Board,
  onRoll: Player,
  out: Encoded,
): Encoded => {
  const rules = getVariant(variant);
  const side = sideInputs(model);
  const pinned = pins(model);
  let n = 0;
  const put = (i: number, v: number) => {
    out.idx[n] = i;
    out.val[n] = v;
    n++;
  };
  for (let s = 0; s < 2; s++) {
    const q: Player = s === 0 ? onRoll : opponent(onRoll);
    const base = s * side;
    const path = rules.paths[q];
    const pts = b.points[q];
    const total = checkerTotal(b, q);
    let pips = b.bar[q] * 25;
    for (let k = 0; k < 24; k++) {
      const abs = path[k]!;
      const c = pts[abs]!;
      if (c > 0) {
        const o = base + k * POINT_UNITS;
        put(o, 1);
        if (c >= 2) put(o + 1, 1);
        if (c >= 3) put(o + 2, 1);
        if (c > 3) put(o + 3, (c - 3) / 2);
        pips += c * (24 - k);
      }
      if (pinned && b.pinned[abs] === q) put(base + 24 * POINT_UNITS + k, 1);
    }
    const tail = base + 24 * POINT_UNITS + (pinned ? 24 : 0);
    if (b.bar[q] > 0) put(tail, b.bar[q] / 2);
    if (b.off[q] > 0) put(tail + 1, b.off[q] / total);
    put(tail + 2, pips / (total * 10));
  }
  out.n = n;
  return out;
};

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/** Forward pass; fills `hidden` (activations) and `y` (outputs). */
export const forward = (net: Net, x: Encoded, hidden: Float32Array, y: Float32Array): Float32Array => {
  const H = net.hidden;
  hidden.set(net.b1);
  const { w1 } = net;
  for (let j = 0; j < x.n; j++) {
    const row = x.idx[j]! * H;
    const v = x.val[j]!;
    if (v === 1) for (let h = 0; h < H; h++) hidden[h]! += w1[row + h]!;
    else for (let h = 0; h < H; h++) hidden[h]! += v * w1[row + h]!;
  }
  for (let h = 0; h < H; h++) hidden[h] = sigmoid(hidden[h]!);
  const { w2, b2 } = net;
  for (let o = 0; o < NET_OUTPUTS; o++) {
    let a = b2[o]!;
    const row = o * H;
    for (let h = 0; h < H; h++) a += w2[row + h]! * hidden[h]!;
    y[o] = sigmoid(a);
  }
  return y;
};

/** Raw outputs swapped to the other player's view. */
export const flipOutputs = (y: ArrayLike<number>, out: Float32Array): Float32Array => {
  const [w, gw, bw, gl, bl] = [y[0]!, y[1]!, y[2]!, y[3]!, y[4]!];
  out[0] = 1 - w;
  out[1] = gl;
  out[2] = bl;
  out[3] = gw;
  out[4] = bw;
  return out;
};

/** Cubeless money equity of raw outputs (points per game). */
export const outputEquity = (y: ArrayLike<number>): number => 2 * y[0]! - 1 + y[1]! - y[3]! + y[2]! - y[4]!;

const scratch = { x: encodedBuffer(), hidden: new Float32Array(256), y: new Float32Array(NET_OUTPUTS) };

/**
 * Outcomes for `p` with `onRoll` to move next, from the network (gammon and backgammon chances
 * converted to "given a win/loss" as the rest of the bot expects them).
 */
export const netOutcomes = (net: Net, variant: VariantId, b: Board, p: Player, onRoll: Player): Outcomes => {
  forward(net, encode(net.model, variant, b, onRoll, scratch.x), scratch.hidden, scratch.y);
  const y = scratch.y;
  const rules = getVariant(variant);
  // the view of p
  const mine = p === onRoll;
  const win = mine ? y[0]! : 1 - y[0]!;
  const gw = mine ? y[1]! : y[3]!;
  const bw = mine ? y[2]! : y[4]!;
  const gl = mine ? y[3]! : y[1]!;
  const bl = mine ? y[4]! : y[2]!;
  const given = (part: number, of: number) => (of > 1e-6 ? Math.min(1, part / of) : 0);
  const gammonWin = given(gw, win);
  const gammonLoss = given(gl, 1 - win);
  return {
    win,
    gammonWin,
    backgammonWin: rules.backgammons ? Math.min(gammonWin, given(bw, win)) : 0,
    gammonLoss,
    backgammonLoss: rules.backgammons ? Math.min(gammonLoss, given(bl, 1 - win)) : 0,
  };
};

/** A fresh network with small random weights. */
export const randomNet = (model: NetModel, hidden: number, rng: () => number): Net => {
  const inputs = netInputs(model);
  const r = (n: number, scale: number) => Float32Array.from({ length: n }, () => (rng() * 2 - 1) * scale);
  return {
    model,
    inputs,
    hidden,
    w1: r(inputs * hidden, 0.1),
    b1: r(hidden, 0.1),
    w2: r(NET_OUTPUTS * hidden, 0.1),
    b2: new Float32Array(NET_OUTPUTS),
  };
};

// --- serialisation: int16 per tensor with a scale, base64 ---

const TENSORS = ["w1", "b1", "w2", "b2"] as const;

const toBase64 = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const fromBase64 = (b64: string): Uint8Array => {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

/** Packed network: "model:inputs:hidden:scale1,scale2,…:base64(int16 little endian)". */
export const packNet = (net: Net): string => {
  const scales: number[] = [];
  const total = TENSORS.reduce((a, k) => a + net[k].length, 0);
  const q = new Int16Array(total);
  let o = 0;
  for (const k of TENSORS) {
    const t = net[k];
    let max = 1e-9;
    for (const v of t) max = Math.max(max, Math.abs(v));
    const scale = max / 32767;
    scales.push(scale);
    for (let i = 0; i < t.length; i++) q[o++] = Math.round(t[i]! / scale);
  }
  const bytes = new Uint8Array(q.buffer);
  return `${net.model}:${net.inputs}:${net.hidden}:${scales.map((s) => s.toPrecision(9)).join(",")}:${toBase64(bytes)}`;
};

export const unpackNet = (packed: string): Net => {
  const [model, inputs, hidden, scaleList, data] = packed.split(":") as [
    NetModel,
    string,
    string,
    string,
    string,
  ];
  const I = Number(inputs);
  const H = Number(hidden);
  const scales = scaleList.split(",").map(Number);
  const bytes = fromBase64(data);
  const q = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const sizes = { w1: I * H, b1: H, w2: NET_OUTPUTS * H, b2: NET_OUTPUTS };
  const t: Record<string, Float32Array> = {};
  let o = 0;
  TENSORS.forEach((k, n) => {
    const a = new Float32Array(sizes[k]);
    for (let i = 0; i < a.length; i++) a[i] = q[o++]! * scales[n]!;
    t[k] = a;
  });
  return { model, inputs: I, hidden: H, w1: t.w1!, b1: t.b1!, w2: t.w2!, b2: t.b2! };
};

// --- registry: networks are loaded on demand (code-split in the browser, see nets/index.ts) ---

const loaders = NET_LOADERS;
const nets: Partial<Record<NetModel, Net>> = {};

/** Installs a network directly (tests, training). */
export const setNet = (model: NetModel, net: Net | null): void => {
  if (net) nets[model] = net;
  else delete nets[model];
};

/** The loaded network for a variant, or null (then the heuristic evaluation is used). */
export const netFor = (variant: VariantId): Net | null => nets[NET_OF[variant]] ?? null;

/** Whether a trained network exists for the variant. */
export const hasNet = (variant: VariantId): boolean => !!loaders[NET_OF[variant]] || !!nets[NET_OF[variant]];

/** Loads the variant's network if there is one; resolves to it (or null). */
export const loadNet = async (variant: VariantId): Promise<Net | null> => {
  const model = NET_OF[variant];
  if (nets[model]) return nets[model]!;
  const load = loaders[model];
  if (!load) return null;
  const net = unpackNet(await load());
  nets[model] = net;
  return net;
};
