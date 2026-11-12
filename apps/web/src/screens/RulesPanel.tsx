import { useState } from "react";
import { Drawer } from "../components/Drawer";
import { Button } from "../components/ui";
import { useT } from "../i18n";
import { RULES, RULES_TOPICS, type RulesTopic } from "../rules";
import { useSettings } from "../store/settings";

/** The rule book: one chapter per variant plus basics and app notes. */
export function RulesPanel({ initial = "general" }: { initial?: RulesTopic }) {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const [topic, setTopic] = useState<RulesTopic>(initial);
  const chapters = RULES[lang];
  const chapter = chapters[topic];
  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-1.5" aria-label={t.chapters}>
        {RULES_TOPICS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === topic}
            onClick={() => setTopic(k)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              k === topic
                ? "border-amber-400 bg-amber-400/15 text-amber-200"
                : "border-stone-700 text-stone-300 hover:border-stone-500"
            }`}
          >
            {chapters[k].label}
          </button>
        ))}
      </nav>
      <article className="flex flex-col gap-4">
        <p className="text-stone-300">{chapter.intro}</p>
        {chapter.sections.map((s) => (
          <section key={s.title} className="rounded-2xl border border-stone-800 bg-stone-900/70 px-4 py-3">
            <h3 className="mb-2 font-semibold text-amber-100">{s.title}</h3>
            {s.paragraphs?.map((p) => (
              <p key={p} className="mb-2 text-sm leading-relaxed text-stone-300">
                {p}
              </p>
            ))}
            {s.bullets && (
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-stone-300 marker:text-amber-500/70">
                {s.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </article>
    </div>
  );
}

/** Rule book over the running game, opened at the chapter of the current variant. */
export function RulesDrawer({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: RulesTopic;
}) {
  const t = useT();
  return (
    <Drawer open={open} onClose={onClose} title={`📖 ${t.rules}`} closeLabel={t.close}>
      {open && <RulesPanel initial={initial} />}
    </Drawer>
  );
}

export function RulesScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack} className="px-3" aria-label={t.back}>
          ←
        </Button>
        <h1 className="text-2xl font-bold text-amber-100">📖 {t.rules}</h1>
      </div>
      <RulesPanel />
    </div>
  );
}
