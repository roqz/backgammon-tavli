import { type ReactNode, useEffect, useState } from "react";
import { Card } from "../components/ui";
import { useT } from "../i18n";
import { type LegalPage, loadOperator, OPERATOR, SOURCE_URL } from "../legal";
import { useSettings } from "../store/settings";
import { Page, ScreenTitle } from "./AppShell";

/** Imprint and privacy notice. Operator details come from the build (see legal.ts). */
export function LegalScreen({ page, onBack }: { page: LegalPage; onBack: () => void }) {
  const t = useT();
  // operator details from the server; re-render once they are there
  const [, setLoaded] = useState(false);
  useEffect(() => {
    void loadOperator().then(() => setLoaded(true));
  }, []);
  const lang = useSettings((s) => s.lang);
  return (
    <Page narrow>
      <ScreenTitle title={page === "imprint" ? t.imprint : t.privacy} onBack={onBack} />
      <Card className="flex flex-col gap-4 text-sm leading-relaxed text-stone-300 [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-stone-100">
        {page === "imprint" ? <Imprint lang={lang} /> : lang === "de" ? <PrivacyDe /> : <PrivacyEn />}
      </Card>
    </Page>
  );
}

function Operator() {
  const t = useT();
  if (!OPERATOR.name) return <p className="text-amber-200">{t.legalMissing}</p>;
  return (
    <address className="not-italic">
      {OPERATOR.name}
      {OPERATOR.address.map((l) => (
        <span key={l}>
          <br />
          {l}
        </span>
      ))}
      {OPERATOR.email && (
        <>
          <br />
          <a className="text-amber-300 underline" href={`mailto:${OPERATOR.email}`}>
            {OPERATOR.email}
          </a>
        </>
      )}
    </address>
  );
}

function Imprint({ lang }: { lang: "de" | "en" }) {
  return lang === "de" ? (
    <>
      <h2>Angaben gemäß § 5 DDG</h2>
      <Operator />
      <h2>Verantwortlich für den Inhalt</h2>
      <Operator />
      <h2>Quellcode</h2>
      <p>
        Diese App ist freie Software unter der GNU Affero General Public License 3.0. Der Quellcode:{" "}
        <Link href={SOURCE_URL}>{SOURCE_URL}</Link>
      </p>
    </>
  ) : (
    <>
      <h2>Operator</h2>
      <Operator />
      <h2>Source code</h2>
      <p>
        This app is free software under the GNU Affero General Public License 3.0. Source code:{" "}
        <Link href={SOURCE_URL}>{SOURCE_URL}</Link>
      </p>
    </>
  );
}

const Link = ({ href, children }: { href: string; children: ReactNode }) => (
  <a className="break-all text-amber-300 underline" href={href} target="_blank" rel="noreferrer noopener">
    {children}
  </a>
);

const hosting = (de: boolean) =>
  OPERATOR.hosting ??
  (de ? "einem gemieteten Server (Anbieter siehe Impressum)" : "a rented server (see imprint)");

function PrivacyDe() {
  return (
    <>
      <h2>Verantwortlicher</h2>
      <Operator />
      <h2>Kurz gesagt</h2>
      <p>
        Keine Werbung, kein Tracking, keine Analyse-Dienste, keine Cookies. Spiele gegen den Computer und am
        selben Gerät laufen komplett in deinem Browser – dabei wird nichts an einen Server geschickt.
      </p>
      <h2>Daten im Browser</h2>
      <p>
        Einstellungen, deine Spielstatistik, laufende Partien und – wenn du online spielst – dein
        Profil-Schlüssel werden im Speicher deines Browsers (localStorage) abgelegt. Du kannst sie jederzeit
        über die Browser-Einstellungen löschen.
      </p>
      <h2>Online-Spiel</h2>
      <p>Wenn du online spielst, verarbeitet der Spielserver:</p>
      <ul className="list-disc pl-5">
        <li>dein Profil: zufällige ID, Anzeigename, Zeitpunkt der Erstellung und letzten Aktivität;</li>
        <li>
          wenn du ein Konto anlegst: Benutzername, Passwort (nur als scrypt-Hash) und – freiwillig – deine
          E-Mail-Adresse;
        </li>
        <li>Anmeldesitzungen (als Hash, mit Zeitpunkten);</li>
        <li>
          Wiederherstellungscodes (nur als Hash, mit Zeitpunkt der Nutzung) und – wenn du die
          Zwei-Faktor-Anmeldung einschaltest – den geheimen Schlüssel deiner Authenticator-App;
        </li>
        <li>deinen Einladungscode für Freunde und deine Freundschaften;</li>
        <li>
          wenn du das Projekt unterstützt: Beginn und Ende des Unterstützer-Status, wann und wie lange er
          gewährt wurde (Code oder durch den Betreiber) und ob du in der Danke-Liste genannt werden möchtest.
          Das Herz neben deinem Namen ist für andere sichtbar, die Danke-Liste nur, wenn du sie einschaltest.
          Zahlungen laufen nicht über diese App, sondern über den verlinkten Anbieter und dessen
          Datenschutzbestimmungen;
        </li>
        <li>
          Ratings und das Archiv deiner Matches (Züge, Würfel, Ergebnisse) für Rangliste, Profil und
          Wiederholungen;
        </li>
        <li>Turnieranmeldungen und -ergebnisse;</li>
        <li>
          deinen Spielfortschritt: Erfolge, Tutorial, Tagesrätsel, Zähler (Spiele, Siege je Variante, beendete
          Fernpartien), erledigte Wochenaufgaben, eingetauschte Looks und die IDs der Freunde, die du
          herausgefordert hast – damit er auf allen Geräten gleich ist. Dein Clubrang ist für andere sichtbar;
        </li>
        <li>Meldungen, die du abgibst oder die über dich abgegeben werden, und Moderationsentscheidungen.</li>
      </ul>
      <p>
        Zweck ist die Bereitstellung des Online-Spiels, das du nutzen möchtest (Art. 6 Abs. 1 lit. b DSGVO).
        Dein Anzeigename, deine Ratings und deine Matches sind für andere Spieler sichtbar. Laufende
        öffentliche Matches können andere Spieler live ansehen, private Spiele nur Freunde – das kannst du im
        Profil abschalten. Freunde sehen, ob du online bist. Aus deinen Matches entstehen außerdem die
        Monatswertung (Rating-Gewinn im Monat, Podestplätze bleiben im Profil) und die Aktivitätsrangliste
        (Matches der letzten 30 Tage); dort erscheinst du nur, solange du das im Profil nicht ausschaltest.
        Dein öffentliches Profil zeigt Rahmen, Clubrang, den Monat deiner Anmeldung, Podestplätze und die
        Erfolge, die du selbst auswählst.
      </p>
      <h2>IP-Adresse</h2>
      <p>
        Deine IP-Adresse wird für die Verbindung und für Fairness-Prüfungen (z. B. keine gewerteten Matches
        zwischen Profilen aus demselben Netzwerk) nur im Arbeitsspeicher des Servers verarbeitet und nicht
        gespeichert (berechtigtes Interesse an fairem Spiel und Schutz vor Missbrauch, Art. 6 Abs. 1 lit. f
        DSGVO).
      </p>
      <h2>Fair-Play-Auswertung</h2>
      <p>
        Nach jedem Online-Match vergleicht der Server deine Zugentscheidungen mit einem Computergegner und
        misst, wie lange du für Züge brauchst. Daraus entstehen Hinweise für Moderatoren auf mögliche
        Computerhilfe; es gibt keine automatischen Strafen. Dir selbst zeigt die App daraus deine Genauigkeit;
        andere Spieler sehen sie nicht. Rechtsgrundlage ist das berechtigte Interesse an einem fairen Spiel
        (Art. 6 Abs. 1 lit. f DSGVO). Diese Daten werden nach 180 Tagen gelöscht.
      </p>
      <h2>Benachrichtigungen</h2>
      <p>
        Wenn du Benachrichtigungen einschaltest (Fernpartien, Herausforderungen, Freundschaftsanfragen,
        Turniermatches), speichert der Server die Push-Adresse deines Browsers und welche Arten von
        Benachrichtigungen du abgeschaltet hast. Benachrichtigungen laufen verschlüsselt über den Push-Dienst
        deines Browserherstellers (z. B. Google, Mozilla, Apple, Microsoft), der dabei Server auch außerhalb
        der EU nutzen kann. Ausschalten jederzeit unter Einstellungen → Benachrichtigungen.
      </p>
      <h2>Hosting</h2>
      <p>
        Der Server läuft bei {hosting(true)}. Die Datenbank wird täglich gesichert; Sicherungen werden nach 14
        Tagen gelöscht.
      </p>
      <h2>Speicherdauer</h2>
      <ul className="list-disc pl-5">
        <li>Gastprofile ohne gespielte Matches: 30 Tage nach der letzten Aktivität;</li>
        <li>Anmeldesitzungen: 90 Tage ohne Nutzung, höchstens 1 Jahr;</li>
        <li>Fair-Play-Daten: 180 Tage; erledigte Meldungen: 1 Jahr;</li>
        <li>Profil, Ratings und Matches: bis du dein Profil löschst.</li>
      </ul>
      <h2>Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
        Datenübertragbarkeit und Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen. Im
        Online-Profil kannst du alle Daten selbst herunterladen und dein Profil löschen. Außerdem kannst du
        dich bei einer Datenschutz-Aufsichtsbehörde beschweren.
      </p>
    </>
  );
}

function PrivacyEn() {
  return (
    <>
      <h2>Controller</h2>
      <Operator />
      <h2>In short</h2>
      <p>
        No ads, no tracking, no analytics, no cookies. Games against the computer and on one device run
        entirely in your browser – nothing is sent to a server.
      </p>
      <h2>Data in your browser</h2>
      <p>
        Settings, your statistics, games in progress and – when you play online – your profile key are kept in
        your browser's storage (localStorage). You can delete them in your browser settings at any time.
      </p>
      <h2>Online play</h2>
      <p>When you play online, the game server processes:</p>
      <ul className="list-disc pl-5">
        <li>your profile: random ID, display name, time of creation and last activity;</li>
        <li>
          if you create an account: username, password (only as a scrypt hash) and – optionally – your e-mail;
        </li>
        <li>login sessions (hashed, with timestamps);</li>
        <li>
          recovery codes (only as hashes, with the time they were used) and – if you turn on two-factor login
          – the secret key of your authenticator app;
        </li>
        <li>your invitation code for friends and your friendships;</li>
        <li>
          if you support the project: start and end of the supporter status, when and for how long it was
          granted (code or by the operator) and whether you want to be named in the thank-you list. The heart
          next to your name is visible to others, the thank-you list only if you turn it on. Payments do not
          run through this app but through the linked provider and its privacy terms;
        </li>
        <li>
          ratings and the archive of your matches (moves, dice, results) for ranking, profile and replays;
        </li>
        <li>tournament entries and results;</li>
        <li>
          your progress: achievements, tutorial, daily puzzles, counters (games, wins per variant, finished
          correspondence games), weekly tasks done, looks taken for tokens and the ids of friends you
          challenged – so it is the same on all devices. Your club rank is visible to others;
        </li>
        <li>reports you file or that are filed about you, and moderation decisions.</li>
      </ul>
      <p>
        The purpose is providing the online game you want to use (Art. 6(1)(b) GDPR). Your display name,
        ratings and matches are visible to other players. Running public matches can be watched live by other
        players, private games only by friends – you can turn that off in your profile. Friends see whether
        you are online. Your matches also make up the monthly ranking (rating gained in the month; podium
        places stay on your profile) and the activity ranking (matches of the last 30 days); you appear there
        unless you switch it off in your profile. Your public profile shows your frame, club rank, the month
        you joined, podium places and the achievements you choose yourself.
      </p>
      <h2>IP address</h2>
      <p>
        Your IP address is used for the connection and for fairness checks (e.g. no rated matches between
        profiles from the same network) in the server's memory only and is not stored (legitimate interest in
        fair play and abuse prevention, Art. 6(1)(f) GDPR).
      </p>
      <h2>Fair-play analysis</h2>
      <p>
        After each online match the server compares your move decisions with a computer player and measures
        how long you take to move. This gives moderators hints at possible computer assistance; there are no
        automatic penalties. The app also shows you your own accuracy from it; other players never see it. The
        legal basis is the legitimate interest in fair play (Art. 6(1)(f) GDPR). This data is deleted after
        180 days.
      </p>
      <h2>Notifications</h2>
      <p>
        If you turn on notifications (correspondence games, challenges, friend requests, tournament matches),
        the server stores your browser's push address and which kinds of notifications you switched off.
        Notifications are sent encrypted through the push service of your browser vendor (e.g. Google,
        Mozilla, Apple, Microsoft), which may use servers outside the EU. Turn them off at any time under
        Settings → Notifications.
      </p>
      <h2>Hosting</h2>
      <p>
        The server runs on {hosting(false)}. The database is backed up daily; backups are deleted after 14
        days.
      </p>
      <h2>Retention</h2>
      <ul className="list-disc pl-5">
        <li>guest profiles without any match: 30 days after the last activity;</li>
        <li>login sessions: 90 days without use, at most 1 year;</li>
        <li>fair-play data: 180 days; resolved reports: 1 year;</li>
        <li>profile, ratings and matches: until you delete your profile.</li>
      </ul>
      <h2>Your rights</h2>
      <p>
        You have the right of access, rectification, erasure, restriction, data portability and to object to
        processing based on legitimate interests. In your online profile you can download all your data and
        delete your profile yourself. You may also complain to a data protection supervisory authority.
      </p>
    </>
  );
}
