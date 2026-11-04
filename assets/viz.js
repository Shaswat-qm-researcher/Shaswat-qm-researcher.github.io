/* Live figures. Every widget reads its colours from the CSS theme tokens,
   redraws on theme change, and only animates while it is on screen.
   Physics notes are next to each widget. No dependencies. */
(function () {
  'use strict';

  var RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var TAU = Math.PI * 2;

  /* ------------------------------------------------------------ colours */
  var P = {};
  function v(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function readP() {
    P.ink = v('--ink'); P.ink2 = v('--ink-2'); P.muted = v('--muted'); P.faint = v('--faint');
    P.line = v('--line'); P.line2 = v('--line-2'); P.accent = v('--accent'); P.warm = v('--warm');
    P.surface = v('--surface'); P.surface2 = v('--surface-2'); P.bg = v('--bg'); P.ok = v('--ok');
    P.accentSoft = v('--accent-soft');
    P.dark = rgb(P.bg).reduce(function (a, b) { return a + b; }, 0) < 300;
  }
  function rgb(h) {
    h = (h || '#000').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(h, a) { var c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(h1, h2, t) {
    var a = rgb(h1), b = rgb(h2);
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }
  function mixA(h1, h2, t) { var a = rgb(h1), b = rgb(h2); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var MONO = '500 11px "JetBrains Mono", ui-monospace, Consolas, monospace';
  var MONO_S = '400 10.5px "JetBrains Mono", ui-monospace, Consolas, monospace';
  var SERIF = function (px) { return '500 ' + px + 'px "Newsreader", Georgia, serif'; };

  /* ------------------------------------------------------------ canvas sizing */
  function fit(cv, hOf, keepCss) {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.max(200, Math.round(cv.clientWidth || cv.parentNode.clientWidth));
    var h = Math.round(keepCss ? cv.clientHeight : hOf(w));
    if (!keepCss) cv.style.height = h + 'px';
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c: c, w: w, h: h };
  }

  /* ------------------------------------------------------------ animation manager */
  var widgets = [], raf = 0, last = 0;
  function register(w) {
    widgets.push(w);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es.forEach(function (e) { w.visible = e.isIntersecting; if (w.visible) kick(); }); }, { rootMargin: '80px' }).observe(w.el);
    } else w.visible = true;
  }
  function loop(t) {
    raf = 0;
    var dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
    var any = false;
    widgets.forEach(function (w) { if (w.visible && w.animating()) { w.tick(t / 1000, dt); any = true; } });
    if (any && !document.hidden) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
  var rz = 0;
  window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { widgets.forEach(function (w) { w.resize && w.resize(); w.draw(); }); }, 120); });
  document.addEventListener('themechange', function () { readP(); widgets.forEach(function (w) { w.theme && w.theme(); w.draw(); }); });

  /* small plotting helpers */
  function axes(c, x0, y0, x1, y1) { c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0, y1); c.lineTo(x1, y1); c.stroke(); }
  /* text with optional _sub / ^sup markup: "Θ_D", "C_{v}", "m^{-2}" */
  function text(c, s, x, y, col, font, align, base) {
    font = font || MONO;
    if (!/[_^]/.test(s)) { c.fillStyle = col; c.font = font; c.textAlign = align || 'left'; c.textBaseline = base || 'alphabetic'; c.fillText(s, x, y); return; }
    var segs = [], buf = '', i = 0;
    while (i < s.length) {
      var ch = s[i];
      if ((ch === '_' || ch === '^') && i + 1 < s.length) {
        if (buf) { segs.push([buf, 0]); buf = ''; }
        var m = ch === '_' ? 1 : 2;
        if (s[i + 1] === '{') { var j = s.indexOf('}', i + 2); segs.push([s.slice(i + 2, j), m]); i = j + 1; }
        else { segs.push([s[i + 1], m]); i += 2; }
        continue;
      }
      buf += ch; i++;
    }
    if (buf) segs.push([buf, 0]);
    var px = parseFloat((/(\d+(\.\d+)?)px/.exec(font) || [0, 11])[1]);
    var small = font.replace(/(\d+(\.\d+)?)px/, (px * 0.76).toFixed(1) + 'px'), w = 0;
    segs.forEach(function (g) { c.font = g[1] ? small : font; w += c.measureText(g[0]).width; });
    var x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    c.fillStyle = col; c.textAlign = 'left'; c.textBaseline = base || 'alphabetic';
    segs.forEach(function (g) { c.font = g[1] ? small : font; c.fillText(g[0], x0, y + (g[1] === 1 ? px * 0.3 : g[1] === 2 ? -px * 0.4 : 0)); x0 += c.measureText(g[0]).width; });
  }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  /* ================================================================== HERO
     Triangular 2D lattice carrying a superposition of a longitudinal and a
     transverse acoustic plane wave (chain dispersion omega = 2c/a sin(ka/2), c_T = 0.6 c_L), plus
     radial wave packets launched on click. Bonds are tinted by strain. */
  function Hero(cv) {
    var self = { el: cv, visible: false }, S = null, pulses = [], nextAuto = 3.5, t0 = performance.now() / 1000;
    var SPR = null;
    function sprites(rr) {     // 10 tint levels, rebuilt on theme or size change
      var key = rr + '|' + P.ink2 + P.accent + P.dark;
      if (SPR && SPR.key === key) return SPR;
      var dpr = Math.min(2, window.devicePixelRatio || 1), half = rr + 1, px = Math.ceil(2 * half * dpr), list = [];
      for (var k = 0; k < 10; k++) {
        var oc = document.createElement('canvas'); oc.width = oc.height = px;
        var g2 = oc.getContext('2d'), col = mix(P.ink2, P.accent, k / 9), s = px / (2 * half);
        g2.scale(s, s);
        var g = g2.createRadialGradient(half - rr * 0.4, half - rr * 0.4, rr * 0.1, half, half, rr);
        g.addColorStop(0, mix(col, '#ffffff', P.dark ? 0.35 : 0.55)); g.addColorStop(1, col);
        g2.fillStyle = g; g2.beginPath(); g2.arc(half, half, rr, 0, TAU); g2.fill();
        list.push(oc);
      }
      SPR = { key: key, list: list, half: half };
      return SPR;
    }
    function build() {
      var f = fit(cv, null, true), w = f.w, h = f.h, a = clamp(w / 15, 24, 38);
      var cols = Math.ceil(w / a) + 4, rows = Math.ceil(h / (a * 0.866)) + 4, atoms = [], bonds = [];
      for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) atoms.push([(i - 2) * a + (j % 2) * a / 2, (j - 2) * a * 0.866]);
      var id = function (i, j) { return j * cols + i; };
      for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
        if (i + 1 < cols) bonds.push([id(i, j), id(i + 1, j)]);
        if (j + 1 < rows) {
          if (j % 2 === 0) { if (i - 1 >= 0) bonds.push([id(i, j), id(i - 1, j + 1)]); bonds.push([id(i, j), id(i, j + 1)]); }
          else { bonds.push([id(i, j), id(i, j + 1)]); if (i + 1 < cols) bonds.push([id(i, j), id(i + 1, j + 1)]); }
        }
      }
      var cL = 9 * a / 4.2;                               // sound speed, px per second
      var kL = TAU / (9 * a), kT = TAU / (14 * a), th = 58 * Math.PI / 180;
      var disp = function (c_, k) { return 2 * c_ / a * Math.sin(k * a / 2); }; // nearest-neighbour chain dispersion
      S = { w: w, h: h, a: a, atoms: atoms, bonds: bonds, cL: cL,
        modes: [
          { kx: kL, ky: 0, ex: 1, ey: 0, A: 0.17 * a, w: disp(cL, kL), ph: 0 },
          { kx: kT * Math.cos(th), ky: kT * Math.sin(th), ex: -Math.sin(th), ey: Math.cos(th), A: 0.14 * a, w: disp(0.6 * cL, kT), ph: 1.3 }
        ], ux: new Float32Array(atoms.length), uy: new Float32Array(atoms.length) };
    }
    self.resize = build;
    self.animating = function () { return !RM; };
    self.tick = function (t) {
      var tt = t - t0;
      if (tt > nextAuto) { pulses.push({ x: S.w * (0.25 + 0.5 * Math.random()), y: S.h * (0.2 + 0.5 * Math.random()), t: tt }); nextAuto = tt + 6 + 3 * Math.random(); }
      self.draw(tt);
    };
    self.draw = function (tt) {
      if (!S || Math.round(cv.clientWidth) !== S.w || Math.round(cv.clientHeight) !== S.h) build();
      if (tt === undefined) tt = RM ? 2.0 : performance.now() / 1000 - t0;
      var f = fit(cv, null, true), c = f.c, a = S.a, A = S.atoms, ux = S.ux, uy = S.uy;
      c.clearRect(0, 0, S.w, S.h);
      pulses = pulses.filter(function (p) { return tt - p.t < 5; });
      for (var n = 0; n < A.length; n++) {
        var x = A[n][0], y = A[n][1], dx = 0, dy = 0;
        for (var m = 0; m < 2; m++) { var M = S.modes[m], s = M.A * Math.cos(M.kx * x + M.ky * y - M.w * tt + M.ph); dx += M.ex * s; dy += M.ey * s; }
        for (var q = 0; q < pulses.length; q++) {
          var p = pulses[q], rx = x - p.x, ry = y - p.y, r = Math.sqrt(rx * rx + ry * ry) + 1e-6, age = tt - p.t;
          var g = 0.34 * a * Math.exp(-Math.pow((r - 4.2 * a * age) / (0.9 * a), 2)) * Math.exp(-age / 1.6);
          dx += g * rx / r; dy += g * ry / r;
        }
        ux[n] = dx; uy[n] = dy;
      }
      // bonds, tinted by strain: blue = stretched, orange = compressed
      c.lineWidth = 1.3; c.lineCap = 'round';
      for (var b = 0; b < S.bonds.length; b++) {
        var i = S.bonds[b][0], j = S.bonds[b][1];
        var x1 = A[i][0] + ux[i], y1 = A[i][1] + uy[i], x2 = A[j][0] + ux[j], y2 = A[j][1] + uy[j];
        var L = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)), st = (L - a) / a;
        c.strokeStyle = st > 0 ? rgba(P.accent, clamp(0.14 + st * 4.5, 0.14, 0.9)) : rgba(P.warm, clamp(0.14 - st * 4.5, 0.14, 0.9));
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      }
      // atoms: pre-rendered shaded spheres, tinted by displacement amplitude
      var rr = clamp(a * 0.15, 3.4, 5.6), spr = sprites(rr), half = spr.half;
      for (n = 0; n < A.length; n++) {
        var u = clamp(Math.sqrt(ux[n] * ux[n] + uy[n] * uy[n]) / (0.32 * a), 0, 1);
        c.drawImage(spr.list[Math.round(u * (spr.list.length - 1))], A[n][0] + ux[n] - half, A[n][1] + uy[n] - half, 2 * half, 2 * half);
      }
      // soft vignette into the card surface, plus clean bands for the labels
      var gr = c.createRadialGradient(S.w * 0.5, S.h * 0.46, Math.min(S.w, S.h) * 0.22, S.w * 0.5, S.h * 0.5, Math.max(S.w, S.h) * 0.66);
      gr.addColorStop(0, rgba(P.surface, 0)); gr.addColorStop(1, rgba(P.surface, 0.96));
      c.fillStyle = gr; c.fillRect(0, 0, S.w, S.h);
      var gt = c.createLinearGradient(0, 0, 0, 64); gt.addColorStop(0, rgba(P.surface, 0.98)); gt.addColorStop(1, rgba(P.surface, 0));
      c.fillStyle = gt; c.fillRect(0, 0, S.w, 64);
      var gb = c.createLinearGradient(0, S.h - 96, 0, S.h); gb.addColorStop(0, rgba(P.surface, 0)); gb.addColorStop(0.55, rgba(P.surface, 0.94)); gb.addColorStop(1, rgba(P.surface, 1));
      c.fillStyle = gb; c.fillRect(0, S.h - 96, S.w, 96);
      // dispersion inset: omega = c|k| for LA and TA, with the two excited modes marked
      var iw = 92, ih = 58, ix = S.w - iw - 34, iy = 22;
      c.fillStyle = rgba(P.surface, 0.94); roundRect(c, ix - 10, iy - 10, iw + 44, ih + 22, 8); c.fill(); c.strokeStyle = P.line2; c.lineWidth = 1; c.stroke();
      c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.moveTo(ix, iy); c.lineTo(ix, iy + ih); c.lineTo(ix + iw, iy + ih); c.stroke();
      var kMax = Math.PI / a, IX = function (k) { return ix + k / kMax * iw; }, wMax = 2.15 * S.cL / a, IY = function (w) { return iy + ih - w / wMax * ih; };
      c.lineWidth = 1.4;
      c.strokeStyle = P.accent; c.beginPath(); c.moveTo(IX(0), IY(0)); for (var k = 0; k <= 20; k++) { var kk = kMax * k / 20; c.lineTo(IX(kk), IY(S.cL * 2 / a * Math.sin(kk * a / 2))); } c.stroke();
      c.strokeStyle = P.warm; c.beginPath(); c.moveTo(IX(0), IY(0)); for (k = 0; k <= 20; k++) { kk = kMax * k / 20; c.lineTo(IX(kk), IY(0.6 * S.cL * 2 / a * Math.sin(kk * a / 2))); } c.stroke();
      [[S.modes[0], P.accent], [S.modes[1], P.warm]].forEach(function (d) { var km = Math.sqrt(d[0].kx * d[0].kx + d[0].ky * d[0].ky); c.fillStyle = d[1]; c.beginPath(); c.arc(IX(km), IY(d[0].w), 3, 0, TAU); c.fill(); });
      text(c, 'ω(k)', ix + 4, iy + 9, P.faint, MONO_S);
      text(c, 'LA', ix + iw + 3, IY(S.cL * 2 / a) + 6, P.accent, MONO_S);
      text(c, 'TA', ix + iw + 3, IY(0.6 * S.cL * 2 / a) + 4, P.warm, MONO_S);
    };
    cv.addEventListener('pointerdown', function (e) {
      var r = cv.getBoundingClientRect(), tt = performance.now() / 1000 - t0;
      pulses.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: tt }); nextAuto = tt + 9;
      if (RM) { self.draw(tt + 0.8); }
      kick();
    });
    register(self);
    return self;
  }

  /* ================================================================== PLASMON
     Spectra: normalised Lorentzians with Gamma = 0.165 eV centred at the local
     quasistatic resonance  E_L = hbar*omega_p / sqrt(3) = 1.905 eV  and at the
     hydrodynamic one  E_L + DeltaE(R),  DeltaE = 384.17/R + 4.91 meV  (BEM fit).
     Map: quasistatic |E/E0|^2 of a Drude sphere (hbar*omega_p = 3.3 eV,
     hbar*gamma = 0.165 eV, eps_inf = 1, vacuum) at the local resonance. */
  function Plasmon(cv) {
    var root = cv.closest('.viz'), rIn = root.querySelector('[data-r]'), rOut = root.querySelector('[data-ro]');
    var oE = root.querySelector('[data-e]'), oL = root.querySelector('[data-l]'), oD = root.querySelector('[data-de]'), play = root.querySelector('[data-play]');
    var self = { el: cv, visible: false }, playing = !RM, R = 6, map = null, tStart = performance.now() / 1000;
    var WP = 3.3, G = 0.165, EL = WP / Math.sqrt(3);
    // complex Drude permittivity at the local resonance, and alpha' = (eps-1)/(eps+2)
    var w = EL, den = (w * w) * (w * w) + (w * G) * (w * G);                // |w(w+iG)|^2
    var epsR = 1 - WP * WP * (w * w) / den, epsI = WP * WP * (w * G) / den;  // 1 - wp^2/(w(w+iG))
    var nr = epsR - 1, ni = epsI, dr = epsR + 2, di = epsI, dd = dr * dr + di * di;
    var aR = (nr * dr + ni * di) / dd, aI = (ni * dr - nr * di) / dd;       // alpha'
    var inR = 3 * dr / dd, inI = -3 * di / dd;                              // 3/(eps+2)
    function dE(r) { return (384.17 / r + 4.91) / 1000; }
    var PEAK = Math.pow(1 + 2 * aR, 2) + Math.pow(2 * aI, 2);              // |E/E0|^2 at the poles
    function buildMap() {
      var n = 140, L = 1.9, img = new ImageData(n, n), d = img.data;
      var lo = mixA(P.surface2, P.surface2, 0), c1 = mixA(P.surface2, P.accent, 0.55), c2 = rgb(P.accent), c3 = rgb(P.warm);
      for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) {
        var X = (i + 0.5) / n * 2 * L - L, Y = (j + 0.5) / n * 2 * L - L, r2 = X * X + Y * Y, I;
        if (r2 < 1) I = inR * inR + inI * inI;
        else {
          var r = Math.sqrt(r2), r3 = r2 * r, fx = (3 * X * X / r2 - 1) / r3, fy = (3 * X * Y / r2) / r3;
          var exr = 1 + aR * fx, exi = aI * fx, eyr = aR * fy, eyi = aI * fy;
          I = exr * exr + exi * exi + eyr * eyr + eyi * eyi;
        }
        var s = clamp(Math.pow(I / PEAK, 0.35), 0, 1), col;
        if (s < 0.45) { var u = s / 0.45; col = [lo[0] + (c1[0] - lo[0]) * u, lo[1] + (c1[1] - lo[1]) * u, lo[2] + (c1[2] - lo[2]) * u]; }
        else if (s < 0.8) { u = (s - 0.45) / 0.35; col = [c1[0] + (c2[0] - c1[0]) * u, c1[1] + (c2[1] - c1[1]) * u, c1[2] + (c2[2] - c1[2]) * u]; }
        else { u = (s - 0.8) / 0.2; col = [c2[0] + (c3[0] - c2[0]) * u, c2[1] + (c3[1] - c2[1]) * u, c2[2] + (c3[2] - c2[2]) * u]; }
        var k = (j * n + i) * 4; d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
      }
      var oc = document.createElement('canvas'); oc.width = n; oc.height = n; oc.getContext('2d').putImageData(img, 0, 0);
      var b0 = d.slice(0, 3);   // far-field colour, used to fill around the scaled map
      map = { cv: oc, L: L, bg: 'rgb(' + b0[0] + ',' + b0[1] + ',' + b0[2] + ')', peak: Math.pow(1 + 2 * aR, 2) + Math.pow(2 * aI, 2) };
    }
    self.theme = function () { map = null; };
    self.animating = function () { return playing; };
    self.tick = function (t) {
      var tt = t - tStart, u = 0.5 - 0.5 * Math.cos(TAU * tt / 13);
      R = Math.exp(Math.log(15) * (1 - u));                    // 15 nm -> 1 nm -> 15 nm
      rIn.value = R.toFixed(1); self.draw(tt);
    };
    self.draw = function (tt) {
      if (!map) buildMap();
      if (tt === undefined) tt = performance.now() / 1000 - tStart;
      var f = fit(cv, function (w) { return w < 560 ? w * 1.5 : clamp(w * 0.44, 300, 410); }), c = f.c, W = f.w, H = f.h;
      c.clearRect(0, 0, W, H);
      var narrow = W < 560, s = narrow ? Math.min(W - 40, H * 0.46) : Math.min(H - 56, W * 0.38);
      var mx = narrow ? (W - s) / 2 : 22, my = narrow ? 14 : (H - s) / 2 - 6;
      // --- near-field map
      // true scale: the box spans 2 x 1.9 x 15 nm; the sphere (and its quasi-static field, which scales with R) grow with R
      var RMAX = 15, kS = R / RMAX, cx = mx + s / 2, cy = my + s / 2, rad = s / (2 * map.L) * kS, ms = s * kS;
      c.save(); roundRect(c, mx, my, s, s, 10); c.clip(); c.fillStyle = map.bg; c.fillRect(mx, my, s, s);
      c.imageSmoothingEnabled = true; c.drawImage(map.cv, cx - ms / 2, cy - ms / 2, ms, ms); c.restore();
      var gg = c.createRadialGradient(cx - rad * 0.35, cy - rad * 0.4, rad * 0.08, cx, cy, rad);
      gg.addColorStop(0, '#fbe7a6'); gg.addColorStop(0.45, '#d9a93f'); gg.addColorStop(1, '#8a6417');
      c.fillStyle = gg; c.beginPath(); c.arc(cx, cy, rad, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(90,64,12,0.55)'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, rad, 0, TAU); c.stroke();
      if (rad > 16) text(c, 'Au', cx, cy + 5, 'rgba(60,40,5,0.7)', SERIF(Math.max(13, rad * 0.32)), 'center');
      // oscillating surface charge, band thickness = 0.1 nm cover layer relative to R
      var phase = TAU * 0.55 * tt, amp = Math.cos(phase), band = clamp(rad * 0.1 / R, 1.2, rad * 0.5);
      for (var q = 0; q < 96; q++) {
        var a0 = q / 96 * TAU, a1 = (q + 1) / 96 * TAU, sig = Math.cos((a0 + a1) / 2) * amp;
        c.strokeStyle = sig > 0 ? rgba(P.warm, clamp(Math.abs(sig), 0.05, 1)) : rgba(P.accent, clamp(Math.abs(sig), 0.05, 1));
        c.lineWidth = band; c.beginPath(); c.arc(cx, cy, rad - band / 2, a0, a1 + 0.01); c.stroke();
      }
      text(c, '+', cx + (amp > 0 ? 1 : -1) * (rad + 12), cy + 4, amp > 0 ? P.warm : P.accent, '600 14px Inter, sans-serif', 'center');
      text(c, '−', cx - (amp > 0 ? 1 : -1) * (rad + 12), cy + 4, amp > 0 ? P.accent : P.warm, '600 14px Inter, sans-serif', 'center');
      // E0 arrow
      c.strokeStyle = P.ink2; c.fillStyle = P.ink2; c.lineWidth = 1.4;
      var ay = my + s - 16; c.beginPath(); c.moveTo(mx + 14, ay); c.lineTo(mx + 46, ay); c.stroke();
      c.beginPath(); c.moveTo(mx + 46, ay); c.lineTo(mx + 40, ay - 4); c.lineTo(mx + 40, ay + 4); c.closePath(); c.fill();
      text(c, 'E₀', mx + 52, ay + 4, P.ink2, MONO);
      var nmpx = s / (2 * map.L * RMAX), sbx = mx + s - 14 - 10 * nmpx;   // 10 nm scale bar
      c.strokeStyle = P.ink2; c.lineWidth = 2; c.beginPath(); c.moveTo(sbx, ay); c.lineTo(sbx + 10 * nmpx, ay); c.stroke();
      text(c, '10 nm', sbx + 5 * nmpx, ay - 7, P.ink2, MONO_S, 'center');
      text(c, 'R = ' + R.toFixed(1) + ' nm', mx + 12, my + 20, P.ink, MONO);
      text(c, '|E/E₀|² ≤ ' + Math.round(map.peak), mx + s - 12, my + 20, P.ink2, MONO_S, 'right');
      // --- spectrum
      var px0, py0, px1, py1;
      if (narrow) { px0 = 44; px1 = W - 18; py0 = my + s + 46; py1 = H - 34; }
      else { px0 = mx + s + 58; px1 = W - 22; py0 = 34; py1 = H - 40; }
      var e0 = 1.6, e1 = 2.6, X = function (e) { return px0 + (e - e0) / (e1 - e0) * (px1 - px0); }, Y = function (y) { return py1 - y * (py1 - py0) * 0.62; };
      axes(c, px0, py0, px1, py1);
      for (var e = 1.6; e <= 2.61; e += 0.2) { var xx = X(e); c.strokeStyle = P.line2; c.beginPath(); c.moveTo(xx, py0); c.lineTo(xx, py1); c.stroke(); text(c, e.toFixed(1), xx, py1 + 16, P.muted, MONO_S, 'center'); }
      text(c, 'photon energy (eV)', (px0 + px1) / 2, py1 + 31, P.muted, MONO_S, 'center');
      [750, 650, 550, 500].forEach(function (lam) { var xx = X(1239.84 / lam); c.strokeStyle = P.line; c.beginPath(); c.moveTo(xx, py0); c.lineTo(xx, py0 - 4); c.stroke(); text(c, lam + '', xx, py0 - 8, P.faint, MONO_S, 'center'); });
      text(c, 'λ (nm)', px1, py0 - 8, P.faint, MONO_S, 'right');
      c.save(); c.translate(px0 - 14, (py0 + py1) / 2); c.rotate(-Math.PI / 2); text(c, 'extinction (norm.)', 0, 0, P.muted, MONO_S, 'center'); c.restore();
      var ENL = EL + dE(R), lor = function (E, E0) { var z = (E - E0) / (G / 2); return 1 / (1 + z * z); };
      // filled hydrodynamic
      c.beginPath(); c.moveTo(X(e0), Y(0));
      for (var k = 0; k <= 240; k++) { var E = e0 + (e1 - e0) * k / 240; c.lineTo(X(E), Y(lor(E, ENL))); }
      c.lineTo(X(e1), Y(0)); c.closePath(); c.fillStyle = rgba(P.accent, 0.12); c.fill();
      c.beginPath(); for (k = 0; k <= 240; k++) { E = e0 + (e1 - e0) * k / 240; var yy = Y(lor(E, ENL)); k ? c.lineTo(X(E), yy) : c.moveTo(X(E), yy); }
      c.strokeStyle = P.accent; c.lineWidth = 2; c.stroke();
      c.beginPath(); for (k = 0; k <= 240; k++) { E = e0 + (e1 - e0) * k / 240; yy = Y(lor(E, EL)); k ? c.lineTo(X(E), yy) : c.moveTo(X(E), yy); }
      c.setLineDash([5, 4]); c.strokeStyle = P.ink2; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]);
      // shift arrow
      var yA = Y(1) - 12; c.strokeStyle = P.warm; c.fillStyle = P.warm; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(X(EL), yA); c.lineTo(X(ENL), yA); c.stroke();
      if (X(ENL) - X(EL) > 8) { c.beginPath(); c.moveTo(X(ENL), yA); c.lineTo(X(ENL) - 6, yA - 4); c.lineTo(X(ENL) - 6, yA + 4); c.closePath(); c.fill(); }
      text(c, 'ΔE = ' + Math.round(dE(R) * 1000) + ' meV', X(ENL) + 10, yA + 4, P.warm, MONO, 'left');
      text(c, 'local', X(EL - 0.105), Y(0.42), P.ink2, MONO_S, 'right');
      text(c, 'hydrodynamic', X(ENL + 0.105), Y(0.42), P.accent, MONO_S, 'left');
      // legend (top right)
      (function () {
        var font = '500 12px Inter, sans-serif', l1 = 'Classical prediction', l2 = 'Quantum corrections';
        c.font = font; var tw = Math.max(c.measureText(l1).width, c.measureText(l2).width), bw = tw + 46, bh = 46;
        var bx = px1 - bw - 4, by = py0 + 8;
        c.fillStyle = rgba(P.surface, 0.94); roundRect(c, bx, by, bw, bh, 8); c.fill(); c.strokeStyle = P.line2; c.lineWidth = 1; c.stroke();
        c.setLineDash([5, 4]); c.strokeStyle = P.ink2; c.lineWidth = 1.5; c.beginPath(); c.moveTo(bx + 10, by + 15); c.lineTo(bx + 34, by + 15); c.stroke(); c.setLineDash([]);
        c.strokeStyle = P.accent; c.lineWidth = 2; c.beginPath(); c.moveTo(bx + 10, by + 33); c.lineTo(bx + 34, by + 33); c.stroke();
        text(c, l1, bx + 40, by + 19, P.ink2, font); text(c, l2, bx + 40, by + 37, P.accent, font);
      })();
      // inset: blueshift vs 1/R (sits in the band above the peaks)
      var iw = narrow ? 96 : 116, ih = Math.min(46, (py1 - py0) * 0.2), ix = px0 + 34, iy = py0 + 8;
      if (px1 - px0 < 400) iw = 0;
      if (iw) {
      c.fillStyle = rgba(P.surface, 0.92); roundRect(c, ix - 28, iy - 6, iw + 36, ih + 26, 8); c.fill(); c.strokeStyle = P.line2; c.stroke();
      var IX = function (u) { return ix + u * iw; }, IY = function (m) { return iy + ih - m / 0.42 * ih; };
      c.strokeStyle = P.line; c.beginPath(); c.moveTo(ix, iy); c.lineTo(ix, iy + ih); c.lineTo(ix + iw, iy + ih); c.stroke();
      c.strokeStyle = P.warm; c.lineWidth = 1.5; c.beginPath(); c.moveTo(IX(1 / 15), IY(dE(15))); c.lineTo(IX(1), IY(dE(1))); c.stroke();
      c.fillStyle = P.warm; c.beginPath(); c.arc(IX(1 / R), IY(dE(R)), 3.5, 0, TAU); c.fill();
      text(c, '1/R (nm⁻¹)', ix + iw, iy + ih + 14, P.faint, MONO_S, 'right'); text(c, 'ΔE ∝ 1/R', ix + 6, iy + 9, P.faint, MONO_S);
      c.save(); c.translate(ix - 10, iy + ih / 2); c.rotate(-Math.PI / 2); text(c, 'ΔE (meV)', 0, 0, P.faint, MONO_S, 'center'); c.restore();
      }
      rOut.textContent = R.toFixed(1) + ' nm'; oE.textContent = ENL.toFixed(3) + ' eV'; oL.textContent = Math.round(1239.84 / ENL) + ' nm'; oD.textContent = Math.round(dE(R) * 1000) + ' meV';
    };
    rIn.addEventListener('input', function () { playing = false; play.textContent = 'Play'; play.setAttribute('aria-pressed', 'false'); R = parseFloat(rIn.value); self.draw(); });
    play.addEventListener('click', function () {
      playing = !playing; play.textContent = playing ? 'Pause' : 'Play'; play.setAttribute('aria-pressed', String(playing));
      if (playing) { var u = 1 - Math.log(R) / Math.log(15); tStart = performance.now() / 1000 - 13 * Math.acos(clamp(1 - 2 * u, -1, 1)) / TAU; kick(); }
    });
    if (!playing) { play.textContent = 'Play'; play.setAttribute('aria-pressed', 'false'); }
    register(self);
    return self;
  }

  /* ================================================================== DEBYE
     Theta_D = 150.054 V^(-1/3) rho^(-1/2) (G+E)/sqrt(E) - 0.691   [K; A^3/atom, g/cm^3, GPa]
     Heat capacity: Debye model C_v/(3Nk_B) = 3 (T/Th)^3 int_0^{Th/T} x^4 e^x/(e^x-1)^2 dx.
     Presets: OQMD-screened compounds (Table 2 of the manuscript); dots: phonopy C_v(T) of the same
     compounds (window.PHONOPY_CV, from the repository's thermal_properties.json). */
  var PRESETS = [
    ['BeB₁₂N₂ (R3̄m)', 7.24, 2.55, 204.16, 477.46, 1513.01, 1514.69, 'BeB12N2'],
    ['B₁₃CN', 7.33, 2.52, 191.13, 450.53, 1372.96, 1471.73, 'B13CN'],
    ['BeB₂', 7.69, 2.21, 160.02, 367.05, 1171.93, 1407.64, 'BeB2'],
    ['LiB₁₅', 7.77, 2.26, 144.03, 342.42, 1257.68, 1324.63, 'LiB15'],
    ['Be₁₇V₂', 8.41, 2.65, 156.25, 337.47, 940.69, 1217.37, 'Be17V2'],
    ['TiBeC', 8.65, 4.39, 209.06, 481.20, 970.93, 1096.75, 'TiBeC'],
    ['CrN₂', 7.80, 5.68, 231.87, 562.26, 1103.21, 1062.72, 'CrN2'],
    ['Si₃N₄', 10.62, 3.13, 119.27, 306.01, 1111.80, 936.84, 'Si3N4'],
    ['Ti₃C₂N', 10.01, 5.02, 170.27, 420.89, 811.90, 894.58, 'Ti3C2N'],
    ['Li₄C₃', 9.93, 1.52, 41.38, 101.29, 803.75, 800.95, 'Li4C3'],
    ['Cr₂N', 9.61, 6.79, 139.37, 360.74, 634.82, 712.21, 'Cr2N']
  ];
  function sisso(V, rho, G, E) { return 150.054 * Math.pow(V, -1 / 3) * Math.pow(rho, -0.5) * (G + E) / Math.sqrt(E) - 0.691; }
  function cvDebye(T, Th) {
    if (T <= 0) return 0;
    var xD = Math.min(Th / T, 60), n = 96, h = xD / n, s = 0;
    for (var i = 0; i <= n; i++) {
      var x = i * h, f = x < 1e-6 ? 0 : Math.pow(x, 4) * Math.exp(x) / Math.pow(Math.expm1(x), 2);
      s += f * (i === 0 || i === n ? 1 : (i % 2 ? 4 : 2));
    }
    return 3 / Math.pow(xD, 3) * s * h / 3 * (Th / T > 60 ? Math.pow(60 * T / Th, 3) : 1);
  }
  function Debye(cv) {
    var root = cv.closest('.viz'), sel = root.querySelector('[data-preset]');
    var ins = {}, outs = {};
    root.querySelectorAll('[data-k]').forEach(function (i) { ins[i.getAttribute('data-k')] = i; });
    root.querySelectorAll('[data-o]').forEach(function (o) { outs[o.getAttribute('data-o')] = o; });
    var self = { el: cv, visible: false }, st = { V: 8.65, rho: 4.39, G: 209.06, E: 481.2 }, preset = 5, view = 'cv';
    var segV = root.querySelector('[data-dview]');
    if (segV) segV.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { view = b.getAttribute('data-v'); segV.querySelectorAll('button').forEach(function (q) { q.setAttribute('aria-pressed', String(q === b)); }); self.draw(); }); });
    PRESETS.forEach(function (p, i) { var o = document.createElement('option'); o.value = i; o.textContent = p[0]; sel.appendChild(o); });
    var oc = document.createElement('option'); oc.value = 'custom'; oc.textContent = 'Custom'; sel.appendChild(oc);
    function apply(i) { var p = PRESETS[i]; st = { V: p[1], rho: p[2], G: p[3], E: p[4] }; preset = i; sel.value = i; sync(); }
    function sync() {
      ins.G.value = st.G; ins.E.value = st.E; ins.V.value = st.V; ins.rho.value = st.rho;
      outs.G.textContent = st.G.toFixed(0) + ' GPa'; outs.E.textContent = st.E.toFixed(0) + ' GPa';
      outs.V.textContent = st.V.toFixed(2) + ' Å³'; outs.rho.textContent = st.rho.toFixed(2) + ' g/cm³';
    }
    Object.keys(ins).forEach(function (k) {
      ins[k].addEventListener('input', function () { st[k] = parseFloat(ins[k].value); preset = -1; sel.value = 'custom'; sync(); self.draw(); });
    });
    sel.addEventListener('change', function () { if (sel.value !== 'custom') { apply(parseInt(sel.value, 10)); self.draw(); } });
    self.animating = function () { return false; };
    self.tick = function () {};
    self.draw = function () {
      var f = fit(cv, function (w) { return w < 560 ? 470 : clamp(w * 0.36, 280, 340); }), c = f.c, W = f.w, H = f.h;
      c.clearRect(0, 0, W, H);
      var narrow = W < 560, th = sisso(st.V, st.rho, st.G, st.E), nu = st.E / (2 * st.G) - 1;
      // readout
      var rx = 24, ry = narrow ? 34 : 46;
      text(c, 'Θ_D from the learned law', rx, ry, P.muted, MONO_S);
      text(c, (th > 0 ? th.toFixed(0) : '—') + ' K', rx, ry + 52, P.ink, SERIF(narrow ? 46 : 54));
      var line = ry + 84;
      if (preset >= 0) {
        var p = PRESETS[preset];
        text(c, 'phonopy (DFT): ' + p[5].toFixed(0) + ' K', rx, line, P.ink2, MONO); line += 20;
        text(c, 'paper, SISSO: ' + p[6].toFixed(0) + ' K', rx, line, P.faint, MONO_S); line += 20;
      } else { text(c, 'custom material', rx, line, P.ink2, MONO); line += 20; }
      var nuOk = nu > -1 && nu < 0.5;
      text(c, 'Poisson ratio ν = ' + nu.toFixed(2) + (nuOk ? '' : '  (unphysical)'), rx, line, nuOk ? P.faint : P.warm, MONO_S); line += 20;
      var dft = preset >= 0 && window.PHONOPY_CV ? window.PHONOPY_CV[PRESETS[preset][7]] : null;
      text(c, 'C_v(300 K)/3Nk_B: law ' + (th > 0 ? cvDebye(300, th).toFixed(2) : '—') + (dft ? '  ·  DFT ' + dft[15].toFixed(2) : ''), rx, line, P.faint, MONO_S);
      // plot
      var x0 = narrow ? 50 : Math.max(300, W * 0.38), x1 = W - 24, y0 = narrow ? line + 40 : 30, y1 = H - 42, Tm = 1200;
      if (view === 'dos') { drawDOS(c, x0, x1, y0, y1, th); return; }
      var X = function (T) { return x0 + T / Tm * (x1 - x0); }, Y = function (cv_) { return y1 - cv_ * (y1 - y0) / 1.08; };
      axes(c, x0, y0, x1, y1);
      for (var T = 0; T <= Tm; T += 300) { c.strokeStyle = P.line2; c.beginPath(); c.moveTo(X(T), y0); c.lineTo(X(T), y1); c.stroke(); text(c, T + '', X(T), y1 + 16, P.muted, MONO_S, 'center'); }
      [0, 0.5, 1].forEach(function (q) { text(c, q.toFixed(1), x0 - 8, Y(q) + 4, P.muted, MONO_S, 'right'); });
      text(c, 'temperature (K)', (x0 + x1) / 2, y1 + 32, P.muted, MONO_S, 'center');
      c.save(); c.translate(x0 - 34, (y0 + y1) / 2); c.rotate(-Math.PI / 2); text(c, 'C_v / 3Nk_B', 0, 0, P.muted, MONO_S, 'center'); c.restore();
      c.setLineDash([2, 4]); c.strokeStyle = P.faint; c.beginPath(); c.moveTo(x0, Y(1)); c.lineTo(x1, Y(1)); c.stroke(); c.setLineDash([]);
      text(c, 'Dulong–Petit', x1 - 4, Y(1) - 6, P.faint, MONO_S, 'right');
      function curve(Th, col, dash, lw) {
        c.beginPath(); for (var k = 0; k <= 160; k++) { var T = Tm * k / 160, yy = Y(cvDebye(T, Th)); k ? c.lineTo(X(T), yy) : c.moveTo(X(T), yy); }
        c.setLineDash(dash || []); c.strokeStyle = col; c.lineWidth = lw || 2; c.stroke(); c.setLineDash([]);
      }
      if (th > 0) {
        curve(th, P.accent, null, 2.2);
        if (th < Tm) { c.setLineDash([3, 3]); c.strokeStyle = rgba(P.accent, 0.6); c.lineWidth = 1; c.beginPath(); c.moveTo(X(th), Y(1.02)); c.lineTo(X(th), y1); c.stroke(); c.setLineDash([]); text(c, 'T = Θ_D', X(th) + 6, y1 - 10, P.accent, MONO_S); }
      }
      if (dft) {   // phonopy heat capacity, every 40 K
        c.lineWidth = 1.4; c.strokeStyle = P.warm; c.fillStyle = P.surface2;
        for (var k = 1; k < dft.length; k += 2) { var xx = X(k * 20), yy = Y(dft[k]); c.beginPath(); c.arc(xx, yy, 3.2, 0, TAU); c.fill(); c.stroke(); }
      }
      // legend
      var lx = x0 + 14, ly = y0 + 14;
      c.strokeStyle = P.accent; c.lineWidth = 2.2; c.beginPath(); c.moveTo(lx, ly - 4); c.lineTo(lx + 22, ly - 4); c.stroke();
      text(c, 'Debye C_v from the law', lx + 30, ly, P.ink2, MONO_S);
      if (dft) {
        c.lineWidth = 1.4; c.strokeStyle = P.warm; c.fillStyle = P.surface2; c.beginPath(); c.arc(lx + 11, ly + 14, 3.2, 0, TAU); c.fill(); c.stroke();
        text(c, 'phonopy C_v (my DFT)', lx + 30, ly + 18, P.warm, MONO_S);
      }
    };
    /* Phonon DOS view: DFT g(nu) per element (stacked) against the Debye model
       g_D(nu) = 3 nu^2 / nu_D^3 for nu <= nu_D, with nu_D = k_B Theta_D / h = 0.0208366 THz/K * Theta_D. */
    var ELC = ['#0072B2', '#D55E00', '#009E73', '#CC79A7'];
    function drawDOS(c, x0, x1, y0, y1, th) {
      var key = preset >= 0 ? PRESETS[preset][7] : null, dos = key && window.PHONON_DOS ? window.PHONON_DOS[key] : null;
      var nuD = th > 0 ? 0.0208366 * th : 0, fm = Math.max(dos ? dos.fmax : 0, nuD) * 1.06 || 30;
      var gmax = nuD > 0 ? 3 / nuD : 0.1; if (dos) for (var i = 0; i < dos.tot.length; i++) gmax = Math.max(gmax, dos.tot[i]);
      gmax *= 1.12;
      var X = function (v) { return x0 + v / fm * (x1 - x0); }, Y = function (g) { return y1 - g / gmax * (y1 - y0); };
      axes(c, x0, y0, x1, y1);
      text(c, 'DFT phonon DOS by element (phonopy)', (x0 + x1) / 2, y0 - 12, P.ink, '600 13px Inter, sans-serif', 'center');
      var step = fm > 45 ? 10 : 5;
      for (var v = 0; v <= fm; v += step) { c.strokeStyle = P.line2; c.beginPath(); c.moveTo(X(v), y0); c.lineTo(X(v), y1); c.stroke(); text(c, v + '', X(v), y1 + 16, P.muted, MONO_S, 'center'); }
      text(c, 'phonon frequency ν (THz)', (x0 + x1) / 2, y1 + 32, P.muted, MONO_S, 'center');
      c.save(); c.translate(x0 - 20, (y0 + y1) / 2); c.rotate(-Math.PI / 2); text(c, 'g(ν), normalised', 0, 0, P.muted, MONO_S, 'center'); c.restore();
      var lx = x0 + 14, ly = y0 + 14, off = nuD > 0 ? 18 : 0, imag = dos && (key === 'BeB12N2' || key === 'LiB15');   // Debye entry sits first
      if (dos) {
        var n = dos.tot.length, el = Object.keys(dos.parts), base = new Float64Array(n);
        el.forEach(function (e, k) {      // stacked partial DOS
          var top = new Float64Array(n); for (var i = 0; i < n; i++) top[i] = base[i] + dos.parts[e][i];
          c.beginPath(); for (i = 0; i < n; i++) c.lineTo(X(i / (n - 1) * dos.fmax), Y(top[i])); for (i = n - 1; i >= 0; i--) c.lineTo(X(i / (n - 1) * dos.fmax), Y(base[i])); c.closePath();
          c.fillStyle = rgba(ELC[k % ELC.length], P.dark ? 0.45 : 0.32); c.fill();
          base = top;
          c.fillStyle = rgba(ELC[k % ELC.length], 0.8); c.fillRect(lx + 2, ly + off + 4 + k * 16 - 7, 18, 8);
          text(c, e, lx + 30, ly + off + 4 + k * 16, P.ink2, MONO_S);
        });
        c.beginPath(); for (var i2 = 0; i2 < n; i2++) { var yy = Y(dos.tot[i2]), xx = X(i2 / (n - 1) * dos.fmax); i2 ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
        c.strokeStyle = P.ink2; c.lineWidth = 1.2; c.stroke();
      } else text(c, 'phonon DOS is available for the preset compounds', lx, ly + 4, P.faint, MONO_S);
      if (nuD > 0) {                     // Debye model with the learned Theta_D
        c.beginPath(); for (var k2 = 0; k2 <= 120; k2++) { var vv = nuD * k2 / 120; var yy2 = Y(3 * vv * vv / Math.pow(nuD, 3)); k2 ? c.lineTo(X(vv), yy2) : c.moveTo(X(vv), yy2); }
        c.lineTo(X(nuD), y1); c.strokeStyle = P.accent; c.lineWidth = 2.2; c.stroke();
        c.setLineDash([3, 3]); c.lineWidth = 1; c.beginPath(); c.moveTo(X(nuD), y0); c.lineTo(X(nuD), y1); c.stroke(); c.setLineDash([]);
        text(c, 'ν_D = ' + nuD.toFixed(1) + ' THz', X(nuD) + 6, imag ? y0 + 60 : y0 + 28, P.accent, MONO_S);
        var lyd = ly + 4;
        c.strokeStyle = P.accent; c.lineWidth = 2.2; c.beginPath(); c.moveTo(lx, lyd - 4); c.lineTo(lx + 22, lyd - 4); c.stroke();
        text(c, 'Debye model, ν_D from the law', lx + 30, lyd, P.accent, MONO_S);
      }
      if (imag) {
        var n1 = 'imaginary-frequency modes', n2 = 'present (not drawn)'; c.font = MONO_S;
        var nw = Math.max(c.measureText(n1).width, c.measureText(n2).width);
        c.fillStyle = rgba(P.surface, 0.94); roundRect(c, x1 - nw - 16, y0 + 2, nw + 12, 36, 6); c.fill(); c.strokeStyle = rgba(P.warm, 0.5); c.lineWidth = 1; c.stroke();
        text(c, n1, x1 - 10, y0 + 16, P.warm, MONO_S, 'right'); text(c, n2, x1 - 10, y0 + 31, P.warm, MONO_S, 'right');
      }
    }
    apply(5);
    register(self);
    return self;
  }

  /* ================================================================== STACKING FAULT
     Nine close-packed (111) layers, ABCABCABC from the bottom. For 0<=x<=1 the
     top four layers move by x*b (b = a/6<112>, i.e. 1/3 of the projected repeat);
     for 1<=x<=2 the top three move by a further (x-1)*b. GSFE (paper Eq. 2):
       gamma = cG sin^2(pi x) + g_ISF x                         0<=x<=1
       gamma = cG sin^2(pi x) + g_ISF (2-x) + g_ESF (x-1)        1<=x<=2
     with DFT supercell g_ISF, g_ESF (mJ/m^2), G (GPa) and c from Table I / text. */
  var METALS = { Ag: [16.9, 16.3, 22.0, 5.01], Au: [32.6, 31.7, 15.4, 5.67], Cu: [42.4, 44.6, 49.8, 3.43], Ni: [136.6, 133.9, 95.1, 2.61],
    Pd: [139.5, 134.3, 44.4, 3.74], Pt: [309.1, 299.5, 48.6, 2.96], Rh: [203.4, 194.3, 146.8, 3.04], Ir: [357.2, 333.1, 214.4, 2.81] };
  function gsfe(m, x) {
    var p = METALS[m], s = Math.sin(Math.PI * x), b = p[3] * p[2] * s * s;
    return x <= 1 ? b + p[0] * x : b + p[0] * (2 - x) + p[1] * (x - 1);
  }
  function SFE(cv) {
    var root = cv.closest('.viz'), seg = root.querySelector('[data-metals]'), xin = root.querySelector('[data-x]'), xo = root.querySelector('[data-xo]'), play = root.querySelector('[data-play]');
    var self = { el: cv, visible: false }, metal = 'Cu', x = 0, playing = !RM, t0 = performance.now() / 1000;
    Object.keys(METALS).forEach(function (m) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = m; b.setAttribute('aria-pressed', String(m === metal));
      b.addEventListener('click', function () { metal = m; seg.querySelectorAll('button').forEach(function (q) { q.setAttribute('aria-pressed', String(q.textContent === m)); }); self.draw(); });
      seg.appendChild(b);
    });
    function ease(u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
    function path(tt) { // 0->1 (3s), hold 1.2, 1->2 (3s), hold 1.6, 2->0 (2.4s), hold 0.8  => 12 s
      var T = tt % 12;
      if (T < 3) return ease(T / 3); if (T < 4.2) return 1; if (T < 7.2) return 1 + ease((T - 4.2) / 3);
      if (T < 8.8) return 2; if (T < 11.2) return 2 - 2 * ease((T - 8.8) / 2.4); return 0;
    }
    self.animating = function () { return playing; };
    self.tick = function (t) { x = path(t - t0); xin.value = x; self.draw(); };
    var BASE = [0, 1, 2, 0, 1, 2, 0, 1, 2], LET = 'ABC';
    self.draw = function () {
      var f = fit(cv, function (w) { return w < 560 ? 640 : clamp(w * 0.4, 300, 380); }), c = f.c, W = f.w, H = f.h;
      c.clearRect(0, 0, W, H);
      var narrow = W < 560;
      // --- stack view
      var bx = narrow ? 16 : 20, by = 18, bw = narrow ? W - 32 : W * 0.4, bh = narrow ? 300 : H - 36;
      var nL = 9, dy = (bh - 36) / (nL + 0.3), sp = clamp(bw / 6.2, 28, 60), r = clamp(dy * 0.36, 6, 15);
      c.save(); roundRect(c, bx, by, bw, bh, 10); c.fillStyle = P.surface; c.fill(); c.clip();
      var shift = function (i) { return (i >= 5 ? Math.min(x, 1) / 3 : 0) + (i >= 6 ? Math.max(0, x - 1) / 3 : 0); };
      // moving block band
      var yOf = function (i) { return by + bh - dy * (i + 0.65); };
      c.fillStyle = rgba(P.accent, 0.06); c.fillRect(bx, by, bw, yOf(4.5) - by);
      if (x > 1) { c.fillStyle = rgba(P.warm, 0.06); c.fillRect(bx, by, bw, yOf(5.5) - by); }
      var cols = [P.accent, P.warm, P.ink2];
      for (var i = 0; i < nL; i++) {
        var o = (BASE[i] / 3 + shift(i)) % 1, k = Math.round(o * 3) % 3, exact = Math.abs(o * 3 - Math.round(o * 3)) < 0.06;
        var col = exact ? cols[k] : P.faint, y = yOf(i);
        for (var n = -2; n < bw / sp + 2; n++) {
          var xx = bx + 44 + (n + o) * sp;
          var g = c.createRadialGradient(xx - r * 0.35, y - r * 0.35, r * 0.1, xx, y, r);
          g.addColorStop(0, mix(col, '#ffffff', P.dark ? 0.25 : 0.45)); g.addColorStop(1, col);
          c.fillStyle = g; c.beginPath(); c.arc(xx, y, r, 0, TAU); c.fill();
        }
      }
      // slip planes
      c.setLineDash([4, 4]); c.lineWidth = 1;
      c.strokeStyle = rgba(P.accent, 0.8); c.beginPath(); c.moveTo(bx, yOf(4.5)); c.lineTo(bx + bw, yOf(4.5)); c.stroke();
      if (x > 1) { c.strokeStyle = rgba(P.warm, 0.8); c.beginPath(); c.moveTo(bx, yOf(5.5)); c.lineTo(bx + bw, yOf(5.5)); c.stroke(); }
      c.setLineDash([]); c.restore();
      // letters column
      c.fillStyle = rgba(P.surface, 0.9); c.fillRect(bx, by, 30, bh);
      for (i = 0; i < nL; i++) {
        o = (BASE[i] / 3 + shift(i)) % 1; k = Math.round(o * 3) % 3; exact = Math.abs(o * 3 - Math.round(o * 3)) < 0.06;
        text(c, exact ? LET[k] : '·', bx + 15, yOf(i) + 4, exact ? cols[k] : P.faint, '600 13px "JetBrains Mono", monospace', 'center');
      }
      c.strokeStyle = P.line2; c.lineWidth = 1; roundRect(c, bx, by, bw, bh, 10); c.stroke();
      var label = x < 0.02 ? 'perfect fcc  …ABCABC…' : Math.abs(x - 1) < 0.02 ? 'intrinsic fault  …ABC|BCA…' : x > 1.98 ? 'extrinsic fault  …ABC|B|ABC…' : 'shearing…';
      c.fillStyle = rgba(P.surface, 0.92); roundRect(c, bx + 38, by + 8, Math.min(bw - 46, 230), 22, 6); c.fill();
      text(c, label, bx + 46, by + 23, P.ink, MONO_S);
      // --- GSFE plot
      var px0 = narrow ? 52 : bx + bw + 64, px1 = W - 24, py0 = narrow ? by + bh + 44 : 34, py1 = H - 42;
      var gmax = 0; for (var q = 0; q <= 200; q++) gmax = Math.max(gmax, gsfe(metal, q / 100));
      var top = Math.ceil(gmax * 1.18 / 50) * 50;
      var X = function (u) { return px0 + u / 2 * (px1 - px0); }, Y = function (g) { return py1 - g / top * (py1 - py0); };
      axes(c, px0, py0, px1, py1);
      for (q = 0; q <= 4; q++) { var u = q / 2; c.strokeStyle = P.line2; c.beginPath(); c.moveTo(X(u), py0); c.lineTo(X(u), py1); c.stroke(); text(c, u.toFixed(1), X(u), py1 + 16, P.muted, MONO_S, 'center'); }
      var step = top > 600 ? 200 : top > 300 ? 100 : top > 120 ? 50 : 25;
      for (var gy = 0; gy <= top; gy += step) text(c, gy + '', px0 - 8, Y(gy) + 4, P.muted, MONO_S, 'right');
      text(c, 'fractional displacement x (units of b)', (px0 + px1) / 2, py1 + 32, P.muted, MONO_S, 'center');
      c.save(); c.translate(px0 - 40, (py0 + py1) / 2); c.rotate(-Math.PI / 2); text(c, 'GSFE (mJ m⁻²)', 0, 0, P.muted, MONO_S, 'center'); c.restore();
      c.beginPath(); for (q = 0; q <= 400; q++) { u = q / 200; var yy = Y(gsfe(metal, u)); q ? c.lineTo(X(u), yy) : c.moveTo(X(u), yy); }
      c.strokeStyle = P.accent; c.lineWidth = 2.2; c.stroke();
      // traced part
      c.beginPath(); for (q = 0; q <= Math.round(x * 200); q++) { u = q / 200; yy = Y(gsfe(metal, u)); q ? c.lineTo(X(u), yy) : c.moveTo(X(u), yy); }
      c.lineTo(X(x), py1); c.lineTo(X(0), py1); c.closePath(); c.fillStyle = rgba(P.accent, 0.1); c.fill();
      var p = METALS[metal];
      [[1, p[0], 'γ_{ISF}'], [2, p[1], 'γ_{ESF}']].forEach(function (d) { c.fillStyle = P.surface; c.strokeStyle = P.ink2; c.lineWidth = 1.5; c.beginPath(); c.arc(X(d[0]), Y(d[1]), 4.5, 0, TAU); c.fill(); c.stroke(); text(c, d[2] + ' = ' + d[1].toFixed(1), X(d[0]) + (d[0] === 2 ? -6 : 0), Y(d[1]) + 20, P.ink2, MONO_S, d[0] === 2 ? 'right' : 'center'); });
      var um = 0, gm = 0, ut = 1, gt = 0; for (q = 0; q <= 100; q++) { u = q / 100; if (gsfe(metal, u) > gm) { gm = gsfe(metal, u); um = u; } } for (q = 100; q <= 200; q++) { u = q / 100; if (gsfe(metal, u) > gt) { gt = gsfe(metal, u); ut = u; } }
      text(c, 'γ_{USF} = ' + gm.toFixed(0), X(um), Y(gm) - 10, P.muted, MONO_S, 'center'); text(c, 'γ_{UTF} = ' + gt.toFixed(0), X(ut), Y(gt) - 10, P.muted, MONO_S, 'center');
      var gx = gsfe(metal, x); c.fillStyle = P.warm; c.beginPath(); c.arc(X(x), Y(gx), 5, 0, TAU); c.fill();
      text(c, metal + ' · G = ' + p[2].toFixed(1) + ' GPa · c = ' + p[3].toFixed(2), px1, py0 - 10, P.faint, MONO_S, 'right');
      text(c, 'γ(x) = ' + gx.toFixed(0) + ' mJ m⁻²', px0 + 6, py0 + 4, P.warm, MONO);
      xo.textContent = x.toFixed(2) + ' b';
    };
    xin.addEventListener('input', function () { playing = false; play.textContent = 'Play'; play.setAttribute('aria-pressed', 'false'); x = parseFloat(xin.value); self.draw(); });
    play.addEventListener('click', function () { playing = !playing; play.textContent = playing ? 'Pause' : 'Play'; play.setAttribute('aria-pressed', String(playing)); if (playing) { t0 = performance.now() / 1000; kick(); } });
    if (!playing) { play.textContent = 'Play'; play.setAttribute('aria-pressed', 'false'); }
    register(self);
    return self;
  }

  /* ================================================================== TISE
     H = -1/2 d^2/dx^2 + V(x) on [-4, 4] with psi(+-4) = 0 (hbar = m = 1).
     Imaginary-time steps with implicit Euler, (1 + dtau H) psi' = psi, solved by
     the Thomas algorithm; dtau grows geometrically. <E> = <psi|H|psi>/<psi|psi>. */
  var POTS = {
    harm: { f: function (x) { return 0.5 * x * x; }, ymax: 6, exact: 0.5, name: 'V = x²/2' },
    dw: { f: function (x) { var q = x * x - 2.25; return 0.5 * q * q; }, ymax: 6, name: 'V = ½(x² − 1.5²)²' },
    adw: { f: function (x) { var q = x * x - 2.25; return 0.5 * q * q + 0.6 * x; }, ymax: 6, name: 'V = ½(x² − 1.5²)² + 0.6x' }
  };
  function TISE(cv) {
    var root = cv.closest('.viz'), seg = root.querySelector('[data-pot]'), btn = root.querySelector('[data-new]'), oIt = root.querySelector('[data-it]'), oEn = root.querySelector('[data-en]');
    var self = { el: cv, visible: false }, N = 401, L = 4, dx = 2 * L / (N - 1), xs = new Float64Array(N), V = new Float64Array(N), psi = new Float64Array(N);
    var pot = 'adw', it = 0, dtau = 0.004, hist = [], done = false, quiet = 0, E = 0;
    for (var i = 0; i < N; i++) xs[i] = -L + i * dx;
    function setPot(k) { pot = k; for (var i = 0; i < N; i++) V[i] = POTS[k].f(xs[i]); seg.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-p') === k)); }); guess(); }
    function guess() {
      var g = [];
      for (var k = 0; k < 4; k++) g.push([Math.random() * 2 - 1, Math.random() * 4.6 - 2.3, 0.25 + Math.random() * 0.5]);
      for (var i = 0; i < N; i++) {
        var s = 0; for (k = 0; k < 4; k++) s += g[k][0] * Math.exp(-Math.pow((xs[i] - g[k][1]) / g[k][2], 2) / 2);
        psi[i] = s * (1 - Math.pow(xs[i] / L, 2));
      }
      psi[0] = psi[N - 1] = 0; norm(); it = 0; dtau = 0.004; hist = []; done = false; quiet = 0; E = energy(); hist.push(E); kick();
    }
    function norm() { var s = 0; for (var i = 0; i < N; i++) s += psi[i] * psi[i]; s = Math.sqrt(s * dx) || 1; for (i = 0; i < N; i++) psi[i] /= s; }
    function energy() {
      var num = 0, den = 0;
      for (var i = 1; i < N - 1; i++) { var hp = -0.5 * (psi[i + 1] - 2 * psi[i] + psi[i - 1]) / (dx * dx) + V[i] * psi[i]; num += psi[i] * hp; den += psi[i] * psi[i]; }
      return num / den;
    }
    var cp = new Float64Array(N), dp = new Float64Array(N);
    function step() {
      var off = dtau * (-0.5 / (dx * dx)), n = N - 2;
      // unknowns i=1..N-2 ; diag = 1 + dtau(1/dx^2 + V)
      for (var k = 0; k < n; k++) {
        var i = k + 1, b = 1 + dtau * (1 / (dx * dx) + V[i]), d = psi[i];
        if (k === 0) { cp[k] = off / b; dp[k] = d / b; }
        else { var m = b - off * cp[k - 1]; cp[k] = off / m; dp[k] = (d - off * dp[k - 1]) / m; }
      }
      for (k = n - 1; k >= 0; k--) { psi[k + 1] = dp[k] - (k < n - 1 ? cp[k] * psi[k + 2] : 0); }
      psi[0] = psi[N - 1] = 0; norm();
      dtau = Math.min(0.5, dtau * 1.07); it++;
      var En = energy(); quiet = Math.abs(En - E) < 1e-8 ? quiet + 1 : 0; E = En; hist.push(E); if (quiet > 12) done = true;
    }
    self.animating = function () { return !done; };
    self.tick = function () { step(); if (RM) { while (!done && it < 4000) step(); } self.draw(); };
    self.draw = function () {
      var f = fit(cv, function (w) { return w < 560 ? 380 : clamp(w * 0.4, 300, 380); }), c = f.c, W = f.w, H = f.h;
      c.clearRect(0, 0, W, H);
      var p = POTS[pot], x0 = 50, x1 = W - 22, y0 = 22, y1 = H - 40, vmin = 1e9;
      for (var i = 0; i < N; i++) vmin = Math.min(vmin, V[i]);
      var lo = Math.min(vmin, 0) - 0.4, hi = p.ymax;
      var X = function (x) { return x0 + (x + L) / (2 * L) * (x1 - x0); }, Y = function (e) { return y1 - (e - lo) / (hi - lo) * (y1 - y0); };
      axes(c, x0, y0, x1, y1);
      for (var q = -L; q <= L; q++) { text(c, q + '', X(q), y1 + 16, P.muted, MONO_S, 'center'); }
      for (var e = 0; e <= hi; e += 2) { text(c, e + '', x0 - 8, Y(e) + 4, P.muted, MONO_S, 'right'); c.strokeStyle = P.line2; c.beginPath(); c.moveTo(x0, Y(e)); c.lineTo(x1, Y(e)); c.stroke(); }
      text(c, 'x', x1, y1 + 32, P.muted, MONO_S, 'right');
      c.save(); c.translate(x0 - 34, (y0 + y1) / 2); c.rotate(-Math.PI / 2); text(c, 'energy', 0, 0, P.muted, MONO_S, 'center'); c.restore();
      // potential
      c.save(); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
      c.beginPath(); for (i = 0; i < N; i++) { var yy = Y(V[i]); i ? c.lineTo(X(xs[i]), yy) : c.moveTo(X(xs[i]), yy); } c.lineTo(X(L), y1); c.lineTo(X(-L), y1); c.closePath(); c.fillStyle = rgba(P.ink2, P.dark ? 0.14 : 0.08); c.fill();
      c.beginPath(); for (i = 0; i < N; i++) { yy = Y(V[i]); i ? c.lineTo(X(xs[i]), yy) : c.moveTo(X(xs[i]), yy); } c.strokeStyle = P.ink2; c.lineWidth = 1.6; c.stroke();
      // energy level + wavefunction baseline at <E>
      var mxp = 0, sgn = 1; for (i = 0; i < N; i++) if (Math.abs(psi[i]) > mxp) { mxp = Math.abs(psi[i]); sgn = psi[i] < 0 ? -1 : 1; }
      mxp *= sgn;   // draw the dominant lobe upwards (the overall sign of psi is arbitrary)
      var A = 0.26 * (hi - lo), base = Y(E);
      c.setLineDash([5, 4]); c.strokeStyle = rgba(P.accent, 0.8); c.lineWidth = 1; c.beginPath(); c.moveTo(x0, base); c.lineTo(x1, base); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.moveTo(X(-L), base); for (i = 0; i < N; i++) c.lineTo(X(xs[i]), base - (psi[i] / mxp) * A / (hi - lo) * (y1 - y0)); c.lineTo(X(L), base); c.closePath(); c.fillStyle = rgba(P.accent, 0.16); c.fill();
      c.beginPath(); for (i = 0; i < N; i++) { yy = base - (psi[i] / mxp) * A / (hi - lo) * (y1 - y0); i ? c.lineTo(X(xs[i]), yy) : c.moveTo(X(xs[i]), yy); } c.strokeStyle = P.accent; c.lineWidth = 2; c.stroke();
      c.restore();
      text(c, '⟨E⟩ = ' + E.toFixed(4), x0 + 10, base - 8, P.accent, MONO);
      c.font = MONO_S; var nw = c.measureText(p.name).width;
      c.fillStyle = rgba(P.surface, 0.94); roundRect(c, x0 + 6, y1 - 26, nw + 12, 18, 5); c.fill();
      text(c, p.name, x0 + 12, y1 - 13, P.muted, MONO_S);
      if (p.exact && done) text(c, 'exact E₀ = 0.5', x1 - 10, base - 8, P.ok, MONO_S, 'right');
      // inset: energy history
      var iw = W < 560 ? 120 : 160, ih = 64, ix = x1 - iw - 10, iy = y0 + 14;
      c.fillStyle = rgba(P.surface, 0.94); roundRect(c, ix - 10, iy - 10, iw + 20, ih + 34, 8); c.fill(); c.strokeStyle = P.line2; c.lineWidth = 1; c.stroke();
      var hmin = Math.min.apply(null, hist), hmax = Math.max.apply(null, hist.slice(0, 1).concat(hist)), top = Math.min(hmax, hmin + 8);
      var n = hist.length;
      c.beginPath(); for (q = 0; q < n; q++) { var hx = ix + (n > 1 ? q / (n - 1) : 0) * iw, hy = iy + ih - (Math.min(hist[q], top) - hmin) / Math.max(1e-6, top - hmin) * ih; q ? c.lineTo(hx, hy) : c.moveTo(hx, hy); }
      c.strokeStyle = P.warm; c.lineWidth = 1.5; c.stroke();
      text(c, 'energy vs step', ix, iy + ih + 16, P.faint, MONO_S);
      oIt.textContent = it; oEn.textContent = E.toFixed(4);
    };
    seg.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { setPot(b.getAttribute('data-p')); }); });
    btn.addEventListener('click', guess);
    setPot('adw');
    register(self);
    return self;
  }

  /* ================================================================== MOLECULE
     Ball-and-stick rendering of the QuantumATK input geometry (window.MOL_GYNT).
     Orthographic projection, painter's algorithm, rotation about the tube axis. */
  var RCOV = { H: 0.31, B: 0.84, C: 0.76, N: 0.71, O: 0.66, Zn: 1.22 };
  var RDRAW = { H: 0.26, B: 0.42, C: 0.34, N: 0.36, O: 0.36, Zn: 0.56 };
  function elCol(e) {
    var d = P.dark;
    return { C: d ? '#a3abb6' : '#5d6571', H: d ? '#eceff2' : '#e1e4e8', N: d ? '#7eaaf0' : '#2f64b0', O: d ? '#f07a6e' : '#c8463d', B: d ? '#f2b45c' : '#d98a1f', Zn: d ? '#b9c6dd' : '#6b7b97' }[e];
  }
  function Mol(cv) {
    var M = window.MOL_GYNT; if (!M) return null;
    var root = cv.closest('.viz'), spin = root.querySelector('[data-spin]'), legend = root.querySelector('[data-legend]');
    var self = { el: cv, visible: false }, n = M.el.length, th = 0, th0 = 0, ph = 0.2, tRock = 0, playing = !RM, holdUntil = 0, bonds = [];
    // centre on the nanotube axis (mean x,y of carbons), keep z
    var cx = 0, cy = 0, nc = 0; for (var i = 0; i < n; i++) if (M.el[i] === 'C') { cx += M.xyz[i][0]; cy += M.xyz[i][1]; nc++; }
    cx /= nc; cy /= nc;
    var P3 = M.xyz.map(function (p) { return [p[0] - cx, p[1] - cy, p[2]]; });
    for (i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
      var a = P3[i], b = P3[j], d = Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2));
      if (d < 1.18 * (RCOV[M.el[i]] + RCOV[M.el[j]]) && d > 0.4) bonds.push([i, j]);
    }
    var rmax = 0, zmin = 1e9, zmax = -1e9; P3.forEach(function (p) { rmax = Math.max(rmax, Math.hypot(p[0], p[1])); zmin = Math.min(zmin, p[2]); zmax = Math.max(zmax, p[2]); });
    var drug = [0, 0, 0], nd = 0; M.el.forEach(function (e, k) { if (e === 'O' || e === 'N' || e === 'H') { drug[0] += P3[k][0]; drug[1] += P3[k][1]; drug[2] += P3[k][2]; nd++; } });
    drug = drug.map(function (q) { return q / nd; });
    var zc = (zmin + zmax) / 2;
    /* projection: tube axis (z) runs across the screen; th rotates about the tube
       axis, ph is a small yaw about the screen vertical. Returns [x, up, depth]. */
    function proj(p, t, y) {
      var ct = Math.cos(t), st = Math.sin(t), up = p[0] * ct - p[1] * st, tow = p[0] * st + p[1] * ct, z = p[2] - zc;
      return [z * Math.cos(y) - tow * Math.sin(y), up, z * Math.sin(y) + tow * Math.cos(y)];
    }
    // start with the drug in front of and slightly above the tube
    var ROCK = 0.38, best = -1e9;
    for (var deg = 0; deg < 360; deg += 2) { var tt = deg * Math.PI / 180, q0 = proj(drug, tt, 0), sc0 = q0[2] * Math.cos(0.32) + q0[1] * Math.sin(0.32); if (sc0 > best) { best = sc0; th0 = tt; } }
    th = th0;
    var EXT = (function () {   // [max |x|, min up, max up] over the rocking range
      var xm = 0, lo = 1e9, hi = -1e9;
      for (var s = -1; s <= 1; s += 0.125) P3.forEach(function (p) { var q = proj(p, th0 + ROCK * s, ph); xm = Math.max(xm, Math.abs(q[0])); lo = Math.min(lo, q[1]); hi = Math.max(hi, q[1]); });
      return [xm + 1.2, lo - 1.0, hi + 1.0];
    })();
    // legend
    ['C', 'H', 'N', 'O', 'B', 'Zn'].forEach(function (e) {
      var s = document.createElement('span'); s.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font:500 12px var(--mono);color:var(--ink-2)';
      s.innerHTML = '<i data-el="' + e + '" style="width:10px;height:10px;border-radius:50%;display:inline-block"></i>' + e; legend.appendChild(s);
    });
    function paintLegend() { legend.querySelectorAll('[data-el]').forEach(function (i) { i.style.background = elCol(i.getAttribute('data-el')); }); }
    self.theme = paintLegend;
    self.animating = function () { return playing; };
    self.tick = function (t, dt) { if (performance.now() > holdUntil) { tRock += dt; th = th0 + ROCK * Math.sin(0.42 * tRock); } self.draw(); };
    self.draw = function () {
      var f = fit(cv, function (w) { return w < 560 ? 340 : clamp(w * 0.5, 340, 470); }), c = f.c, W = f.w, H = f.h;
      c.clearRect(0, 0, W, H);
      var sc = Math.min((W - 60) / (2 * EXT[0]), (H - 70) / (EXT[2] - EXT[1])), ox = W / 2, oy = H / 2 - 6 + (EXT[2] + EXT[1]) / 2 * sc;
      var Q = P3.map(function (p) { var q = proj(p, th, ph); return [ox + q[0] * sc, oy - q[1] * sc, q[2]]; });
      var dmin = 1e9, dmax = -1e9; Q.forEach(function (q) { dmin = Math.min(dmin, q[2]); dmax = Math.max(dmax, q[2]); });
      var fog = function (dd) { return (dd - dmin) / (dmax - dmin + 1e-6); }; // 0 far .. 1 near (depth axis toward viewer = +)
      var bg = P.surface2;
      // bonds sorted by depth
      var bs = bonds.map(function (b) { return [b[0], b[1], (Q[b[0]][2] + Q[b[1]][2]) / 2]; }).sort(function (a, b) { return a[2] - b[2]; });
      var items = [];
      bs.forEach(function (b) { items.push([b[2] - 0.01, 'b', b]); });
      Q.forEach(function (q, k) { items.push([q[2], 'a', k]); });
      items.sort(function (a, b) { return a[0] - b[0]; });
      items.forEach(function (it) {
        if (it[1] === 'b') {
          var b = it[2], A = Q[b[0]], B = Q[b[1]], t = fog(b[2]);
          c.strokeStyle = mix(bg, P.dark ? '#c7ccd4' : '#7a828e', 0.25 + 0.75 * t); c.lineWidth = Math.max(1.2, sc * 0.16); c.lineCap = 'round';
          c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
        } else {
          var k = it[2], q = Q[k], e = M.el[k], r = RDRAW[e] * sc, t2 = fog(q[2]), col = mix(bg, elCol(e), 0.35 + 0.65 * t2);
          var g = c.createRadialGradient(q[0] - r * 0.35, q[1] - r * 0.35, r * 0.15, q[0], q[1], r);
          g.addColorStop(0, mix(col, '#ffffff', 0.45)); g.addColorStop(1, col);
          c.fillStyle = g; c.beginPath(); c.arc(q[0], q[1], r, 0, TAU); c.fill();
          if (e === 'Zn' || e === 'B') { c.strokeStyle = P.ink; c.lineWidth = 1; c.stroke(); }
        }
      });
      // labels
      // labels with short leader lines
      c.lineWidth = 1;
      M.el.forEach(function (e, k) {
        if (e !== 'Zn' && e !== 'B') return;
        var q = Q[k], r = RDRAW[e] * sc, lx = q[0] + r + 14, ly = q[1] + (e === 'B' ? r + 16 : -r - 10);
        c.strokeStyle = rgba(P.ink, 0.5); c.beginPath(); c.moveTo(q[0] + r * 0.7, q[1] + (e === 'B' ? r * 0.7 : -r * 0.7)); c.lineTo(lx - 3, ly - 4); c.stroke();
        c.font = MONO_S; var tw = c.measureText(e + ' dopant').width;
        c.fillStyle = rgba(P.surface, 0.92); roundRect(c, lx - 5, ly - 12, tw + 10, 17, 5); c.fill();
        text(c, e + ' dopant', lx, ly, P.ink, MONO_S);
      });
      var top = 1e9, dx = 0, nn = 0; M.el.forEach(function (e, k) { if (e === 'O' || e === 'N' || e === 'H') { top = Math.min(top, Q[k][1]); dx += Q[k][0]; nn++; } });
      text(c, 'Ribavirin', dx / nn, Math.max(16, top - 14), P.warm, MONO, 'center');
      // 5 Å scale bar
      var sbx = 20, sby = H - 18; c.strokeStyle = P.ink2; c.lineWidth = 2; c.beginPath(); c.moveTo(sbx, sby); c.lineTo(sbx + 5 * sc, sby); c.stroke(); text(c, '5 Å', sbx + 5 * sc + 8, sby + 4, P.ink2, MONO_S);
      text(c, 'nanotube axis ↔', W - 20, H - 14, P.faint, MONO_S, 'right');
    };
    var drag = null;
    cv.addEventListener('pointerdown', function (e) { drag = [e.clientX, e.clientY, th, ph]; cv.setPointerCapture(e.pointerId); holdUntil = performance.now() + 1e9; cv.style.cursor = 'grabbing'; });
    cv.addEventListener('pointermove', function (e) { if (!drag) return; th = drag[2] + (e.clientY - drag[1]) * 0.012; ph = clamp(drag[3] + (e.clientX - drag[0]) * 0.008, -1.0, 1.0); self.draw(); });
    function up() { if (drag) { drag = null; th0 = th; tRock = 0; holdUntil = performance.now() + 2500; cv.style.cursor = 'grab'; } }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.style.cursor = 'grab';
    spin.addEventListener('click', function () { playing = !playing; spin.textContent = playing ? 'Pause rotation' : 'Rotate'; spin.setAttribute('aria-pressed', String(playing)); if (playing) kick(); });
    if (!playing) { spin.textContent = 'Rotate'; spin.setAttribute('aria-pressed', 'false'); }
    paintLegend();
    register(self);
    return self;
  }

  /* ================================================================== PCA
     11,509 materials projected onto PC1/PC2 of five standardised descriptors
     (G_VRH, E, V_atom, rho, Theta_D). Scores, loadings and explained variance come
     from PCA_results.xlsx in the pisr-phonon-genesis repository (re-derived and
     checked). Views: a smoothed Theta_D contour (turbo "rainbow" colour map), Theta_D
     points, and the chemical classification with the manuscript's marker symbols.
     The intro animation moves each point from the raw (G_VRH, rho) plane into the
     PC plane. Data (assets/pca-data.js) load on demand. */
  var TURBO = ['#30123b', '#4145ab', '#4675ed', '#39a2fc', '#1bcfd4', '#24eca6', '#61fc6c', '#a4fc3b', '#d1e834', '#f3c63a', '#fe9b2d', '#f36315', '#d93806', '#b11901', '#7a0403'];
  function turbo(u) {
    u = clamp(u, 0, 1) * (TURBO.length - 1); var i = Math.floor(u);
    if (i >= TURBO.length - 1) return rgb(TURBO[TURBO.length - 1]);
    var a = rgb(TURBO[i]), b = rgb(TURBO[i + 1]), f = u - i;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  // data order: Metal & Metalloid, Other, Oxides, Halides, Nitrides, Carbides, Borides, Single Element
  var FAM = [['#F28C28', 'square'], ['#1F3FD6', 'tri-down'], ['#F2E21B', 'plus'], ['#3BDA3B', 'diamond'], ['#E03CE0', 'star'], ['#D7263D', 'tri-up'], ['#38B6E8', 'cross'], ['#2E8B8B', 'circle']];
  // dark theme: same hues, slightly deeper so saturated yellows/greens don't glare on the dark card
  var FAM_DARK = ['#E07B1A', '#5C7CFF', '#D9C51A', '#2FBF4A', '#D64FD6', '#E0454F', '#3AA8D8', '#3FA3A3'];
  function famCol(g) { return P.dark ? FAM_DARK[g] : FAM[g][0]; }
  function symPath(c, kind, x, y, r) {
    c.beginPath();
    if (kind === 'circle') c.arc(x, y, r, 0, TAU);
    else if (kind === 'square') c.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
    else if (kind === 'diamond') { c.moveTo(x, y - r * 1.15); c.lineTo(x + r, y); c.lineTo(x, y + r * 1.15); c.lineTo(x - r, y); c.closePath(); }
    else if (kind === 'tri-up') { c.moveTo(x, y - r * 1.15); c.lineTo(x + r * 1.05, y + r * 0.75); c.lineTo(x - r * 1.05, y + r * 0.75); c.closePath(); }
    else if (kind === 'tri-down') { c.moveTo(x, y + r * 1.15); c.lineTo(x + r * 1.05, y - r * 0.75); c.lineTo(x - r * 1.05, y - r * 0.75); c.closePath(); }
    else if (kind === 'star') { for (var k = 0; k < 10; k++) { var rr = k % 2 ? r * 0.5 : r * 1.25, a = -Math.PI / 2 + k * Math.PI / 5; c.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); } c.closePath(); }
    else if (kind === 'plus' || kind === 'cross') {
      var t = r * 0.38, R = kind === 'cross' ? r * 1.05 : r, pts = [[-t, -R], [t, -R], [t, -t], [R, -t], [R, t], [t, t], [t, R], [-t, R], [-t, t], [-R, t], [-R, -t], [-t, -t]];
      var ca = kind === 'cross' ? Math.SQRT1_2 : 1, sa = kind === 'cross' ? Math.SQRT1_2 : 0;
      pts.forEach(function (p, k) { var px = x + p[0] * ca - p[1] * sa, py = y + p[0] * sa + p[1] * ca; k ? c.lineTo(px, py) : c.moveTo(px, py); });
      c.closePath();
    }
  }
  // annotated regions of the manuscript figure (data units): cx, cy, rx, ry, rotation, label, label x, label y, colour
  var REGIONS = [
    [-4.3, -1.4, 3.9, 1.15, -0.5, 'Alkali metals, H₂\nand noble gases', -6.3, -3.3, '#d62828'],
    [-1.9, 2.3, 1.5, 1.75, 0.15, 'Au, Hg compounds,\nlanthanides, actinides', -4.6, 4.2, '#555555'],
    [4.4, 3.0, 4.0, 1.9, -0.08, 'Late-transition and f-block\nmetal complexes', 11.9, 2.6, '#2f3fd0'],
    [10.3, -2.7, 7.9, 1.25, 0.02, 'Early-transition beryllides,\nborides, carbides, nitrides', 13.9, -1.05, '#a020c8']
  ];
  var MARK = ['Cs', 'Rb', 'K', 'Na', 'Li', 'Xe', 'Kr', 'Ar', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'U', 'WC', 'TiB2', 'ReOs3', 'VN', 'C'];
  function PCA(cv) {
    var root = cv.closest('.viz'), segM = root.querySelector('[data-pmode]'), segR = root.querySelector('[data-preg]'), replay = root.querySelector('[data-replay]');
    var legend = root.querySelector('[data-plegend]'), tip = root.querySelector('[data-ptip]'), count = root.querySelector('[data-pcount]');
    var self = { el: cv, visible: false }, D = null, loading = false, mode = 't', reg = 'all', fam = -1, prog = RM ? 1 : 0, t0 = null, hover = -1, field = null;
    var XR = [-8.5, 18], YR = [-4.3, 4.9], GXR = [-1, 6], GYR = [-1.5, 3.4], LSC = 4, L0 = Math.log10(17), L1 = Math.log10(2300);
    var LBL = { SM: 'G_{VRH}', YM: 'E', VPA: 'V_{atom}', D: 'ρ', DT: 'Θ_D' };
    function prep(Pd) {
      var n = Pd.n, o = { n: n, x: new Float32Array(n), y: new Float32Array(n), gx: new Float32Array(n), gy: new Float32Array(n), t: Pd.t, c: Pd.c, f: Pd.f.split('|'), cats: Pd.cats, ev: Pd.ev, load: Pd.load, bin: new Uint8Array(n), u: new Float32Array(n) };
      for (var i = 0; i < n; i++) {
        o.x[i] = Pd.x[i] / 100; o.y[i] = Pd.y[i] / 100; o.gx[i] = Pd.gx[i] / 100; o.gy[i] = Pd.gy[i] / 100;
        o.u[i] = clamp((Math.log10(Math.max(17, Pd.t[i])) - L0) / (L1 - L0), 0, 1);
        o.bin[i] = Math.min(9, Math.floor(o.u[i] * 10));
      }
      o.cen = o.cats.map(function (_, k) {
        var xs = [], ys = []; for (var i = 0; i < n; i++) if (o.c[i] === k) { xs.push(o.x[i]); ys.push(o.y[i]); }
        xs.sort(function (a, b) { return a - b; }); ys.sort(function (a, b) { return a - b; });
        return [xs[xs.length >> 1], ys[ys.length >> 1], xs.length];
      });
      o.marks = [];
      MARK.forEach(function (m) { var best = -1; for (var i = 0; i < n; i++) if (o.f[i] === m && (best < 0 || o.x[i] > o.x[best])) best = i; if (best >= 0) o.marks.push(best); });
      return o;
    }
    /* contour field: bin the scaled log10(Theta_D) on a fine grid, Gaussian-smooth sums and counts,
       take the ratio and quantise into 14 bands (filled-contour look); sparse cells stay transparent */
    function buildField() {
      var nx = 320, ny = 130, S = new Float32Array(nx * ny), N = new Float32Array(nx * ny);
      for (var i = 0; i < D.n; i++) {
        var gx = Math.floor((D.x[i] - XR[0]) / (XR[1] - XR[0]) * nx), gy = Math.floor((D.y[i] - YR[0]) / (YR[1] - YR[0]) * ny);
        if (gx < 0 || gy < 0 || gx >= nx || gy >= ny) continue;
        S[gy * nx + gx] += D.u[i]; N[gy * nx + gx] += 1;
      }
      function kern(s) { var r = Math.ceil(3 * s), k = []; for (var j = -r; j <= r; j++) k.push(Math.exp(-j * j / (2 * s * s))); return { k: k, r: r }; }
      function blur(A, kx, ky) {
        var tmp = new Float32Array(A.length), x, y, j, acc;
        for (y = 0; y < ny; y++) for (x = 0; x < nx; x++) { acc = 0; for (j = -kx.r; j <= kx.r; j++) { var xx = x + j; if (xx >= 0 && xx < nx) acc += A[y * nx + xx] * kx.k[j + kx.r]; } tmp[y * nx + x] = acc; }
        for (y = 0; y < ny; y++) for (x = 0; x < nx; x++) { acc = 0; for (j = -ky.r; j <= ky.r; j++) { var yy = y + j; if (yy >= 0 && yy < ny) acc += tmp[yy * nx + x] * ky.k[j + ky.r]; } A[y * nx + x] = acc; }
      }
      var KX = kern(4), KY = kern(3.5); blur(S, KX, KY); blur(N, KX, KY);
      var img = new ImageData(nx, ny), d = img.data, bands = 14;
      for (var k = 0; k < nx * ny; k++) {
        var gy2 = Math.floor(k / nx), gx2 = k % nx, dst = ((ny - 1 - gy2) * nx + gx2) * 4;
        if (N[k] < 0.06) { d[dst + 3] = 0; continue; }
        var u = Math.floor(clamp(S[k] / N[k], 0, 0.9999) * bands) / (bands - 1), col = turbo(u);
        d[dst] = col[0]; d[dst + 1] = col[1]; d[dst + 2] = col[2]; d[dst + 3] = Math.round(255 * clamp((N[k] - 0.06) / 0.25, 0, 1));
      }
      var oc = document.createElement('canvas'); oc.width = nx; oc.height = ny; oc.getContext('2d').putImageData(img, 0, 0);
      field = oc;
    }
    function ready() { D = prep(window.PCA_DATA); t0 = null; buildLegend(); self.draw(); kick(); }
    function load() {
      if (D || loading) return;
      if (window.PCA_DATA) { ready(); return; }
      loading = true;
      var me = document.querySelector('script[src*="viz.js"]'), s = document.createElement('script');
      s.src = me ? me.src.replace(/viz\.js.*$/, 'pca-data.js') : 'assets/pca-data.js';
      s.onload = function () { loading = false; ready(); };
      s.onerror = function () { loading = false; };
      document.head.appendChild(s);
    }
    function shown(i) {
      if (fam >= 0 && D.c[i] !== fam) return false;
      if (reg === 'low') return D.t[i] < 350;
      if (reg === 'high') return D.t[i] > 1000;
      return true;
    }
    var ease = function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
    self.animating = function () { if (self.visible && !D) load(); return !!D && prog < 1; };
    self.tick = function (t) { if (t0 === null) t0 = t; prog = Math.min(1, (t - t0) / 2.2); self.draw(); };
    self.draw = function () {
      var f = fit(cv, function (w) { return w < 560 ? 440 : clamp(w * 0.56, 380, 540); }), c = f.c, W = f.w, H = f.h;
      c.clearRect(0, 0, W, H);
      var x0 = 52, x1 = W - 20, y0 = 20, y1 = H - 44;
      if (!D) { text(c, loading ? 'loading 11,509 materials…' : 'the data load when this figure is on screen', (x0 + x1) / 2, (y0 + y1) / 2, P.muted, MONO, 'center'); return; }
      var e = ease(prog);
      var mxF = function (v, r) { return x0 + (v - r[0]) / (r[1] - r[0]) * (x1 - x0); }, myF = function (v, r) { return y1 - (v - r[0]) / (r[1] - r[0]) * (y1 - y0); };
      var PX = function (i) { return (1 - e) * mxF(D.gx[i], GXR) + e * mxF(D.x[i], XR); }, PY = function (i) { return (1 - e) * myF(D.gy[i], GYR) + e * myF(D.y[i], YR); };
      axes(c, x0, y0, x1, y1);
      c.save(); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
      if (mode === 'c' && field) { c.globalAlpha = e * 0.92; c.imageSmoothingEnabled = true; c.drawImage(field, x0, y0, x1 - x0, y1 - y0); c.globalAlpha = 1; }
      c.globalAlpha = e;
      c.strokeStyle = mode === 'c' ? rgba(P.ink, 0.25) : P.line2; c.lineWidth = 1; c.setLineDash(mode === 'c' ? [3, 3] : []);
      c.beginPath(); c.moveTo(mxF(0, XR), y0); c.lineTo(mxF(0, XR), y1); c.moveTo(x0, myF(0, YR)); c.lineTo(x1, myF(0, YR)); c.stroke(); c.setLineDash([]);
      c.globalAlpha = 1;
      var shownN = 0, i, g, pass;
      if (mode === 'f') {                                   // classes: manuscript marker symbols
        var r = W < 560 ? 2.6 : 3.4, edge = P.dark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.45)';
        for (pass = 0; pass < 2; pass++) for (g = 0; g < FAM.length; g++) {
          c.fillStyle = famCol(g); c.strokeStyle = edge; c.lineWidth = 0.6; c.globalAlpha = pass ? 0.95 : 0.06;
          for (i = 0; i < D.n; i++) {
            if (D.c[i] !== g) continue; var on = shown(i); if (on !== (pass === 1)) continue;
            if (pass) shownN++;
            symPath(c, FAM[g][1], PX(i), PY(i), r); c.fill(); if (pass) c.stroke();
          }
        }
        c.globalAlpha = 1;
      } else {                                              // Theta_D points, or faint dots over the contour
        var sz = W < 560 ? 2.2 : 2.6, dot = P.dark ? '#ffffff' : '#141820';
        for (pass = 0; pass < 2; pass++) for (g = 0; g < 10; g++) {
          var tc = turbo((g + 0.5) / 10);
          c.fillStyle = mode === 'c' ? dot : 'rgb(' + Math.round(tc[0]) + ',' + Math.round(tc[1]) + ',' + Math.round(tc[2]) + ')';
          c.globalAlpha = pass ? (mode === 'c' ? (1 - e) * 0.8 + e * 0.26 : 0.82) : 0.06;
          var s2 = mode === 'c' && e > 0.99 ? 1.6 : sz;
          for (i = 0; i < D.n; i++) {
            if (D.bin[i] !== g) continue; var on2 = shown(i); if (on2 !== (pass === 1)) continue;
            if (pass) shownN++;
            c.fillRect(PX(i) - s2 / 2, PY(i) - s2 / 2, s2, s2);
          }
        }
        c.globalAlpha = 1;
      }
      if (mode === 'f' && e > 0.95 && fam < 0) {           // the manuscript's annotated regions and compounds
        REGIONS.forEach(function (R) {
          var cx = mxF(R[0], XR), cy = myF(R[1], YR), rx = R[2] / (XR[1] - XR[0]) * (x1 - x0), ry = R[3] / (YR[1] - YR[0]) * (y1 - y0);
          var col = P.dark ? mix(R[8], '#ffffff', 0.4) : R[8];
          c.save(); c.translate(cx, cy); c.rotate(R[4]); c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU); c.restore();
          c.setLineDash([7, 5]); c.strokeStyle = col; c.lineWidth = 2; c.stroke(); c.setLineDash([]);
          var font = '500 12px Inter, sans-serif', lines = R[5].split('\n'), lh = 15; c.font = font;
          var tw = Math.max.apply(null, lines.map(function (l) { return c.measureText(l).width; }));
          var lx = clamp(mxF(R[6], XR), x0 + tw / 2 + 8, x1 - tw / 2 - 8), ly = clamp(myF(R[7], YR), y0 + 16, y1 - lh * (lines.length - 1) - 8);
          c.fillStyle = rgba(P.surface, 0.9); roundRect(c, lx - tw / 2 - 7, ly - 14, tw + 14, lh * lines.length + 7, 6); c.fill();
          lines.forEach(function (l, k) { text(c, l, lx, ly + k * lh, col, font, 'center'); });
        });
        D.marks.forEach(function (k) {
          if (!shown(k)) return;
          var px = PX(k), py = PY(k), isC = D.f[k] === 'C', lbl = isC ? 'C (allotropes)' : D.f[k].replace(/(\d+)/g, '_{$1}');
          c.save(); c.shadowColor = P.surface; c.shadowBlur = 4; text(c, lbl, isC ? px - 6 : px + 6, py - 6, P.ink, '600 11.5px Inter, sans-serif', isC ? 'right' : 'left'); c.restore();
        });
      }
      if (e > 0.6) {                                        // loadings (biplot arrows, scaled x4)
        c.globalAlpha = (e - 0.6) / 0.4;
        var ox = mxF(0, XR), oy = myF(0, YR);
        Object.keys(D.load).forEach(function (k) {
          var l = D.load[k], ex = mxF(l[0] * LSC, XR), ey = myF(l[1] * LSC, YR), ang = Math.atan2(ey - oy, ex - ox);
          c.strokeStyle = P.ink; c.fillStyle = P.ink; c.lineWidth = 1.6;
          c.beginPath(); c.moveTo(ox, oy); c.lineTo(ex, ey); c.stroke();
          c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex - 8 * Math.cos(ang - 0.4), ey - 8 * Math.sin(ang - 0.4)); c.lineTo(ex - 8 * Math.cos(ang + 0.4), ey - 8 * Math.sin(ang + 0.4)); c.closePath(); c.fill();
          var nud = { YM: [4, -10], SM: [10, 9] }[k] || [0, 0];
          var lx = ex + 14 * Math.cos(ang) + nud[0], ly = ey + 14 * Math.sin(ang) + 4 + nud[1];
          c.font = MONO; var tw = c.measureText(LBL[k].replace(/[_{}]/g, '')).width;
          c.fillStyle = rgba(P.surface, 0.9); roundRect(c, lx - tw / 2 - 5, ly - 12, tw + 10, 17, 5); c.fill();
          text(c, LBL[k], lx, ly, P.ink, MONO, 'center');
        });
        c.globalAlpha = 1;
      }
      if (mode === 'f' && e > 0.95 && fam >= 0) {
        var cc = D.cen[fam], lx2 = mxF(cc[0], XR), ly2 = myF(cc[1], YR), nm = D.cats[fam];
        c.font = MONO_S; var tw2 = c.measureText(nm).width;
        c.fillStyle = rgba(P.surface, 0.9); roundRect(c, lx2 - tw2 / 2 - 6, ly2 - 11, tw2 + 12, 17, 5); c.fill(); c.strokeStyle = famCol(fam); c.lineWidth = 1.4; c.stroke();
        text(c, nm, lx2, ly2 + 1, P.ink, MONO_S, 'center');
      }
      c.restore();
      c.globalAlpha = e;                                    // axis labels
      for (var q = -5; q <= 15; q += 5) text(c, q + '', mxF(q, XR), y1 + 16, P.muted, MONO_S, 'center');
      for (q = -4; q <= 4; q += 2) text(c, q + '', x0 - 8, myF(q, YR) + 4, P.muted, MONO_S, 'right');
      text(c, 'PC1 (' + D.ev[0].toFixed(1) + '% of variance)', (x0 + x1) / 2, y1 + 32, P.muted, MONO_S, 'center');
      c.save(); c.translate(x0 - 36, (y0 + y1) / 2); c.rotate(-Math.PI / 2); text(c, 'PC2 (' + D.ev[1].toFixed(1) + '%)', 0, 0, P.muted, MONO_S, 'center'); c.restore();
      c.globalAlpha = 1 - e;
      if (e < 1) { text(c, 'standardised G_{VRH}', (x0 + x1) / 2, y1 + 32, P.muted, MONO_S, 'center'); c.save(); c.translate(x0 - 36, (y0 + y1) / 2); c.rotate(-Math.PI / 2); text(c, 'standardised ρ', 0, 0, P.muted, MONO_S, 'center'); c.restore(); }
      c.globalAlpha = 1;
      if (mode !== 'f') {                                   // turbo colour bar
        var bw = 170, bh = 9, bx = x1 - bw - 10, by = y0 + 14;
        c.fillStyle = rgba(P.surface, 0.92); roundRect(c, bx - 10, by - 10, bw + 20, bh + 40, 7); c.fill();
        var gr = c.createLinearGradient(bx, 0, bx + bw, 0); TURBO.forEach(function (h, k) { gr.addColorStop(k / (TURBO.length - 1), h); });
        c.fillStyle = gr; c.fillRect(bx, by, bw, bh);
        [20, 100, 300, 1000].forEach(function (T) { var u = (Math.log10(T) - L0) / (L1 - L0); text(c, T + '', bx + u * bw, by + bh + 13, P.muted, MONO_S, 'center'); });
        text(c, 'Θ_D (K, log scale)', bx + bw, by + bh + 27, P.faint, MONO_S, 'right');
      }
      if (hover >= 0 && prog >= 1) { c.strokeStyle = P.ink; c.lineWidth = 1.5; c.beginPath(); c.arc(PX(hover), PY(hover), 7, 0, TAU); c.stroke(); }
      count.textContent = 'showing ' + shownN.toLocaleString() + ' of ' + D.n.toLocaleString();
      self._px = PX; self._py = PY;
    };
    function nearest(mx, my) {
      if (!D || prog < 1 || !self._px) return -1;
      var best = -1, bd = 64;
      for (var i = 0; i < D.n; i++) { if (!shown(i)) continue; var dx = self._px(i) - mx, dy = self._py(i) - my, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = i; } }
      return best;
    }
    cv.addEventListener('pointermove', function (e) {
      var r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k = nearest(mx, my);
      if (k !== hover) { hover = k; self.draw(); }
      if (k < 0) { tip.hidden = true; return; }
      tip.innerHTML = '<b>' + D.f[k] + '</b><span>' + D.cats[D.c[k]] + '</span><span>Θ<sub>D</sub> = ' + D.t[k] + ' K</span><span>PC1 ' + D.x[k].toFixed(2) + ' · PC2 ' + D.y[k].toFixed(2) + '</span>';
      tip.hidden = false;
      tip.style.transform = 'translate(' + Math.min(mx + 14, r.width - 200) + 'px,' + Math.max(8, my - 78) + 'px)';
    });
    cv.addEventListener('pointerleave', function () { hover = -1; tip.hidden = true; self.draw(); });
    function seg(el, attr, set) {
      el.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () { el.querySelectorAll('button').forEach(function (q) { q.setAttribute('aria-pressed', String(q === b)); }); set(b.getAttribute(attr)); self.draw(); });
      });
    }
    function symImg(g) {
      var k = document.createElement('canvas'); k.width = k.height = 28; var x = k.getContext('2d'); x.scale(2, 2);
      x.fillStyle = famCol(g); x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 0.8; symPath(x, FAM[g][1], 7, 7, 4.6); x.fill(); x.stroke();
      return '<img alt="" src="' + k.toDataURL() + '" width="14" height="14">';
    }
    function buildLegend() {
      legend.innerHTML = ''; legend.hidden = mode !== 'f' || !D;
      if (legend.hidden) return;
      D.cats.forEach(function (name, k) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'fam'; b.setAttribute('aria-pressed', String(fam === k));
        b.innerHTML = symImg(k) + name + ' <small>' + D.cen[k][2].toLocaleString() + '</small>';
        b.addEventListener('click', function () { fam = fam === k ? -1 : k; legend.querySelectorAll('button').forEach(function (q, j) { q.setAttribute('aria-pressed', String(fam === j)); }); self.draw(); });
        legend.appendChild(b);
      });
    }
    seg(segM, 'data-m', function (v) { mode = v; fam = -1; buildLegend(); });
    seg(segR, 'data-r', function (v) { reg = v; });
    replay.addEventListener('click', function () { if (!D) { load(); return; } prog = 0; t0 = null; hover = -1; kick(); });
    self.theme = function () { if (D) buildLegend(); };
    register(self);
    return self;
  }

  /* ------------------------------------------------------------ boot */
  function boot() {
    readP();
    var make = [['hero-viz', Hero], ['viz-plasmon', Plasmon], ['viz-debye', Debye], ['viz-pca', PCA], ['viz-sfe', SFE], ['viz-tise', TISE], ['viz-mol', Mol]];
    make.forEach(function (m) {
      var el = document.getElementById(m[0]); if (!el) return;
      try { var w = m[1](el); if (w) w.draw(); } catch (err) { if (window.console) console.error(m[0], err); }
    });
    kick();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(boot, boot); else window.addEventListener('load', boot);
})();
