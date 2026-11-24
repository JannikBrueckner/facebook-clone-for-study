#!/usr/bin/env node
/* Erzeugt pro Fall fünf Screenshots und prüft sie.
   Aufruf (im Projektordner):  node scripts/screenshot.mjs [--case K22]
   Ausgabe flach in output/, z. B. output/K22_Post.png

   Dateien pro Fall:
     {id}_Post.png                       Nur Post (ohne Zusammenfassung, ohne Kommentare)
     {id}_A_Zusammenfassung_Kommentare.png   Zusammenfassung A + Kommentare
     {id}_B_Zusammenfassung_Kommentare.png   Zusammenfassung B + Kommentare
     {id}_C1_Kommentare.png              Nur Kommentare (ohne Post, ohne Zusammenfassung)
     {id}_C2_Post_Zusammenfassung.png    Post mit Zusammenfassung (ohne Kommentare) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Playwright lokal (npm install) oder global (NODE_PATH) auflösen
const { chromium } = createRequire(import.meta.url)('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'output');

const argCase = (() => { const i = process.argv.indexOf('--case'); return i > -1 ? process.argv[i + 1] : null; })();

/* Zuordnung Bedingung → Dateiname und Ausschnitt */
// pad: weißer Rand in CSS-Pixeln unter dem Ausschnitt. hide: Bereiche, die unter dem Ausschnitt
// liegen und für diese Aufnahme ausgeblendet werden (damit im Rand nur Weiß zu sehen ist).
const PAD = 16;
const SHOTS = [
  { cond: 'C1', name: 'Post',                          region: ['post'],               pad: PAD, hide: ['summary', 'comments'] },
  { cond: 'A',  name: 'A_Zusammenfassung_Kommentare',  region: ['summary', 'comments'], pad: 0,   hide: [] },
  { cond: 'B',  name: 'B_Zusammenfassung_Kommentare',  region: ['summary', 'comments'], pad: 0,   hide: [] },
  { cond: 'C1', name: 'C1_Kommentare',                 region: ['comments'],           pad: 0,   hide: [] },
  { cond: 'C2', name: 'C2_Post_Zusammenfassung',       region: ['post', 'summary'],    pad: PAD, hide: [] },
];

/* ---------- Hinweis zur Schrift ---------- */
if (process.platform !== 'darwin') {
  console.log('\n⚠  HINWEIS: Die Schrift-Kette beginnt mit -apple-system / "SF Pro Text".');
  console.log('   Diese iOS-Schrift gibt es nur auf macOS. Auf diesem System (' + process.platform + ') wird eine Ersatzschrift');
  console.log('   (Helvetica/Arial-Ersatz) verwendet. Finale Screenshots für das Experiment bitte auf macOS erzeugen.\n');
} else {
  console.log('\nHinweis: Screenshots werden nur auf macOS mit der echten iOS-Systemschrift (SF Pro) gerendert – das ist hier der Fall.\n');
}

/* ---------- kleiner statischer Server (fetch() funktioniert nicht unter file://) ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cases.json'), 'utf8'));
const caseIds = Object.keys(data.cases).filter((k) => !argCase || k === argCase);
if (!caseIds.length) { console.error('Kein passender Fall gefunden.'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const words = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'light',
  locale: 'de-DE',
});
const page = await context.newPage();

let failed = false;
const missingAll = new Set();

/* Ausschnitt in Seitenkoordinaten (Vereinigung der Bereiche plus weißer Rand unten).
   Seitenkoordinaten statt Viewport-Koordinaten, weil frühere Element-Screenshots die Seite scrollen. */
async function regionBox(names, pad) {
  return page.evaluate(([names, pad]) => {
    const rects = names.map((n) => document.querySelector(`[data-shot="${n}"]`)).filter(Boolean)
      .map((e) => { const r = e.getBoundingClientRect(); return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY }; });
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return { x: 0, y: top, width: 390, height: bottom - top + pad };
  }, [names, pad]);
}

for (const id of caseIds) {
  const hashes = { post: {}, comments: {} };
  const counts = {};

  // Alte Unterordner-Ausgabe dieses Falls entfernen
  fs.rmSync(path.join(OUT, id), { recursive: true, force: true });

  for (const shot of SHOTS) {
    await page.goto(`${BASE}/index.html?case=${encodeURIComponent(id)}&cond=${shot.cond}`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });
    const err = await page.evaluate(() => document.body.dataset.error || null);
    if (err) { console.error(`✗ ${id}/${shot.cond}: ${err}`); failed = true; continue; }

    (await page.evaluate(() => document.body.dataset.missing || '')).split(', ').filter(Boolean).forEach((m) => missingAll.add(m));
    // Prüfwerte: Post und Kommentare einzeln als Elementbild. Sie werden vor den Ausgabebildern
    // aufgenommen, weil ein Ganzseiten-Screenshot die Rasterung der Elemente danach verändern kann.
    hashes.post[shot.cond] = sha(await page.locator('[data-shot="post"]').screenshot());
    if (shot.cond !== 'C2') {
      hashes.comments[shot.cond] = sha(await page.locator('[data-shot="comments"]').screenshot());
    }
    const file = path.join(OUT, `${id}_${shot.name}.png`);
    if (shot.region.length === 1 && shot.pad === 0) {
      await page.locator(`[data-shot="${shot.region[0]}"]`).screenshot({ path: file });
    } else {
      if (shot.pad > 0) {
        // Alles unter dem Ausschnitt ausblenden (inkl. Home-Indicator), Rand bleibt weiß
        await page.evaluate(([hide, pad]) => {
          hide.forEach((n) => document.querySelectorAll(`[data-shot="${n}"]`).forEach((e) => { e.style.display = 'none'; }));
          document.querySelectorAll('.home-indicator-wrap').forEach((e) => { e.style.display = 'none'; });
          document.getElementById('app').style.paddingBottom = pad + 'px';
        }, [shot.hide, shot.pad]);
      }
      const clip = await regionBox(shot.region, shot.pad);
      await page.screenshot({ path: file, fullPage: true, clip });
    }
    console.log(`  ${id} → output/${id}_${shot.name}.png`);

    counts[shot.name] = await page.evaluate(() => ({
      // Like- und Kommentarzahl dürfen nirgends sichtbar sein
      counterVisible: !!document.querySelector('.reactions') ||
        /\b\d+\s+Kommentare?\b/.test(document.body.innerText),
      rendered: document.querySelectorAll('.comments .comment').length,
      summaryPresent: !!document.querySelector('[data-shot="summary"]'),
    }));
  }

  /* ---------- Prüfungen ---------- */
  if (missingAll.size) { console.log(`\n⚠ Platzhalter statt Bilddatei: ${[...missingAll].join(', ')}`); missingAll.clear(); }
  console.log(`\n=== Prüfung ${id} ===`);
  // 1. Post identisch in allen Bedingungen (A, B, C1, C2)
  {
    const vals = Object.values(hashes.post);
    const ok = vals.length === 4 && vals.every((v) => v === vals[0]);
    if (!ok) failed = true;
    console.log(`${ok ? '✓' : '✗'} Post in A/B/C1/C2 pixelgleich`);
  }
  // 2. Kommentare identisch in A, B, C1
  {
    const vals = Object.values(hashes.comments);
    const ok = vals.length === 3 && vals.every((v) => v === vals[0]);
    if (!ok) failed = true;
    console.log(`${ok ? '✓' : '✗'} Kommentarbereich in A/B/C1 pixelgleich`);
  }
  // 3. Wortzahl der Zusammenfassungen
  const s = data.cases[id].summary || {};
  const wA = words(s.A), wB = words(s.B);
  console.log(`${wA === wB ? '✓' : '⚠'} Zusammenfassung Wörter: A=${wA}, B=${wB}` + (wA === wB ? '' : '  WARNUNG: ungleiche Länge'));
  // 4. Kommentare, Zähler, Zusammenfassung je Bedingung
  const n = data.cases[id].comments.length;
  const expect = {
    'A_Zusammenfassung_Kommentare': { rendered: n, summary: true },
    'B_Zusammenfassung_Kommentare': { rendered: n, summary: true },
    'C1_Kommentare': { rendered: n, summary: false },
    'C2_Post_Zusammenfassung': { rendered: 0, summary: true },
    'Post': { rendered: n, summary: false }, // selbe Seite wie C1, nur der Post wird gespeichert
  };
  for (const [name, c] of Object.entries(counts)) {
    const e = expect[name];
    const ok = c.rendered === e.rendered && c.summaryPresent === e.summary && !c.counterVisible;
    if (!ok) failed = true;
    console.log(`${ok ? '✓' : '✗'} ${name}: ${c.rendered}/${e.rendered} Kommentare, Zusammenfassung ${c.summaryPresent ? 'da' : 'fehlt'}, Like-/Kommentarzahl ${c.counterVisible ? 'SICHTBAR' : 'nicht sichtbar'}`);
  }
  // 5. optional: Kontrollangaben (Positionen, Mehrheit/Minderheit) gegen die Kommentare prüfen
  const k = data.cases[id].kontrolle;
  if (k) {
    const cm = data.cases[id].comments;
    const posOk = cm.every((c, i) => c.pos == null || c.pos === i + 1);
    const pro = cm.filter((c) => c.seite === 'dafür'), contra = cm.filter((c) => c.seite === 'dagegen');
    // Minderheit = die Seite mit weniger Kommentaren (je nach Fall dafür oder dagegen)
    const minPos = (pro.length <= contra.length ? pro : contra).map((c) => c.pos).join(',');
    const ok = posOk && pro.length === k.befuerwortend && contra.length === k.ablehnend &&
      minPos === (k.minderheit_positionen || []).join(',');
    if (!ok) failed = true;
    console.log(`${ok ? '✓' : '✗'} Kontrolle: dafür=${pro.length} (soll ${k.befuerwortend}), dagegen=${contra.length} (soll ${k.ablehnend}), ` +
      `Minderheit an Pos. ${minPos} (soll ${(k.minderheit_positionen || []).join(',')})${posOk ? '' : ', ✗ pos passt nicht zur Array-Reihenfolge'}`);
  }
  console.log('');
}

await browser.close();
server.close();
console.log(failed ? '✗ Mindestens eine Prüfung ist fehlgeschlagen.' : '✓ Alle Prüfungen bestanden.');
process.exit(failed ? 1 : 0);
