/* Rendert einen Fall aus data/cases.json.
   Aufruf: index.html?case=K37&cond=A   (cond: A | B | C)
   Wenn alles gezeichnet ist (inkl. Bild/Platzhalter und Schriften),
   wird <body data-ready="1"> gesetzt – darauf wartet das Screenshot-Skript. */
(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const caseId = params.get('case') || 'K37';
  const cond = (params.get('cond') || 'A').toUpperCase();

  /* ---------- deterministische Pseudo-Profilbilder ----------
     Aus dem seed wird ein schematisches „Profilfoto“ berechnet (Einzelporträt,
     Paar, Landschaft, Haustier oder Blume, mit variablem Ausschnitt, Licht und
     Farbstimmung). Das Motiv wird mit Supersampling in ein Canvas geschrieben
     und per CSS weichgezeichnet (siehe .pavatar in style.css). Die Berechnung
     ist rein arithmetisch und deshalb in allen Bedingungen bitgenau gleich. */
  const AV_PX = 48;      // Canvas-Auflösung
  const AV_PAD = 0.2;    // Canvas ragt 20 % über den sichtbaren Kreis hinaus (für den Blur-Rand)
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const mix = (a, b, t) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t);
  const clamp01 = (t) => Math.min(1, Math.max(0, t));
  const inE = (x, y, ex, ey, rx, ry) => ((x - ex) / rx) ** 2 + ((y - ey) / ry) ** 2 <= 1;

  const SKIN = [[245, 214, 190], [236, 192, 160], [214, 162, 124], [186, 132, 96], [140, 94, 64], [98, 66, 46], [228, 186, 156]];
  const HAIR = [[30, 24, 20], [58, 40, 28], [96, 66, 40], [142, 100, 60], [196, 160, 104], [222, 200, 150], [150, 150, 150], [210, 210, 210], [140, 60, 40]];
  const TOP = [[40, 52, 84], [170, 36, 44], [236, 236, 234], [36, 36, 40], [74, 120, 84], [214, 160, 60], [110, 150, 200], [150, 90, 130], [230, 120, 90], [90, 90, 96]];
  const WALL = [[226, 222, 214], [196, 204, 212], [160, 150, 140], [80, 84, 92], [238, 232, 220], [190, 170, 150], [120, 136, 120], [60, 50, 50], [214, 196, 200]];
  const SKY = [[120, 168, 222], [170, 200, 236], [236, 180, 140], [200, 210, 220], [90, 120, 170], [250, 214, 160]];
  const GROUND = [[86, 128, 70], [130, 150, 90], [214, 196, 150], [60, 110, 150], [110, 100, 90], [240, 240, 244], [70, 90, 60]];
  const FUR = [[230, 220, 200], [190, 140, 80], [120, 80, 50], [40, 36, 34], [150, 150, 150], [210, 160, 100]];
  const PETAL = [[230, 70, 90], [250, 200, 60], [240, 240, 240], [180, 90, 200], [250, 130, 60]];

  function background(r) {
    const kind = r();
    const a = pick(r, WALL), b = pick(r, WALL);
    if (kind < 0.35) {                       // Innenraum: Wand + Fläche/Möbel
      const h = 0.55 + r() * 0.3, split = r() < 0.5;
      return (x, y) => (split && x > h ? b : mix(a, b, clamp01(y * 0.4)));
    }
    if (kind < 0.7) {                        // draußen: Himmel/Bäume
      const s = pick(r, SKY), g = pick(r, GROUND), hz = 0.35 + r() * 0.4;
      return (x, y) => (y < hz ? mix(s, [255, 255, 255], clamp01(0.3 - y * 0.3)) : mix(g, [30, 40, 30], clamp01((y - hz) * 0.6)));
    }
    if (kind < 0.85) {                       // Bokeh / unruhig
      const pts = [0, 1, 2, 3].map(() => [r() * 1.2 - 0.1, r() * 1.2 - 0.1, 0.12 + r() * 0.25, pick(r, [...WALL, ...SKY, ...GROUND])]);
      return (x, y) => { for (const [px, py, pr, c] of pts) if (inE(x, y, px, py, pr, pr)) return c; return a; };
    }
    return () => a;                          // einfarbig
  }

  function person(r, cx, cy, sc) {
    const skin = pick(r, SKIN), hair = pick(r, HAIR), top = pick(r, TOP);
    const style = r();                       // 0–.4 kurz, .4–.75 lang, .75–.88 Glatze/sehr kurz, Rest Mütze
    const glasses = r() < 0.22, hat = pick(r, TOP), beard = r() < 0.18;
    const fx = 0.17 * sc, fy = 0.21 * sc;
    return (x, y) => {
      if (inE(x, y, cx, cy + 0.64 * sc, 0.5 * sc, 0.36 * sc)) return top;
      if (style > 0.4 && style < 0.75 && inE(x, y, cx, cy + 0.1 * sc, fx * 1.3, fy * 1.4) && y > cy - 0.05 * sc) return hair;
      if (Math.abs(x - cx) < 0.07 * sc && y > cy && y < cy + 0.34 * sc) return skin;
      if (inE(x, y, cx, cy, fx, fy)) {
        if (style >= 0.88 && y < cy - fy * 0.35) return hat;
        if (style < 0.75 && y < cy - fy * 0.5) return hair;
        if (glasses && Math.abs(y - (cy - fy * 0.08)) < fy * 0.13) return [30, 30, 34];
        if (beard && y > cy + fy * 0.35) return hair;
        return skin;
      }
      if (style >= 0.88 && inE(x, y, cx, cy - fy * 0.45, fx * 1.15, fy * 0.75)) return hat;
      if (style < 0.75 && inE(x, y, cx, cy - 0.04 * sc, fx * 1.12, fy * 1.08) && y < cy + 0.02) return hair;
      return null;
    };
  }

  function scene(seed) {
    const r = mulberry32(Number(seed) * 7919 + 17);
    const kind = r();
    const bg = background(r);
    let layers = [];
    if (kind < 0.58) {                                      // Einzelporträt, vom Selfie bis Halbtotale
      const sc = 0.7 + r() * 0.85;
      layers.push(person(r, 0.32 + r() * 0.36, 0.3 + r() * 0.2 + (sc - 1) * 0.08, sc));
    } else if (kind < 0.7) {                                // Paar
      const sc = 0.65 + r() * 0.25;
      layers.push(person(r, 0.3, 0.42 + r() * 0.06, sc), person(r, 0.7, 0.4 + r() * 0.08, sc * (0.9 + r() * 0.15)));
    } else if (kind < 0.82) {                               // Landschaft, evtl. kleine Person
      const s = pick(r, SKY), g = pick(r, GROUND), hz = 0.4 + r() * 0.3, m = r() < 0.6, mh = 0.15 + r() * 0.25, mx = r();
      const sun = r() < 0.4;
      layers.push((x, y) => {
        if (sun && inE(x, y, 0.75, 0.25, 0.09, 0.09)) return [255, 236, 190];
        if (m && y < hz && y > hz - mh * (1 - Math.abs(x - mx) * 2.2)) return mix(g, [90, 96, 110], 0.6);
        if (y < hz) return mix(s, [255, 255, 255], clamp01(y / hz * 0.5));
        return mix(g, [20, 30, 20], clamp01((y - hz) * 0.8));
      });
      if (r() < 0.4) layers.unshift(person(r, 0.3 + r() * 0.4, hz + 0.05, 0.3));
    } else if (kind < 0.92) {                               // Haustier
      const f = pick(r, FUR), cx = 0.4 + r() * 0.2, cy = 0.5 + r() * 0.1, sc = 0.9 + r() * 0.5;
      layers.push((x, y) => {
        if (inE(x, y, cx - 0.18 * sc, cy - 0.22 * sc, 0.08 * sc, 0.14 * sc) || inE(x, y, cx + 0.18 * sc, cy - 0.22 * sc, 0.08 * sc, 0.14 * sc)) return mix(f, [0, 0, 0], 0.25);
        if (inE(x, y, cx, cy, 0.26 * sc, 0.24 * sc)) return inE(x, y, cx, cy + 0.08 * sc, 0.08 * sc, 0.06 * sc) ? mix(f, [255, 255, 255], 0.4) : f;
        if (inE(x, y, cx, cy + 0.45 * sc, 0.4 * sc, 0.3 * sc)) return f;
        return null;
      });
    } else {                                                // Blume / Objekt
      const p = pick(r, PETAL), cx = 0.4 + r() * 0.2, cy = 0.4 + r() * 0.2, sc = 0.8 + r() * 0.6;
      layers.push((x, y) => {
        if (inE(x, y, cx, cy, 0.09 * sc, 0.09 * sc)) return [240, 190, 40];
        const d = Math.hypot(x - cx, y - cy), a = Math.atan2(y - cy, x - cx);
        if (d < 0.3 * sc * (0.65 + 0.35 * Math.abs(Math.cos(a * 3)))) return p;
        return null;
      });
    }
    // Licht und Farbstimmung
    const bright = 0.78 + r() * 0.4, warm = (r() - 0.5) * 30, gray = r() < 0.1;
    return (x, y) => {
      let c = null;
      for (const L of layers) { c = L(x, y); if (c) break; }
      if (!c) c = bg(x, y);
      // Vignette
      const v = 1 - 0.18 * clamp01(Math.hypot(x - 0.5, y - 0.5) - 0.2);
      let [R, G, B] = c.map((k) => k * bright * v);
      R += warm; B -= warm;
      if (gray) { const l = 0.3 * R + 0.59 * G + 0.11 * B; R = G = B = l; }
      return [R, G, B];
    };
  }

  function pseudoAvatar(host, seed) {
    host.innerHTML = '';
    const f = scene(seed);
    const cv = document.createElement('canvas');
    cv.width = AV_PX; cv.height = AV_PX;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(AV_PX, AV_PX);
    const SS = 3, span = 1 + 2 * AV_PAD;
    for (let py = 0; py < AV_PX; py++) {
      for (let px = 0; px < AV_PX; px++) {
        const acc = [0, 0, 0];
        for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
          const c = f(-AV_PAD + (px + (sx + 0.5) / SS) / AV_PX * span, -AV_PAD + (py + (sy + 0.5) / SS) / AV_PX * span);
          acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
        }
        const o = (py * AV_PX + px) * 4;
        for (let k = 0; k < 3; k++) img.data[o + k] = Math.max(0, Math.min(255, Math.round(acc[k] / (SS * SS))));
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    host.appendChild(cv);
  }

  /* ---------- Hilfsfunktionen ---------- */
  const $all = (k) => document.querySelectorAll(`[data-bind="${k}"]`);
  const setText = (k, v) => $all(k).forEach((el) => { el.textContent = v; });
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  function fail(msg) {
    document.getElementById('app').innerHTML = '';
    document.getElementById('app').appendChild(el('div', 'render-error', msg));
    document.body.dataset.error = msg;
    document.body.dataset.ready = '1';
  }

  /* Kommentartext. Erwähnungen im Format @[Name] werden automatisch erkannt:
     Der Name wird ohne "@" und ohne Klammern hervorgehoben (blau, halbfett) und
     wie die Kommentatoren-Namen weichgezeichnet, in voller Länge gerendert. */
  const MENTION = /@\[([^\]\n]+)\]/g;
  function commentText(text) {
    const box = el('div', 'c-text');
    let last = 0, m;
    const src = String(text || '');
    MENTION.lastIndex = 0;
    while ((m = MENTION.exec(src))) {
      if (m.index > last) box.appendChild(document.createTextNode(src.slice(last, m.index)));
      box.appendChild(el('span', 'c-mention', m[1]));
      last = m.index + m[0].length;
    }
    if (last < src.length) box.appendChild(document.createTextNode(src.slice(last)));
    return box;
  }

  // Dateien, die nicht geladen werden konnten (es erscheint ein Platzhalter)
  const missing = [];

  function renderAvatar(box, src) {
    return new Promise((resolve) => {
      box.innerHTML = '';
      box.classList.remove('is-placeholder');
      const placeholder = () => {
        box.innerHTML = '';
        box.classList.add('is-placeholder');
        box.textContent = '?';
        missing.push(src || '(Profilbild)');
        resolve();
      };
      if (!src) return placeholder();
      const img = new Image();
      img.alt = '';
      img.onload = () => { box.appendChild(img); resolve(); };
      img.onerror = placeholder;
      img.src = src;
    });
  }

  function renderMedia(container, src) {
    return new Promise((resolve) => {
      container.innerHTML = '';
      const name = (src || '').split('/').pop() || '(kein Bild)';
      const placeholder = () => {
        missing.push(src || '(Linkvorschau-Bild)');
        container.innerHTML = '';
        container.appendChild(el('div', 'img-placeholder', name));
        resolve();
      };
      if (!src) return placeholder();
      const img = new Image();
      img.alt = '';
      img.onload = () => { container.appendChild(img); resolve(); };
      img.onerror = placeholder;
      img.src = src;
    });
  }

  async function main() {
    if (!['A', 'B', 'C1', 'C2'].includes(cond)) return fail(`Unbekannte Bedingung "${cond}" – erlaubt: A, B, C1, C2.`);

    let data;
    try {
      const res = await fetch('data/cases.json', { cache: 'no-store' });
      data = await res.json();
    } catch (e) {
      return fail('data/cases.json konnte nicht geladen werden. Seite über einen lokalen Server öffnen, z. B. "python3 -m http.server" im Projektordner.');
    }
    const c = data.cases && data.cases[caseId];
    if (!c) return fail(`Fall "${caseId}" nicht in data/cases.json gefunden.`);

    document.title = `${caseId} / ${cond}`;
    const comments = Array.isArray(c.comments) ? c.comments : [];

    // Kopf: Seite ist für alle Fälle gleich (oberste Ebene der JSON)
    const pg = data.page;
    if (!pg || !pg.name) return fail('data/cases.json: "page" (name, avatar) fehlt auf oberster Ebene.');
    const lp = c.linkPreview || {};
    setText('pageName', pg.name);
    document.querySelectorAll('.verified').forEach((v) => { v.toggleAttribute('hidden', !pg.verified); });
    setText('postTime', c.postTime);

    // Text: Absätze aus \n\n, einfache Umbrüche bleiben erhalten (pre-line)
    $all('postText').forEach((box) => {
      box.innerHTML = '';
      String(c.postText || '').split(/\n\s*\n/).forEach((p) => box.appendChild(el('p', null, p)));
    });


    // Zusammenfassung
    // A/B: Zusammenfassung mit Kommentaren. C1: keine Zusammenfassung (nur Kommentare).
    // C2: Zusammenfassung ohne Kommentare. Nutzt die proportionale Fassung (summary.B),
    // die den kleineren befürwortenden Teil ausdrücklich nennt.
    const summary = document.querySelector('[data-shot="summary"]');
    if (cond === 'C1') {
      summary.remove();
    } else {
      const txt = c.summary && c.summary[cond === 'C2' ? 'B' : cond];
      if (txt == null) return fail(`Fall "${caseId}" hat keine Zusammenfassung für Bedingung ${cond}.`);
      setText('summaryText', txt);
      summary.hidden = false;
    }

    // Kommentare
    const list = document.querySelector('[data-bind="comments"]');
    list.innerHTML = '';
    comments.forEach((cm) => {
      const row = el('div', 'comment');
      const av = el('div', 'pavatar');
      pseudoAvatar(av, cm.seed);
      const body = el('div', 'comment-body');
      const bubble = el('div', 'bubble');
      bubble.appendChild(el('div', 'c-name', cm.name));
      bubble.appendChild(commentText(cm.text));
      const meta = el('div', 'c-meta');
      meta.appendChild(el('span', null, cm.time));
      meta.appendChild(el('span', null, 'Gefällt mir'));
      meta.appendChild(el('span', null, 'Antworten'));
      body.appendChild(bubble);
      body.appendChild(meta);
      row.appendChild(av);
      row.appendChild(body);
      list.appendChild(row);
    });

    // C2: keine Kommentare (Bereich inkl. Kommentarfeld entfällt)
    if (cond === 'C2') document.querySelector('[data-shot="comments"]').remove();

    // Kommentarfeld
    $all('viewerAvatar').forEach((a) => pseudoAvatar(a, data.viewerAvatarSeed));

    // Linkvorschau
    setText('lpDomain', lp.domain || '[DOMAIN FEHLT]');
    setText('lpHeadline', lp.headline || '[HEADLINE FEHLT]');

    // Profilbild der Seite und Bild der Linkvorschau
    await Promise.all([
      ...[...$all('pageAvatar')].map((a) => renderAvatar(a, pg.avatar)),
      ...[...$all('media')].map((m) => renderMedia(m, lp.image)),
    ]);
    document.body.dataset.missing = missing.join(', ');

    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    document.body.dataset.ready = '1';
  }

  main().catch((e) => fail('Fehler beim Rendern: ' + e.message));
})();
