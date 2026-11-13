/**
 * Procedural textures for the board themes: wood and felt are drawn with SVG noise
 * (feTurbulence) into small SVG documents that the board uses as images. As images they are
 * rasterised once and cached by the browser, so moving checkers does not re-run the filters.
 * No image files: everything here is generated, so there are no licences to track.
 */

type Rgb = readonly [number, number, number];

const hex = (c: string): Rgb => [
  Number.parseInt(c.slice(1, 3), 16) / 255,
  Number.parseInt(c.slice(3, 5), 16) / 255,
  Number.parseInt(c.slice(5, 7), 16) / 255,
];

const uri = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, " "))}`;

const table = (stops: readonly Rgb[], channel: 0 | 1 | 2): string =>
  stops.map((s) => s[channel].toFixed(3)).join(" ");

export interface WoodColors {
  /** Dark late wood, mid tone, light early wood. */
  readonly dark: string;
  readonly mid: string;
  readonly light: string;
}

/**
 * Wood with long grain: stretched noise mapped through an oscillating colour table gives the
 * streaks of growth rings; a second, finer noise adds pores. The tile repeats seamlessly.
 */
export const woodTexture = (c: WoodColors, width = 640, height = 220, seed = 7): string => {
  const [d, m, l] = [hex(c.dark), hex(c.mid), hex(c.light)];
  // dark – mid – light – mid – dark …: streaks instead of a single gradient
  const stops = [d, m, m, l, m, d, m, l];
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <filter id="w" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.0025 0.035" numOctaves="5" seed="${seed}" stitchTiles="stitch" result="grain"/>
      <feColorMatrix in="grain" type="matrix" values="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 1" result="grey"/>
      <feComponentTransfer in="grey" result="wood">
        <feFuncR type="table" tableValues="${table(stops, 0)}"/>
        <feFuncG type="table" tableValues="${table(stops, 1)}"/>
        <feFuncB type="table" tableValues="${table(stops, 2)}"/>
        <feFuncA type="discrete" tableValues="1"/>
      </feComponentTransfer>
      <feTurbulence type="fractalNoise" baseFrequency="0.012 0.55" numOctaves="2" seed="${seed + 11}" stitchTiles="stitch" result="fine"/>
      <feColorMatrix in="fine" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0 0 0 -0.38" result="pores"/>
      <feComposite in="pores" in2="wood" operator="over"/>
    </filter>
    <rect width="100%" height="100%" filter="url(#w)"/>
  </svg>`);
};

/**
 * Felt: the base colour with fine fibre noise and a soft vignette towards the edges. Meant to
 * be stretched over one half of the playing area.
 */
export const feltTexture = (base: string, width = 384, height = 624, seed = 3): string => {
  const [r, g, b] = hex(base);
  const k = 0.16; // fibre contrast
  const row = (v: number) => `${k} 0 0 0 ${(v - k / 2).toFixed(3)}`;
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <radialGradient id="v" cx="0.5" cy="0.5" r="0.75">
        <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity="0.42"/>
      </radialGradient>
    </defs>
    <filter id="f" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" seed="${seed}" result="n"/>
      <feColorMatrix in="n" type="matrix" values="${row(r)} ${row(g)} ${row(b)} 0 0 0 0 1"/>
    </filter>
    <rect width="100%" height="100%" filter="url(#f)"/>
    <rect width="100%" height="100%" fill="url(#v)"/>
  </svg>`);
};
