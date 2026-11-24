# Design-Notizen

## Nutzung

```bash
npm install                 # einmalig, installiert Playwright
npx playwright install chromium
node scripts/screenshot.mjs # alle Fälle × A/B/C → output/{case}/{cond}/
node scripts/screenshot.mjs --case K37
```

Zum Ansehen im Browser einen lokalen Server starten (unter `file://` darf `fetch()` die JSON-Datei nicht laden):
`python3 -m http.server 8000`, danach `http://localhost:8000/index.html?case=K37&cond=B` öffnen.

Fehlt das Bild unter `image`, erscheint ein grauer 4:3-Platzhalter mit dem Dateinamen.

## Abgleich mit Referenz

In `reference/` lagen beim Bau keine Screenshots. Deshalb gab es keinen Abgleich und keine
iterative Anpassung an die echte App. Alle Werte entsprechen der Vorgabe, bis auf die Punkte unten.
Sobald Referenzbilder vorliegen, kann der Abgleich mit `output/K37/B/full.png` nachgeholt werden.

## Abweichungen von der Vorgabe

| Stelle | Vorgabe | Umsetzung | Grund |
|---|---|---|---|
| Bildhöhe | `aspect-ratio: 4/3` | feste Höhe `293px` (4:3 von 390 px = 292,5 px) | Durch die halbe Pixelzeile lag alles darunter auf Halbpixeln. Kanten wurden unscharf, und die Hashes von `comments.png` wichen zwischen A/B/C leicht ab. |
| Kommentarbereich | – | `will-change: transform` auf `[data-shot="comments"]` | Weichzeichner (`blur`) werden sonst abhängig von der vertikalen Position gerastert. Mit Zusammenfassung (A/B) und ohne (C) unterschieden sich einzelne Pixel. Als eigene Ebene sind die Screenshots in A/B/C pixelgleich. |
| Sprechblase | – | `overflow: hidden` | Der weichgezeichnete Name (`blur(5px)`) würde sonst über den Blasenrand hinaus streuen. |
| Pseudo-Profilbild | radialer Verlauf aus zwei Farben mit `blur(3px)` | aus `seed` berechnetes Schema-Foto (Einzelporträt in verschiedenen Ausschnitten, Paar, Landschaft, Haustier oder Blume) mit `blur(3.5px)`. Das Canvas ragt 20 % über den Kreis hinaus. | Auf Wunsch geändert: Der reine Verlauf wirkte wie ein Farbfleck, ein Mosaik als Zwischenlösung war zu einheitlich. Jetzt variieren die Motive stark, und die Unschärfe entspricht der der Namen. Die Berechnung ist rein arithmetisch (`putImageData`) und daher bitgenau reproduzierbar. Der Überstand verhindert einen hellen Blur-Saum am Rand. |
| Reaktionszeile (Punkt 6) | Like-Icon, `reactionCount`, „{n} Kommentare“ | entfernt | Auf Wunsch: Like- und Kommentarzahl sollen nicht sichtbar sein. `reactionCount` in `cases.json` wird nicht mehr verwendet. Prüfung 3 im Skript kontrolliert jetzt, dass alle Kommentare gerendert sind und nirgends ein Zähler erscheint. |
| Funkel-Icon (KI-Zusammenfassung) | Stern mit vier Zacken, Verlauf #0866FF → #A033FF, 18 px | Ring (Kreis, 3,2 px Strichstärke, gleicher Verlauf), 18 px | Auf Wunsch geändert, angelehnt an die Optik von Meta AI. Die Form ist ein eigener, einfacher Ring und keine Kopie des Meta-Logos. |
| Erwähnungen in Kommentaren | nicht vorgesehen | Text im Format `@[Name]` wird automatisch erkannt. „@“ und Name werden zusammen mit `blur(5px)` weichgezeichnet, in voller Länge und in Blau (#0866FF, halbfett). Die Klammern entfallen. | Auf Wunsch ergänzt. Das Blau folgt dem Erwähnungsstil von Facebook. Die Erkennung läuft im Renderer, die Daten müssen also nicht angepasst werden. |
| Trennlinie über der Aktionsleiste | „Trennlinie darüber“ | entfällt | Auf Wunsch entfernt. Ohne Reaktionszeile schließt die Aktionsleiste direkt ans Bild an. Die Linie unter der Aktionsleiste bleibt. |

## Nicht vorgegebene Werte (frei gewählt)

- Statusleiste: Uhrzeit und Icons jeweils in einem 130 px breiten Bereich links und rechts zentriert, 6 px nach unten versetzt (entspricht den „Ohren“ neben der Notch).
- App-Kopfzeile: Chevron 24 px, 8 px vom linken Rand. Lupe 24 px, 12 px vom rechten Rand.
- Post-Kopf: 8 px zwischen Avatar und Name, Zeilenhöhe Name 20 px und Unterzeile 16 px. Globus 12 px.
- Absätze im Post-Text: 20 px Abstand (eine Leerzeile).
- Aktionsleiste: Icons 20 px, 6 px Abstand zum Text.
- Kommentare: Meta-Zeile 4 px unter der Blase, Zeilenhöhe Name 16 px.
- Kommentarfeld: 16 px Abstand zum letzten Kommentar, 8 px zwischen Avatar und Feld, Text mit 12 px Innenabstand.
- Home-Indicator: 13 px Abstand oben, 8 px unten (wie vorgegeben).
- Pseudo-Profilbilder: PRNG `mulberry32(seed)` wählt Motiv (58 % Einzelporträt, 12 % Paar, 12 % Landschaft, 10 % Haustier, 8 % Blume), Hintergrund (Innenraum, draußen, Bokeh, einfarbig), Hautton, Frisur (kurz, lang, Glatze, Mütze), Brille, Bart, Oberteil, Ausschnitt (Selfie bis Halbtotale), Helligkeit, Farbtemperatur und in 10 % der Fälle Schwarz-Weiß. Canvas 48 × 48 px mit 3 × 3-Supersampling.
- Die Kommentarzahl lautet bei genau einem Kommentar „1 Kommentar“.

## Post-Format „Linkvorschau“ (löst die Bildhöhe 4:3 aus der Vorgabe ab)

- **Seite global:** `page` (Name, Avatar-Datei) steht auf oberster Ebene in `cases.json`. Initialen und Farbe entfallen. Name und Avatar sind nicht unscharf. Fehlt `assets/images/page-avatar.png`, erscheint ein grauer Kreis mit „?“, und das Skript warnt.
- **Post-Kopf:** „{postTime} · Globus“ mit dem vorgegebenen SVG (12 px, `currentColor`, vertikal zentriert).
- **Linkvorschau:** `linkPreview` (image, domain, headline) ersetzt `image`. Bild 1,91:1 über die volle Breite, als feste Höhe 204 px (390 / 1,91 = 204,2; ganze Pixel halten die Hashes stabil). Darunter ein Block #F0F2F5 mit 12 px Innenabstand: Domain in Großbuchstaben (12 px, #65676B), Headline (16 px / 20 px, 600, #050505, höchstens zwei Zeilen mit „…“), kein Beschreibungstext.
- **Migration:** K22 und K41 sind übernommen. Fehlendes steht als Platzhalter da: `[HEADLINE FEHLT]`, Domain `ARLSBURGER-RUNDSCHAU.DE` aus deinem Beispiel, Bilder aus den bisherigen Pfaden (K41: `k41.jpg` fehlt noch, wird als grauer Platzhalter mit Dateinamen gezeigt).
- **Erwähnungen:** `@[Name]` erscheint ohne „@“ und ohne Klammern, blau und halbfett mit `blur(5px)` wie die Kommentarnamen.
- **KI-Karte:** Überschrift „Was andere dazu sagen“ (kleines „a“).

### Abweichungen zu einem echten Facebook-Post mit Linkvorschau (nur festgestellt, nicht angepasst)

Ein echter Post lag nicht vor (`reference/` ist leer). Der Vergleich beruht auf meiner Kenntnis der mobilen Ansicht.

1. Die Aktionsleiste schließt direkt an den grauen Block an. In der App liegen dazwischen die Reaktionszeile und eine Trennlinie. Beides ist laut Vorgabe entfernt.
2. Headline-Gewicht 600 statt eines kräftigeren Fettschnitts. In der App ist die Headline semibold. „Fett“ in deiner Beschreibung könnte auch 700 meinen.
3. Die Domain ist hier 12 px ohne Buchstabenabstand. In der App wirkt sie oft etwas größer und leicht gesperrt.
4. Die Linkvorschau hat keinen feinen Rand und keine Rundung. In der App gibt es bei manchen Posts einen sehr hellen Rand um die Karte.
5. In einem echten Linkpost steht die URL meist als Text im Post. Das ist hier nicht vorgesehen und fehlt.
6. Die Schrift ist unter Linux Inter und nicht SF Pro. Zeilenumbrüche und Textbreiten weichen deshalb ab.
7. Der Seiten-Avatar ist ein Platzhalter („?“), bis `page-avatar.png` vorliegt.

## Statusleiste entfernt

Die iOS-Statusleiste (47 px, Uhrzeit und Icons) entfällt auf Wunsch. Die Seite und `*_Post.png` beginnen jetzt mit der App-Kopfzeile.

## Screenshot-Ausschnitte

- `*_Post.png` und `*_C2_Post_Zusammenfassung.png` enden mit 16 px weißem Rand unter dem Inhalt (Home-Indicator und alles darunter sind dafür ausgeblendet).
- `*_A/B_Zusammenfassung_Kommentare.png` reichen von der Oberkante der Karte bis zum Kommentarfeld. `*_C1_Kommentare.png` ist unverändert.
- Ausschnitte werden in Seitenkoordinaten berechnet. Mit Viewport-Koordinaten verrutschten sie, sobald vorher ein Element-Screenshot die Seite gescrollt hatte.

## Screenshots auf einem Mac erzeugen (GitHub Actions)

`.github/workflows/screenshots.yml` startet einen macOS-Runner, installiert Playwright und führt `node scripts/screenshot.mjs` aus. Das Ergebnis liegt als Artifact „screenshots“ (Zip) auf der Seite des Laufs. Start über Actions → Screenshots → Run workflow. Auf macOS verwendet Chromium die Systemschrift (SF Pro) und Apple Color Emoji.

## Ausgabeformat JPEG

Die Screenshots werden als JPEG gespeichert (`output/{Fall}_{Name}.jpg`). Das Skript wählt pro Datei die höchste Qualität (95 bis 50), bei der die Datei unter 1 MB (1.000.000 Byte) bleibt, und gibt Größe und Qualität in der Konsole aus. Die Pixelprüfungen (Post und Kommentare in allen Bedingungen identisch) laufen weiter intern auf verlustfreien Aufnahmen. Die JPEGs selbst sind wegen der Kompression nicht bitgenau vergleichbar.
