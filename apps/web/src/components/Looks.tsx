import { ACHIEVEMENTS } from "../achievements";
import { type BoardStyle, THEMES } from "../board/themes";
import { SEASON_GAMES, type SeasonKey, SHOP, useCareer } from "../career";
import { type Dict, useT } from "../i18n";
import {
  CHECKER_LOOKS,
  CHECKER_SETS,
  type CheckerSet,
  DICE_SKINS,
  type DiceSkin,
  hasLook,
  REWARDS,
  SHOP_ONLY,
  SUPPORTER,
  useOfferedStyles,
  useUnlocked,
} from "../rewards";
import { useSettings } from "../store/settings";
import { Icon } from "./Icon";

/** "10 games in an autumn season" */
export const seasonHow = (t: Dict, key: SeasonKey): string =>
  t.seasonHow.replace("{n}", String(SEASON_GAMES)).replace("{season}", t.seasonNames[key]);

/** A die in the colours of a skin, drawn like the dice icon of the set (rounded square, five pips). */
export function DieSwatch({
  fill,
  pip,
  edge,
  className = "h-6 w-6",
}: {
  fill: string;
  pip: string;
  edge?: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={`inline-block shrink-0 ${className}`} aria-hidden="true">
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="3.5"
        fill={fill}
        stroke={edge ?? "rgba(0,0,0,0.35)"}
        strokeWidth="1.5"
      />
      {[
        [8.5, 8.5],
        [15.5, 8.5],
        [12, 12],
        [8.5, 15.5],
        [15.5, 15.5],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" fill={pip} />
      ))}
    </svg>
  );
}

/** "Unlock: <achievement>" (plus "or N tokens" where the look can be exchanged). */
export const lockText = (t: Dict, achievement: string, shopId?: string): string => {
  if (achievement === SUPPORTER) return t.supporterOnly;
  if (achievement === SHOP_ONLY)
    return t.shopOnly.replace("{n}", String(SHOP.find((o) => o.id === shopId)?.price ?? "?"));
  const a = ACHIEVEMENTS.find((x) => x.id === achievement);
  const lang = t.locale.startsWith("de") ? "de" : "en";
  const name =
    achievement === "master-all"
      ? t.masterAll
      : /^season-[a-z]+$/.test(achievement)
        ? seasonHow(t, achievement.slice(7) as SeasonKey)
        : a
          ? a.title[lang]
          : achievement;
  const price = shopId ? SHOP.find((o) => o.id === shopId && !o.retired)?.price : undefined;
  const base = t.unlockBy.replace("{name}", name);
  return price ? `${base} ${t.orTokens.replace("{n}", String(price))}` : base;
};

/** Miniature board in the colours of a style. */
export function StylePreview({ style }: { style: BoardStyle }) {
  const th = THEMES[style];
  const tri = (x: number, top: boolean, fill: string) => (
    <path
      key={`${x}${top}`}
      d={top ? `M${x},6 L${x + 10},6 L${x + 5},30 Z` : `M${x},66 L${x + 10},66 L${x + 5},42 Z`}
      fill={fill}
    />
  );
  return (
    <svg viewBox="0 0 120 72" className="h-auto w-full rounded-lg" aria-hidden>
      <defs>{th.defs}</defs>
      <rect width="120" height="72" rx="6" fill={th.frame} />
      <rect x="5" y="5" width="50" height="62" fill={th.felt} />
      <rect x="65" y="5" width="50" height="62" fill={th.felt} />
      <rect x="55" y="0" width="10" height="72" fill={th.bar} />
      {[5, 15, 25, 35, 45, 65, 75, 85, 95, 105].map((x, i) => tri(x, true, i % 2 ? th.pointB : th.pointA))}
      {[5, 15, 25, 35, 45, 65, 75, 85, 95, 105].map((x, i) => tri(x, false, i % 2 ? th.pointA : th.pointB))}
      <circle cx="20" cy="60" r="4.5" fill={th.checkers[0].fill} stroke={th.checkers[0].edge} />
      <circle cx="20" cy="51" r="4.5" fill={th.checkers[0].fill} stroke={th.checkers[0].edge} />
      <circle cx="100" cy="12" r="4.5" fill={th.checkers[1].fill} stroke={th.checkers[1].edge} />
      <circle cx="100" cy="21" r="4.5" fill={th.checkers[1].fill} stroke={th.checkers[1].edge} />
      <rect x="78" y="31" width="9" height="9" rx="2" fill={th.die.fill} />
      <rect x="90" y="31" width="9" height="9" rx="2" fill={th.die.fill} />
    </svg>
  );
}

const pill = (on: boolean) =>
  `flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50 ${
    on ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-stone-700 text-stone-200"
  }`;

/** Board styles: free ones, unlocked ones and the rest with how to get them. */
export function StylePicker() {
  const t = useT();
  const styles = useOfferedStyles();
  const { style, update } = useSettings();
  const unlocked = useUnlocked();
  const owned = useCareer((c) => c.owned);
  return (
    <div className="grid grid-cols-2 gap-3 py-3 sm:grid-cols-3">
      {styles.map((s) => {
        const need = REWARDS.style[s];
        const open = hasLook("style", s, unlocked, owned);
        const lock = need ? lockText(t, need, `style-${s}`) : "";
        return (
          <button
            key={s}
            type="button"
            aria-pressed={style === s}
            disabled={!open}
            title={open ? undefined : lock}
            onClick={() => update({ style: s })}
            className={`rounded-xl border-2 p-2 text-left transition-colors ${
              style === s ? "border-amber-400 bg-amber-400/10" : "border-stone-800 hover:border-stone-600"
            }`}
          >
            <div className={open ? "" : "opacity-40 grayscale"}>
              <StylePreview style={s} />
            </div>
            <div className="mt-2 flex items-center justify-between px-1 text-sm">
              <span
                className={`inline-flex items-center gap-1 ${style === s ? "font-semibold text-amber-200" : "text-stone-300"}`}
              >
                {!open && <Icon name="lock" />}
                {t.styleNames[s]}
              </span>
              {style === s && <Icon name="check" className="h-4 w-4 text-amber-300" />}
            </div>
            {!open && <div className="px-1 text-[11px] leading-snug text-stone-500">{lock}</div>}
          </button>
        );
      })}
    </div>
  );
}

/** Dice looks: the board's own dice or unlocked skins. */
export function DicePicker() {
  const t = useT();
  const { diceSkin, update } = useSettings();
  const unlocked = useUnlocked();
  const owned = useCareer((c) => c.owned);
  const style = useSettings((s) => s.style);
  const skins: { id: DiceSkin; color: string; pip: string; edge?: string }[] = [
    { id: "theme", color: THEMES[style].die.fill, pip: THEMES[style].die.pip, edge: THEMES[style].die.edge },
    ...(Object.keys(DICE_SKINS) as Exclude<DiceSkin, "theme">[]).map((id) => ({
      id,
      color: DICE_SKINS[id].fill,
      pip: DICE_SKINS[id].pip,
      edge: DICE_SKINS[id].edge,
    })),
  ];
  return (
    <fieldset className="flex flex-col gap-2 py-3">
      <legend className="mb-2 text-stone-100">{t.diceSkin}</legend>
      <div className="flex flex-wrap gap-2">
        {skins.map((d) => {
          const need = REWARDS.dice[d.id];
          const open = hasLook("dice", d.id, unlocked, owned);
          return (
            <button
              key={d.id}
              type="button"
              aria-pressed={diceSkin === d.id}
              disabled={!open}
              title={open || !need ? undefined : lockText(t, need, `dice-${d.id}`)}
              onClick={() => update({ diceSkin: d.id })}
              className={pill(diceSkin === d.id)}
            >
              <DieSwatch fill={d.color} pip={d.pip} edge={d.edge} />
              {!open && <Icon name="lock" />}
              {t.diceSkins[d.id]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Two checkers of a set (or of the board style). */
export function CheckerSwatch({ set }: { set: CheckerSet }) {
  const style = useSettings((s) => s.style);
  const [light, dark] =
    set === "theme"
      ? [THEMES[style].checkers[0].fill, THEMES[style].checkers[1].fill]
      : CHECKER_LOOKS[set].swatch;
  const flat = (c: string) => (c.startsWith("url(") ? (c.includes("black") ? "#3a2418" : "#ece2c9") : c);
  return (
    <span aria-hidden className="flex">
      <span className="h-5 w-5 rounded-full ring-1 ring-black/40" style={{ background: flat(light) }} />
      <span
        className="-ml-1.5 h-5 w-5 rounded-full ring-1 ring-black/40"
        style={{ background: flat(dark) }}
      />
    </span>
  );
}

/** Checker sets: the board's own checkers or unlocked sets. */
export function CheckerPicker() {
  const t = useT();
  const { checkerSet, update } = useSettings();
  const unlocked = useUnlocked();
  const owned = useCareer((c) => c.owned);
  const sets: CheckerSet[] = ["theme", ...CHECKER_SETS];
  return (
    <fieldset className="flex flex-col gap-2 py-3">
      <legend className="mb-2 text-stone-100">{t.checkerSet}</legend>
      <div className="flex flex-wrap gap-2">
        {sets.map((id) => {
          const need = REWARDS.checkers[id];
          const open = hasLook("checkers", id, unlocked, owned);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={checkerSet === id}
              disabled={!open}
              title={open || !need ? undefined : lockText(t, need, `set-${id}`)}
              onClick={() => update({ checkerSet: id })}
              className={pill(checkerSet === id)}
            >
              <CheckerSwatch set={id} />
              {!open && <Icon name="lock" />}
              {t.checkerSets[id]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
