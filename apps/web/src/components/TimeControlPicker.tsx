import { TIME_CONTROLS, type TimeControl } from "@tavli/protocol";
import { useT } from "../i18n";
import { Icon } from "./Icon";
import { Segmented } from "./ui";

/** Relaxed, standard or blitz, with what it means. */
export function TimeControlPicker({
  value,
  onChange,
}: {
  value: TimeControl;
  onChange: (c: TimeControl) => void;
}) {
  const t = useT();
  return (
    <>
      <Segmented
        label={t.timeControl}
        value={value}
        onChange={onChange}
        options={TIME_CONTROLS.map((c) => ({
          value: c,
          label: (
            <span className="inline-flex items-center gap-1">
              <Icon name={c === "relaxed" ? "relaxed" : c === "standard" ? "clock" : "blitz"} />
              {t.timeControls[c]}
            </span>
          ),
        }))}
      />
      <p className="-mt-2 text-xs text-stone-400">{t.timeControlHint[value]}</p>
    </>
  );
}
