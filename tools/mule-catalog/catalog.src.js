/* Fig: the MuleSoft Developer syllabus as a library card catalog.
   Twelve drawers, one per exam section in exam order. A drawer pulls out as far as the
   section weighs (4 units per 1% of the exam), read off the scale on its right wall.
   Inside, one index card per exam objective; cards stand up, lit, as the section's
   topics are finished. The ruler on the top is the whole exam, 0-100%, with a major
   tick at every section boundary.
   Runs on Safari 12 (iOS 12 iPads): no nullish or optional chaining, no pointer events,
   and IntersectionObserver only when it exists.
   The kit functions (iso, slabOf, solidSvg ...) are inlined above this file by build.mjs. */

var MCAT = (function () {
  'use strict';

  // ---------- Model ----------
  // Four drawers across on wide screens; three across (a taller cabinet) on phones,
  // so the drawers stay big enough to read and tap at 390 px.
  var COLS, ROWS, W, BODY1, TOP1, WIDTH, HEIGHT, P;
  var OW = 36, OH = 20, ST = 3;            // drawer opening and frame stile
  var D = 50;                              // carcass depth; front face at y = D
  var FOOT = 5, PLINTH = 8;
  var BODY0 = FOOT + PLINTH;               // 13
  var TOP = 5;
  var PER_PCT = 4;                          // drawer travel per 1% of the exam
  var TRAY_LEN = 46, WALL_H = 9, WALL_T = 1.2;
  var CARD_GAP = 3.6, CARD_H = 13, CARD_UP = 2.6;

  function setup(cols) {
    COLS = cols; ROWS = 12 / cols;
    W = COLS * OW + (COLS + 1) * ST;                 // 159 or 120
    BODY1 = BODY0 + ROWS * OH + (ROWS + 1) * ST;     // 85 or 108
    TOP1 = BODY1 + TOP;
    WIDTH = 640; HEIGHT = cols === 4 ? 430 : 540;
    var pts = boxCorners({ x: -3, y: -1, w: W + 6, d: D + 4 }, 0, TOP1 + 6);
    for (var i = 0; i < 12; i++) {
      var o = openingOf(i);
      pts.push([o.x0, D + 10 * PER_PCT + 1, o.zb], [o.x0, D + 10 * PER_PCT + 1, o.zb + OH + CARD_UP + 4]);
    }
    P = fitProjection(pts, WIDTH, HEIGHT, { pad: cols === 4 ? 22 : 10, azimuth: 58 });
  }

  function openingOf(i) {
    var c = i % COLS, r = Math.floor(i / COLS);
    var x0 = ST + c * (OW + ST);
    var zt = BODY1 - ST - r * (OH + ST);
    return { x0: x0, zb: zt - OH, cx: x0 + OW / 2 };
  }

  var at = function (p) { return iso(p, P); };
  var S = function (paths, style) { return solidSvg(paths, style); };
  var L = function (d, style) { return lineSvg(d, style); };
  var Dots = function (pts, style) { return dotsSvg(pts.map(at), style); };
  var poly = function (pts) { return pathOf(pts.map(at), true); };
  var seg = function (a, b) { return pathOf([at(a), at(b)]); };
  // A rectangle on the front plane y = const
  var faceRect = function (x0, x1, z0, z1, y) { return poly([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]); };
  var shade = function (d, n) { return '<path class="iso-shade" data-shade="' + n + '" d="' + d + '"/>'; };

  // ---------- Static cabinet ----------
  function base() {
    var out = [];
    var plinth = { x: 2, y: 2, w: W - 4, d: D - 4, r: 1 };
    out.push('<path class="mcat-halo" filter="url(#mcatBlur)" d="' + haloOf({ x: -2, y: -2, w: W + 4, d: D + 4, r: 6 }, 0, 0.1, P) + '"/>');
    var feet = corners(plinth, 7).sort(function (a, b) { return depthOf([a[0], a[1], 0], P) - depthOf([b[0], b[1], 0], P); });
    feet.forEach(function (f) {
      out.push(S(cylinder(f[0], f[1], 4.6, 0, 1.4, P, 24), { tone: 'lo' }));
      out.push(S(cylinder(f[0], f[1], 3.6, 1.4, FOOT - 1.4, P, 24), { tone: 'lo' }));
    });
    out.push(S(slabOf(plinth, FOOT, PLINTH, P, 4, 0.6), { tone: 'lo' }));
    // Groove along the plinth front, ending on the maker's plate
    var py = plinth.y + plinth.d, mid = W / 2;
    var gz = FOOT + PLINTH - 2.2, ga = plinth.x + 5, gb = plinth.x + plinth.w - 5;
    out.push(L(seg([ga, py, gz], [mid - 13, py, gz]) + seg([mid + 13, py, gz], [gb, py, gz]), { tone: 'faint' }));
    out.push(Dots([[ga, py, gz], [gb, py, gz]], { size: 0.45, tone: 'lo' }));
    // Maker's plate: the one engraved label
    out.push(S(slabOf({ x: mid - 13, y: py, w: 26, d: 0.5, r: 0.3 }, FOOT + 0.8, PLINTH - 1.6, P, 3), { tone: 'mid' }));
    out.push(faceTextSvg(sideMatrix([mid, py + 0.5], FOOT + 3.6, P, 'left'), 'MULE 4 · 60', { size: 2.6, tone: 'mid', anchor: 'middle' }));
    out.push(Dots([[mid - 11.6, py + 0.5, FOOT + 1.8], [mid + 11.6, py + 0.5, FOOT + 1.8], [mid - 11.6, py + 0.5, FOOT + PLINTH - 1.8], [mid + 11.6, py + 0.5, FOOT + PLINTH - 1.8]], { size: 0.45, tone: 'mid' }));
    return out.join('');
  }

  function carcass() {
    var out = [];
    out.push(S(slabOf({ x: 0, y: 0, w: W, d: D, r: 0.6 }, BODY0, BODY1 - BODY0, P, 3), { tone: 'mid' }));
    // Frame-and-panel side (x = W)
    var x = W;
    out.push(L(poly([[x, 5, BODY0 + 5], [x, D - 5, BODY0 + 5], [x, D - 5, BODY1 - 5], [x, 5, BODY1 - 5]]), { tone: 'lo' }));
    out.push(L(poly([[x, 8, BODY0 + 8], [x, D - 8, BODY0 + 8], [x, D - 8, BODY1 - 8], [x, 8, BODY1 - 8]]), { tone: 'faint' }));
    out.push(Dots([[x, 6.5, BODY0 + 6.5], [x, D - 6.5, BODY0 + 6.5], [x, D - 6.5, BODY1 - 6.5], [x, 6.5, BODY1 - 6.5]], { size: 0.4, tone: 'lo' }));
    // Drawer openings: the shadow gap around each front
    for (var i = 0; i < 12; i++) {
      var o = openingOf(i);
      out.push(shade(faceRect(o.x0, o.x0 + OW, o.zb, o.zb + OH, D), 0));
    }
    return out.join('');
  }

  // One drawer front at rest; moved with translateAlong when it is pulled out
  function front(i, s) {
    var o = openingOf(i), cx = o.cx, zb = o.zb, y = D + 0.8;
    var out = [];
    out.push(S(slabOf({ x: o.x0 + 0.5, y: D - 1.2, w: OW - 1, d: 2, r: 0.3 }, zb + 0.5, OH - 1, P, 2, 0.4), { tone: 'mid' }));
    // Label holder (frame proud of the front) with the section's label card
    out.push(S(slabOf({ x: cx - 7.5, y: y, w: 15, d: 0.5, r: 0.2 }, zb + 11, 6, P, 2), { tone: 'mid', crease: 'faint' }));
    out.push(L(faceRect(cx - 6.2, cx + 6.2, zb + 12, zb + 16, y + 0.5), { tone: 'lo' }));
    out.push(L(seg([cx - 5, y + 0.5, zb + 14.6], [cx + 3.4, y + 0.5, zb + 14.6]), { tone: 'lo', free: true }));
    out.push(L(seg([cx - 5, y + 0.5, zb + 13.2], [cx + 1.2, y + 0.5, zb + 13.2]), { tone: 'faint', free: true }));
    out.push(Dots([[cx - 6.9, y + 0.5, zb + 14], [cx + 6.9, y + 0.5, zb + 14]], { size: 0.4, tone: 'mid' }));
    // Bar pull on two posts
    out.push(S(slabOf({ x: cx - 6.4, y: y, w: 1.6, d: 1.6, r: 0.4 }, zb + 6.4, 2.2, P, 2), { tone: 'mid', crease: 'none' }));
    out.push(S(slabOf({ x: cx + 4.8, y: y, w: 1.6, d: 1.6, r: 0.4 }, zb + 6.4, 2.2, P, 2), { tone: 'mid', crease: 'none' }));
    out.push(S(slabOf({ x: cx - 6.8, y: y + 1.4, w: 13.6, d: 1.8, r: 0.9 }, zb + 6, 3, P, 3, 0.3), { tone: 'mid' }));
    // Rod knob: the end of the rod that holds the cards in
    out.push(S(slabOf({ x: cx - 1.5, y: y, w: 3, d: 1.4, r: 1.2 }, zb + 1.8, 2.8, P, 3), { tone: 'mid', crease: 'none' }));
    out.push(Dots([[cx, y + 1.4, zb + 3.2]], { size: 0.45, tone: 'lo' }));
    var t = s ? ' transform="' + translateAlong(P, [0, s, 0]) + '"' : '';
    return '<g class="mcat-front" data-i="' + i + '"' + t + '>' + out.join('') + '</g>';
  }

  var CUM = [];
  function top(sections) {
    var out = [];
    var plan = { x: -2.5, y: -1, w: W + 5, d: D + 3.5, r: 1.5 };
    out.push(S(slabOf(plan, BODY1, TOP, P, 4, 0.8), { tone: 'mid' }));
    out.push(L(planOutline(insetPlan(plan, 4), TOP1, P, 4), { tone: 'faint' }));
    // The exam ruler: 0-100% across the front edge, a major tick at every section boundary
    var strip = { x: 4, y: D - 6.5, w: W - 8, d: 4.4, r: 0.6 };
    out.push(S(slabOf(strip, TOP1, 0.6, P, 3), { tone: 'lo', crease: 'none' }));
    var z = TOP1 + 0.6, unit = (strip.w - 6) / 100, x0 = strip.x + 3, edge = strip.y + strip.d;
    CUM = [0];
    sections.forEach(function (s) { CUM.push(CUM[CUM.length - 1] + s.weight); });
    var minor = '', major = '';
    for (var p = 0; p <= 100; p++) {
      var isMajor = CUM.indexOf(p) >= 0;
      var len = isMajor ? 2.6 : (p % 5 === 0 ? 1.5 : 0.9);
      var d = seg([x0 + p * unit, edge, z], [x0 + p * unit, edge - len, z]);
      if (isMajor) major += d; else minor += d;
    }
    out.push(L(minor, { tone: 'lo' }), L(major, { tone: 'mid' }));
    out.push(Dots([[strip.x + 1.4, strip.y + 2.2, z], [strip.x + strip.w - 1.4, strip.y + 2.2, z]], { size: 0.45, tone: 'mid' }));
    out.push('<g data-part="span"></g>');
    // Desk tray of the 5 unscored questions, lying loose
    var tray = { x: 14, y: 8, w: 32, d: 22, r: 1.2 };
    out.push(S(slabOf(tray, TOP1, 3.2, P, 3, 0.4), { tone: 'lo' }));
    out.push(shade(poly(ringOf(insetPlan(tray, 1.4), 3).map(function (q) { return [q[0], q[1], TOP1 + 3.2]; })), 0));
    for (var c = 0; c < 5; c++) {
      var card = { x: tray.x + 3 + c * 0.9, y: tray.y + 3.4 - c * 0.5, w: 26, d: 16, r: 0.3 };
      out.push(S(slabOf(card, TOP1 + 1.4 + c * 0.35, 0.35, P, 2), { tone: 'lo', crease: 'none', flat: true }));
    }
    out.push(L(seg([tray.x + 9, tray.y + 6, TOP1 + 3.2], [tray.x + 22, tray.y + 6, TOP1 + 3.2]), { tone: 'faint', free: true }));
    out.push(Dots([[tray.x + 2, tray.y + 2, TOP1 + 3.2], [tray.x + tray.w - 2, tray.y + 2, TOP1 + 3.2], [tray.x + 2, tray.y + tray.d - 2, TOP1 + 3.2], [tray.x + tray.w - 2, tray.y + tray.d - 2, TOP1 + 3.2]], { size: 0.4, tone: 'lo' }));
    return { svg: out.join(''), strip: strip, unit: unit, x0: x0, z: z, edge: edge };
  }

  // ---------- The open drawer, rebuilt per frame ----------
  function trayParts(i, s, sec, lo, hi) {
    // Everything of the tray between world y = lo and y = hi (lo < hi), at travel s
    var o = openingOf(i), x0 = o.x0, zb = o.zb;
    var back = D - 1.2 + s - TRAY_LEN, plateBack = D - 1.2 + s;
    var y0 = Math.max(lo, back), y1 = Math.min(hi, plateBack);
    var out = [];
    if (y1 - y0 < 0.2) return '';
    var span = function (a, b) { a = Math.max(a, y0); b = Math.min(b, y1); return b - a > 0.15 ? [a, b - a] : null; };
    var bt = span(back, plateBack);
    if (bt) out.push(S(slabOf({ x: x0 + 0.8, y: bt[0], w: OW - 1.6, d: bt[1], r: 0 }, zb + 0.6, 1, P, 1), { tone: 'lo', crease: 'none' }));
    if (bt) out.push(S(slabOf({ x: x0 + 0.8, y: bt[0], w: WALL_T, d: bt[1], r: 0 }, zb + 0.6, WALL_H, P, 1), { tone: 'mid', crease: 'none' }));
    // Cards, back to front: objectives, then the guide card with its tab
    var n = sec.objectives.length;
    var lit = Math.round(n * sec.frac);
    for (var k = n - 1; k >= -1; k--) {
      var yc = plateBack - 2.5 - CARD_GAP * (k + 1);
      var c = span(yc - 0.4, yc + 0.4);
      if (!c) continue;
      if (k === -1) {
        out.push(S(slabOf({ x: x0 + 3, y: c[0], w: OW - 6, d: c[1], r: 0 }, zb + 1.6, CARD_H + 1, P, 1), { tone: 'mid', crease: 'none' }));
        var tx = x0 + 3.5 + (i % 3) * 9.5;
        out.push(S(slabOf({ x: tx, y: c[0], w: 9, d: c[1], r: 0 }, zb + 1.6 + CARD_H + 1, 2.6, P, 1), { tone: 'mid', crease: 'none' }));
        out.push(L(seg([tx + 1.6, c[0] + c[1], zb + CARD_H + 3.6], [tx + 7, c[0] + c[1], zb + CARD_H + 3.6]), { tone: 'lo', free: true }));
      } else {
        var on = k < lit;
        var h = CARD_H + (on ? CARD_UP : 0);
        var tz = zb + 1.6 + h;
        var face = c[0] + c[1];
        out.push(S(slabOf({ x: x0 + 3, y: c[0], w: OW - 6, d: c[1], r: 0 }, zb + 1.6, h, P, 1), { tone: on ? 'hi' : 'mid', crease: 'none', lit: on }));
        out.push(L(seg([x0 + 5, face, tz - 1.3], [x0 + OW - 9, face, tz - 1.3]), { tone: on ? 'mid' : 'faint', free: true }));
      }
    }
    if (bt) {
      out.push(S(slabOf({ x: x0 + OW - 0.8 - WALL_T, y: bt[0], w: WALL_T, d: bt[1], r: 0 }, zb + 0.6, WALL_H, P, 1), { tone: 'mid', crease: 'none' }));
      // Travel scale on the right wall's top: one tick per 1% of the exam, read at the cabinet face
      var tz2 = zb + 0.6 + WALL_H, xw = x0 + OW - 0.8 - WALL_T, minor = '', major = '';
      for (var pct = 1; pct <= 10; pct++) {
        var ty = D + s - pct * PER_PCT;
        if (ty < y0 + 0.2 || ty > y1 - 0.2) continue;
        var d = seg([xw, ty, tz2], [xw + (pct % 5 === 0 ? WALL_T : WALL_T * 0.6), ty, tz2]);
        if (pct % 5 === 0) major += d; else minor += d;
      }
      out.push(L(minor, { tone: 'lo' }), L(major, { tone: 'hi' }));
    }
    return out.join('');
  }

  function recess(i, s, sec) {
    var o = openingOf(i), x0 = o.x0, zb = o.zb;
    var out = [];
    out.push(shade(faceRect(x0, x0 + OW, zb, zb + OH, D), 0));
    out.push(shade(poly([[x0, D, zb], [x0, D, zb + OH], [x0, D - 14, zb + OH], [x0, D - 14, zb]]), 1));
    out.push(shade(poly([[x0, D, zb], [x0 + OW, D, zb], [x0 + OW, D - 14, zb], [x0, D - 14, zb]]), 2));
    out.push(trayParts(i, s, sec, D - 30, D));
    return '<g clip-path="url(#mcatHole' + i + ')">' + out.join('') + '</g>';
  }

  // ---------- Page pieces ----------
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  var questionsOf = function (sec) { return Math.round(sec.weight * 60 / 100); };
  function readoutOf(i, sec) {
    return pad2(i + 1) + ' · ' + sec.weight + '% · ≈' + questionsOf(sec) + ' of 60 Q · ' + sec.done + '/' + sec.topics + ' topics';
  }

  function svgOf(sections, t) {
    var defs = '<defs><filter id="mcatBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>';
    for (var i = 0; i < 12; i++) {
      var o = openingOf(i);
      defs += '<clipPath id="mcatHole' + i + '"><path d="' + faceRect(o.x0, o.x0 + OW, o.zb, o.zb + OH, D) + '"/></clipPath>';
    }
    defs += '</defs>';
    var fronts = '';
    for (var j = 0; j < 12; j++) fronts += front(j, 0);
    return figureSvg({
      width: WIDTH, height: HEIGHT,
      label: 'A library card catalog with twelve drawers, one for each section of the MuleSoft Developer exam. Each drawer pulls out as far as its share of the exam, and holds one index card per exam objective.',
      body: [defs, base(), carcass(), '<g data-part="fronts">' + fronts + '</g>', '<g data-part="open"></g>', t.svg]
    });
  }

  // ---------- Mount ----------
  var live = null;
  function mount(root, opts) {
    if (live) live.stop();
    var sections = opts.sections;
    var narrow = opts.cols ? opts.cols === 3 : (root.clientWidth || 999) < 520;
    setup(narrow ? 3 : 4);
    var t = top(sections);
    var stage = '<div class="iso-stage mcat-stage" tabindex="0" role="slider" aria-label="Exam sections as catalog drawers. Arrow keys open the next or previous drawer, Enter opens its topics." aria-valuemin="1" aria-valuemax="12" aria-valuenow="1">' + svgOf(sections, t) + '</div>';
    root.innerHTML = plateHtml({
      fig: 'Fig 1', title: 'The exam, filed', hint: opts.hint || (narrow ? 'Tap a drawer' : 'Tap a drawer · tap again for its topics'), readout: '',
      keys: [
        { mark: 'lit', label: 'Cards stand up as you finish the section\'s topics' },
        { mark: 'raised', label: 'One card per exam objective' },
        { mark: 'dim', label: 'Ruler on top: the whole exam, 0–100%' }
      ],
      caption: 'Twelve drawers, one per exam section in exam order. Each drawer pulls out 4 units per 1% of the exam, so a 10% section comes out twice as far as a 5% one; read it off the scale on the drawer wall.',
      body: stage
    }) + '<div class="mcat-detail" aria-live="polite"></div>';

    var svg = root.querySelector('svg');
    var stageEl = root.querySelector('.mcat-stage');
    var openG = svg.querySelector('[data-part="open"]');
    var spanG = svg.querySelector('[data-part="span"]');
    var readout = root.querySelector('[data-readout]');
    var detail = root.querySelector('.mcat-detail');
    var fronts = svg.querySelectorAll('.mcat-front');
    var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    var shown = -1, s = 0, want = opts.selected >= 0 ? opts.selected : 0, frame = 0, last = 0;
    var touring = !still, tourTimer = 0, idleTimer = 0, visible = true, changedAt = 0, alive = true;

    function drawSpan(i) {
      var a = t.x0 + CUM[i] * t.unit, b = t.x0 + CUM[i + 1] * t.unit, y = t.edge - 1.3;
      spanG.innerHTML = lineSvg(seg([a, y, t.z], [b, y, t.z]), { tone: 'lit' }) + dotsSvg([at([a, y, t.z]), at([b, y, t.z])], { size: 0.7, tone: 'hi' });
    }
    function describe(i) {
      var sec = sections[i];
      readout.textContent = readoutOf(i, sec);
      stageEl.setAttribute('aria-valuenow', String(i + 1));
      stageEl.setAttribute('aria-valuetext', sec.title + ', ' + sec.weight + ' percent of the exam, ' + sec.done + ' of ' + sec.topics + ' topics done');
      detail.innerHTML = '<div class="mcat-detail__head"><span class="mono">' + pad2(i + 1) + '</span><h3>' + esc(sec.title) + '</h3><span class="chip">' + sec.weight + '%</span><span class="chip">≈' + questionsOf(sec) + ' questions</span></div>' +
        '<ol class="mcat-detail__list">' + sec.objectives.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' +
        (sec.topics ? '<button type="button" class="btn btn--sm btn--primary" data-act="jump" data-id="' + esc(sec.id) + '"><i class="ph ph-arrow-down"></i>Open the ' + sec.topics + ' topics<span class="count">' + sec.done + '/' + sec.topics + '</span></button>' : '');
    }
    function draw() {
      if (shown < 0) { openG.innerHTML = ''; return; }
      var sec = sections[shown];
      for (var k = 0; k < fronts.length; k++) fronts[k].style.visibility = (k === shown && s > 0.05) ? 'hidden' : '';
      if (s <= 0.05) { openG.innerHTML = ''; return; }
      openG.innerHTML = '<g data-i="' + shown + '">' + recess(shown, s, sec) + trayParts(shown, s, sec, D, D + 200) + front(shown, s) + '</g>';
    }
    function strokeOf(i) { return sections[i].weight * PER_PCT; }
    function tick(now) {
      frame = 0;
      if (!alive) return;
      if (!root.parentNode || !document.body.contains(root)) { stop(); return; }
      var dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
      last = now;
      var target = shown === want ? strokeOf(shown) : 0;
      if (shown < 0) target = 0;
      var k = still ? 1 : 1 - Math.exp(-dt / 0.16);
      s += (target - s) * k;
      if (Math.abs(target - s) < 0.05) s = target;
      if (s === 0 && shown !== want) { shown = want; }
      draw();
      var settled = shown === want && s === strokeOf(shown);
      if (!settled && visible) { frame = requestAnimationFrame(tick); } else { last = 0; }
    }
    function run() { if (!frame && alive && visible) { last = 0; frame = requestAnimationFrame(tick); } }
    function select(i, byUser) {
      i = (i + 12) % 12;
      if (byUser) {
        touring = false; clearTimeout(idleTimer);
        if (!still) idleTimer = setTimeout(function () { touring = true; scheduleTour(); }, 9000);
      }
      if (i !== want) { want = i; changedAt = Date.now(); describe(i); drawSpan(i); if (opts.onSelect) opts.onSelect(sections[i].id); }
      run();
    }
    function scheduleTour() {
      clearTimeout(tourTimer);
      if (!touring || !alive) return;
      tourTimer = setTimeout(function () { if (touring && visible) select(want + 1, false); scheduleTour(); }, 3200);
    }
    function indexFrom(target) {
      while (target && target !== svg) {
        if (target.getAttribute && target.getAttribute('data-i') !== null) return Number(target.getAttribute('data-i'));
        target = target.parentNode;
      }
      return -1;
    }
    svg.addEventListener('mouseover', function (e) { var i = indexFrom(e.target); if (i >= 0) select(i, true); });
    svg.addEventListener('click', function (e) {
      var i = indexFrom(e.target);
      if (i < 0) return;
      if (i === want && i === shown && Date.now() - changedAt > 450) { if (opts.onPick) opts.onPick(sections[i].id); }
      else select(i, true);
    });
    stageEl.addEventListener('keydown', function (e) {
      var k = e.key, i = null;
      if (k === 'ArrowRight' || k === 'Right') i = want + 1;
      if (k === 'ArrowLeft' || k === 'Left') i = want - 1;
      if (k === 'ArrowDown' || k === 'Down') i = want + COLS;
      if (k === 'ArrowUp' || k === 'Up') i = want - COLS;
      if (k === 'Home') i = 0;
      if (k === 'End') i = 11;
      if (k === 'Enter' && opts.onPick) { e.preventDefault(); opts.onPick(sections[want].id); return; }
      if (i === null) return;
      e.preventDefault();
      select(i, true);
    });
    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (entries) {
        visible = entries[entries.length - 1].isIntersecting;
        if (visible) run();
      }, { rootMargin: '80px 0px' });
      io.observe(stageEl);
    }
    function stop() {
      alive = false; clearTimeout(tourTimer); clearTimeout(idleTimer);
      if (frame) cancelAnimationFrame(frame);
      if (io) io.disconnect();
      if (live && live.root === root) live = null;
    }
    // Open the first drawer straight away, fully, so the figure reads before any motion
    shown = want; s = strokeOf(want); describe(want); drawSpan(want); draw();
    scheduleTour();
    live = { root: root, stop: stop };
    return live;
  }

  return { mount: mount };
})();
if (typeof window !== 'undefined') window.MuleCatalog = MCAT;
