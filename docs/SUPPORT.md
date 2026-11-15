# Projekt unterstützen (Unterstützer-Modell)

Vorbild ist Lichess: Das Spiel ist vollständig und bleibt für alle frei – Regeln, Gegner, Analyse,
Online-Spiel, Turniere, Clubs. Unterstützer bekommen ausschließlich **sichtbaren Dank**, nie einen
spielerischen Vorteil.

Einstieg in der App: **Profil → Projekt unterstützen**.

**Standardmäßig aus:** Solange am Spielserver kein `SUPPORT_URL` gesetzt ist, zeigt die App nichts
davon – keinen Menüpunkt, kein Brett und keinen Rahmen „Mäzen“, kein Herz, keinen Admin-Reiter. Die
Schnittstellen zum Einlösen und Verwalten antworten dann mit 404, `GET /api/support` mit
`enabled: false`. Schon vergebener Status bleibt gespeichert und wird sichtbar, sobald die
Unterstützung konfiguriert ist.

## Was Unterstützer bekommen

| Dank                | Sichtbar für    | Technik                                                               |
| ------------------- | --------------- | --------------------------------------------------------------------- |
| Messing-Herz ♥      | alle (online)   | `supporter: true` in `PublicPlayer`, `FriendView`, `LeaderboardEntry` |
| Rahmen „Mäzen“ 💛   | alle (online)   | `FRAMES.patron = "supporter"`; der Server prüft den aktiven Status    |
| Brett „Mäzen“       | nur sich selbst | `REWARDS.style.patron = SUPPORTER`, freigeschaltet über `useUnlocked` |
| Name in Danke-Liste | alle            | nur mit Einwilligung (`supporter_public`, Schalter auf der Seite)     |

Alles gilt, **solange** die Unterstützung läuft. Danach fällt das Brett auf „Klassisch“ zurück, der
Rahmen lässt sich nicht mehr wählen, das Herz verschwindet. Erfolge, Fortschritt und Ratings bleiben
unberührt.

## Wie Unterstützung zustande kommt

In der App laufen **keine Zahlungen** – kein Zahlungsanbieter, keine Bankdaten, keine Steuerlogik im
Code. Der Betreiber verlinkt eine externe Seite (Ko-fi, Liberapay, GitHub Sponsors, PayPal.me …) und
vergibt den Status auf einem von zwei Wegen:

1. **Codes** (empfohlen): Im Admin-Bereich (`?admin`, Reiter „Unterstützer“) Codes erzeugen – Anzahl,
   Dauer (1/3/6/12 Monate oder dauerhaft), Notiz. Die Codes erscheinen **nur einmal** (der Server
   speichert Hashes) und gehen z. B. als Dankesnachricht an die Spender. Wer einen Code hat, löst ihn
   auf der Unterstützen-Seite ein (ein Gastprofil genügt). Jeder Code gilt einmal.
2. **Von Hand**: Im selben Reiter Benutzername oder Spieler-ID eingeben, Dauer wählen, „Freischalten“.

Verlängerungen zählen ab dem Ende der laufenden Zeit, nichts verfällt durch frühes Einlösen.
„Dauerhaft“ bleibt dauerhaft. „Beenden“ setzt das Ende auf jetzt (z. B. nach einer Rückbuchung); das
Protokoll der Gewährungen bleibt erhalten.

## Konfiguration (Spielserver)

| Variable               | Bedeutung                                                    |
| ---------------------- | ------------------------------------------------------------ |
| `SUPPORT_URL`          | externe Seite für Unterstützung; schaltet die Funktion ein   |
| `SUPPORT_MONTHLY_COST` | laufende Kosten in Euro pro Monat, zur Transparenz angezeigt |
| `ADMIN_TOKEN`          | wird für Codes und Freischaltungen gebraucht (Admin-Bereich) |

Beispiel (`deploy/.env`):

```
SUPPORT_URL=https://ko-fi.com/deinname
SUPPORT_MONTHLY_COST=8
```

## Schnittstellen

| Methode und Pfad                     | Wer        | Zweck                                                   |
| ------------------------------------ | ---------- | ------------------------------------------------------- |
| `GET /api/support`                   | öffentlich | Link, Kosten, Anzahl aktiver Unterstützer, Danke-Liste  |
| `POST /api/account/supporter/redeem` | Profil     | Code einlösen → Kontodaten mit `supporter`              |
| `POST /api/account/supporter/public` | Profil     | in der Danke-Liste nennen oder nicht                    |
| `GET /api/admin/supporters`          | Admin      | Unterstützer mit Gewährungen, Zahl offener Codes        |
| `POST /api/admin/supporters`         | Admin      | `{ player, months, note }` freischalten (0 = dauerhaft) |
| `POST /api/admin/supporters/revoke`  | Admin      | `{ playerId }` beenden                                  |
| `POST /api/admin/supporter-codes`    | Admin      | `{ count, months, note }` → `{ codes }`                 |

Code: `apps/server/src/supporters.ts`, Oberfläche `apps/web/src/screens/SupportScreen.tsx`,
Admin `SupportView` in `AdminScreen.tsx`. Tests: `apps/server/test/supporters.test.ts`,
`apps/web/e2e/support.spec.ts`.

## Datenschutz

Gespeichert werden Beginn und Ende des Status, die Gewährungen (Dauer, Quelle, Notiz, Zeitpunkt) und
die Einwilligung zur Danke-Liste. Das steht in der Datenschutzerklärung und im Datenexport. Beim
Löschen des Profils endet der Status, die Notizen der Gewährungen werden geleert. Zahlungsdaten
kommen nie in die App – sie liegen beim verlinkten Anbieter.

## Grundsätze

- Kein Pay-to-win, keine Werbung, keine Bezahlschranke – auch nicht „light“.
- Dank ist sichtbar, aber dezent (ein kleines Herz, kein Glitzern).
- Die Danke-Liste ist Opt-in.
- Transparenz: Kosten und Zahl der Unterstützer stehen auf der Seite.
