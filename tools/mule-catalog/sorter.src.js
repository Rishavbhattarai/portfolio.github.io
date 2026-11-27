/* Fig: the flashcard game as a Leitner sorting machine.
   The card being studied stands lit on the reading stand. Grade it and the carriage on the
   overhead rail picks it up and files it in the compartment for its next review (the real
   SM-2 interval), or carries it back to the hopper on Again. The last compartment is past the
   flag on exam day: those cards are exam-safe. The dial reads the combo, the ruler on the
   front edge the exam-safe count across all cards.
   Same rules as the catalog: Safari 12 safe, kit inlined above by build.mjs. */

var MSORT = (function () {
  'use strict';

  var WIDTH = 680, HEIGHT = 340, P;
  var BASE = { x: 0, y: 0, w: 300, d: 100, r: 3 }, BASE_H = 7, FOOT_H = 4;
  var WT = 1.4;                                        // wall thickness
  var HOP = { x: 6, y: 36, w: 58, d: 44, r: 0.8 }, HOP_H = 14, HOP_DIV = 35;
  var STAND = { x: 72, y: 44, w: 26, d: 28, r: 1.2 }, STAND_H = 5, PICK_X = 85;
  var BINS = { x: 106, y: 36, w: 180, d: 44, r: 0.8 }, BIN_H = 16, FLOOR = 1.2;
  var CARD = { y0: 38, d: 40, h: 24, t: 0.6 };
  var RAIL = { x0: 6, x1: 294, y: 55, d: 6, z: 64, h: 4 };
  var SPLIT = RAIL.y + RAIL.d / 2;                     // carried parts split here around the rail
  var PARK_Z = 60;                                     // jaw height while travelling
  var PITCH = 0.55, LAY = 0.42;                         // filed card depth, lying card height
  var DIAL = [278, 89], DIAL_R = 8;
  var RULER = { x: 108, y: 85, w: 156, d: 6, r: 0.8 };

  function setup() {
    var pts = boxCorners({ x: BASE.x, y: BASE.y, w: BASE.w, d: BASE.d }, -BASE_H - FOOT_H, RAIL.z + RAIL.h + 3);
    pts.push([BINS.x, BINS.y - 2, 50]);
    P = fitProjection(pts, WIDTH, HEIGHT, { pad: 16, azimuth: 60 });
  }
  setup();

  var at = function (p) { return iso(p, P); };
  var S = function (paths, style) { return solidSvg(paths, style); };
  var L = function (d, style) { return lineSvg(d, style); };
  var Dots = function (pts, style) { return dotsSvg(pts.map(at), style); };
  var seg = function (a, b) { return pathOf([at(a), at(b)]); };
  var box = function (plan, z, h, style, bevel) { return S(slabOf(plan, z, h, P, 2, bevel || 0), style); };
  var shade = function (d, n) { return '<path class="iso-shade" data-shade="' + n + '" d="' + d + '"/>'; };
  var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  // ---------- Geometry helpers ----------
  function binGeom(n) {
    var bw = (BINS.w - (n + 1) * WT) / n, out = [];
    for (var i = 0; i < n; i++) out.push({ x0: BINS.x + WT + i * (bw + WT), w: bw });
    return out;
  }
  function stackEnd(g, count) { return g.x0 + 0.4 + Math.min(count * PITCH, g.w - 1.2); }

  // A filed (upright) stack in one compartment
  function filed(g, count) {
    if (!count) return '';
    var w = Math.max(0.6, Math.min(count * PITCH, g.w - 0.8));
    var plan = { x: g.x0 + 0.4, y: CARD.y0, w: w, d: CARD.d, r: 0 };
    var z1 = FLOOR + CARD.h, out = [box(plan, FLOOR, CARD.h, { tone: 'hi' })];
    var lines = '';
    for (var k = 2; k * PITCH < w - 0.5; k += 2) lines += seg([plan.x + k * PITCH, CARD.y0, z1], [plan.x + k * PITCH, CARD.y0 + CARD.d, z1]);
    if (lines) out.push(L(lines, { tone: 'faint' }));
    return out.join('');
  }
  // A lying stack in the hopper
  function lying(x0, count, cap) {
    var n = Math.min(count, cap);
    if (!n) return '';
    var plan = { x: x0, y: CARD.y0, w: CARD.h, d: CARD.d, r: 0.3 };
    var h = n * LAY, z1 = FLOOR + h;
    return box(plan, FLOOR, h, { tone: 'hi' }) +
      L(seg([x0 + 4, CARD.y0 + 6, z1], [x0 + 18, CARD.y0 + 6, z1]) + seg([x0 + 4, CARD.y0 + 10, z1], [x0 + 14, CARD.y0 + 10, z1]), { tone: 'faint', free: true });
  }

  // ---------- Static scene (rebuilt when the counts change) ----------
  function scene(m, shown) {
    var out = [];
    out.push('<path class="mcat-halo" filter="url(#msortBlur)" d="' + haloOf({ x: -3, y: -3, w: BASE.w + 6, d: BASE.d + 6, r: 6 }, -BASE_H - FOOT_H, 0.1, P) + '"/>');
    var feet = corners(BASE, 10).sort(function (a, b) { return depthOf([a[0], a[1], 0], P) - depthOf([b[0], b[1], 0], P); });
    feet.forEach(function (f) { out.push(S(cylinder(f[0], f[1], 4.4, -BASE_H - FOOT_H, FOOT_H, P, 24), { tone: 'lo' })); });
    out.push(box(BASE, -BASE_H, BASE_H, { tone: 'lo' }, 0.8));
    out.push(L(planOutline(insetPlan(BASE, 4), 0, P, 2), { tone: 'faint' }));
    out.push(Dots(corners(BASE, 7).map(function (c) { return [c[0], c[1], 0]; }), { size: 0.45, tone: 'lo' }));

    // Posts for the rail
    [RAIL.x0 - 6, RAIL.x1].forEach(function (x) {
      out.push(box({ x: x, y: RAIL.y - 1, w: 6, d: RAIL.d + 2, r: 0.8 }, 0, 3, { tone: 'mid' }));
      out.push(box({ x: x + 1, y: RAIL.y, w: 4, d: RAIL.d, r: 0.6 }, 3, RAIL.z + RAIL.h - 3, { tone: 'mid', crease: 'none' }));
    });

    // Exam-day flag, behind the compartments at the boundary of the exam-safe one
    var g = binGeom(m.bins.length), safeI = -1;
    m.bins.forEach(function (b, i) { if (b.safe && safeI < 0) safeI = i; });
    if (safeI > 0) {
      var fx = g[safeI].x0 - WT / 2;
      out.push(box({ x: fx - 0.7, y: BINS.y - 1.8, w: 1.4, d: 1.4, r: 0.6 }, 0, 48, { tone: 'mid', crease: 'none' }));
      out.push(box({ x: fx + 0.7, y: BINS.y - 1.5, w: 12, d: 0.5, r: 0 }, 40, 7, { tone: 'hi', crease: 'none' }));
      out.push(faceTextSvg(sideMatrix([fx + 6.7, BINS.y - 1], 42, P, 'left'), m.flag || 'EXAM', { size: 2.6, tone: 'hi', anchor: 'middle' }));
    }

    // Hopper: due cards (left), new cards (right)
    var hopFloor = { x: HOP.x, y: HOP.y, w: HOP.w, d: HOP.d, r: HOP.r };
    out.push(box(hopFloor, 0, FLOOR, { tone: 'lo', crease: 'none' }));
    out.push(box({ x: HOP.x, y: HOP.y, w: HOP.w, d: WT, r: 0 }, 0, HOP_H, { tone: 'mid', crease: 'none' }));
    out.push(box({ x: HOP.x, y: HOP.y, w: WT, d: HOP.d, r: 0 }, 0, HOP_H, { tone: 'mid', crease: 'none' }));
    out.push(lying(HOP.x + WT + 1.4, shown.due, 30));
    out.push(box({ x: HOP.x + HOP_DIV - HOP.x - 0, y: HOP.y + WT, w: WT, d: HOP.d - 2 * WT, r: 0 }, 0, HOP_H - 3, { tone: 'mid', crease: 'none' }));
    out.push(lying(HOP_DIV + WT + 1.2, shown.fresh, 30));
    out.push(box({ x: HOP.x + HOP.w - WT, y: HOP.y, w: WT, d: HOP.d, r: 0 }, 0, HOP_H, { tone: 'mid', crease: 'none' }));
    out.push(box({ x: HOP.x, y: HOP.y + HOP.d - WT, w: HOP.w, d: WT, r: 0 }, 0, HOP_H, { tone: 'mid' }));
    [[HOP.x + 15, 1], [HOP.x + 43, 2]].forEach(function (p) {
      var y = HOP.y + HOP.d;
      out.push(box({ x: p[0] - 6, y: y, w: 12, d: 0.4, r: 0 }, 7, 6, { tone: 'mid', crease: 'none' }));
      out.push(L(seg([p[0] - 4, y + 0.4, 11], [p[0] + (p[1] === 1 ? 3 : 1), y + 0.4, 11]) + seg([p[0] - 4, y + 0.4, 9], [p[0] + 1, y + 0.4, 9]), { tone: 'lo', free: true }));
      out.push(Dots([[p[0] - 5.2, y + 0.4, 10], [p[0] + 5.2, y + 0.4, 10]], { size: 0.4, tone: 'mid' }));
    });

    // Compartments: floor, back and left walls, then each stack and divider, right and front walls
    out.push(box(BINS, 0, FLOOR, { tone: 'lo', crease: 'none' }));
    out.push(box({ x: BINS.x, y: BINS.y, w: BINS.w, d: WT, r: 0 }, 0, BIN_H, { tone: 'mid', crease: 'none' }));
    out.push(box({ x: BINS.x, y: BINS.y, w: WT, d: BINS.d, r: 0 }, 0, BIN_H, { tone: 'mid', crease: 'none' }));
    g.forEach(function (b, i) {
      out.push(filed(b, shown.bins[i]));
      if (i < g.length - 1) out.push(box({ x: b.x0 + b.w, y: BINS.y + WT, w: WT, d: BINS.d - 2 * WT, r: 0 }, 0, BIN_H, { tone: 'mid', crease: 'none' }));
    });
    out.push(box({ x: BINS.x + BINS.w - WT, y: BINS.y, w: WT, d: BINS.d, r: 0 }, 0, BIN_H, { tone: 'mid', crease: 'none' }));
    out.push(box({ x: BINS.x, y: BINS.y + BINS.d - WT, w: BINS.w, d: WT, r: 0 }, 0, BIN_H, { tone: 'mid' }));
    g.forEach(function (b, i) {
      var cx = b.x0 + b.w / 2, y = BINS.y + BINS.d;
      out.push(box({ x: cx - 7, y: y, w: 14, d: 0.4, r: 0 }, 5, 7, { tone: m.bins[i].safe ? 'hi' : 'mid', crease: 'none' }));
      var lines = seg([cx - 5, y + 0.4, 9.6], [cx + 3, y + 0.4, 9.6]) + seg([cx - 5, y + 0.4, 7.6], [cx + (i % 2 ? 1 : -1), y + 0.4, 7.6]);
      out.push(L(lines, { tone: 'lo', free: true }));
      out.push(Dots([[cx - 6.2, y + 0.4, 8.5], [cx + 6.2, y + 0.4, 8.5]], { size: 0.4, tone: 'mid' }));
    });

    // Exam-safe ruler along the front edge: 0 to all cards, a tick per 10, major per 50
    out.push(box(RULER, 0, 0.6, { tone: 'lo', crease: 'none' }));
    var total = Math.max(1, m.total), u = (RULER.w - 6) / total, rx = RULER.x + 3, ry = RULER.y + RULER.d, rz = 0.6;
    var minor = '', major = '';
    for (var c = 0; c <= total; c += 10) {
      var d = seg([rx + c * u, ry, rz], [rx + c * u, ry - (c % 50 === 0 ? 2.6 : 1.3), rz]);
      if (c % 50 === 0) major += d; else minor += d;
    }
    out.push(L(minor, { tone: 'lo' }), L(major, { tone: 'mid' }));
    out.push(Dots([[RULER.x + 1.3, RULER.y + 3, rz], [RULER.x + RULER.w - 1.3, RULER.y + 3, rz]], { size: 0.4, tone: 'mid' }));
    var px = rx + Math.min(m.safe, total) * u;
    out.push(box({ x: px - 1.4, y: RULER.y + 0.6, w: 2.8, d: 3.2, r: 0.6 }, rz, 1.6, { tone: 'hi' }));
    out.push(L(seg([px, RULER.y + 0.6, rz + 1.6], [px, RULER.y + 3.8, rz + 1.6]), { tone: 'hi' }));

    // Combo dial
    out.push(S(cylinder(DIAL[0], DIAL[1], DIAL_R, 0, 3, P, 48, 0.4), { tone: 'mid' }));
    out.push(L(ring(DIAL[0], DIAL[1], DIAL_R - 1.4, 3, P, 48), { tone: 'lo' }));
    var ticks = radialTicks(DIAL[0], DIAL[1], DIAL_R - 1.8, 20, 5, 3, [0.9, 1.8], P, -Math.PI * 0.75, Math.PI * 1.5);
    out.push(L(ticks.minor, { tone: 'lo' }), L(ticks.major, { tone: 'mid' }));
    var a = (-0.75 + 1.5 * Math.min(m.combo, 20) / 20) * Math.PI;
    out.push(L(seg([DIAL[0] - Math.sin(a) * 1.6, DIAL[1] + Math.cos(a) * 1.6, 3.2], [DIAL[0] + Math.sin(a) * (DIAL_R - 2.4), DIAL[1] - Math.cos(a) * (DIAL_R - 2.4), 3.2]), { tone: 'hi', free: 'start' }));
    out.push(Dots([[DIAL[0], DIAL[1], 3.2]], { size: 0.8, tone: 'hi' }));
    return out.join('');
  }

  // ---------- Moving parts (rebuilt per frame) ----------
  function cardSolid(x, z0, y0, d, lit) {
    return box({ x: x - CARD.t / 2, y: y0, w: CARD.t, d: d, r: 0 }, z0, CARD.h, { tone: lit ? 'hi' : 'mid', crease: 'none', lit: lit });
  }
  function moving(st) {
    var out = [];
    // Reading stand with its slot lips; the card stands between them
    out.push(box(STAND, 0, STAND_H, { tone: 'mid' }, 0.5));
    out.push(Dots([[STAND.x + 2.4, STAND.y + 2.4, STAND_H], [STAND.x + STAND.w - 2.4, STAND.y + STAND.d - 2.4, STAND_H]], { size: 0.4, tone: 'lo' }));
    out.push(box({ x: PICK_X - 2.2, y: CARD.y0 + 2, w: 1.4, d: CARD.d - 4, r: 0.3 }, STAND_H, 3, { tone: 'mid', crease: 'none' }));
    if (st.stand > 0.02) {
      var h = CARD.h * st.stand;
      out.push(box({ x: PICK_X - CARD.t / 2, y: CARD.y0, w: CARD.t, d: CARD.d, r: 0 }, STAND_H + 0.6, h, { tone: 'hi', crease: 'none', lit: true }));
      out.push(L(seg([PICK_X + 0.3, CARD.y0 + 6, STAND_H + 0.6 + h - 3], [PICK_X + 0.3, CARD.y0 + 26, STAND_H + 0.6 + h - 3]), { tone: 'mid', free: true }));
    }
    out.push(box({ x: PICK_X + 0.8, y: CARD.y0 + 2, w: 1.4, d: CARD.d - 4, r: 0.3 }, STAND_H, 3, { tone: 'mid', crease: 'none' }));

    var x = st.x, jz = st.jz, back = SPLIT - CARD.y0, front = CARD.y0 + CARD.d - SPLIT;
    // Back halves of the carried card and the jaw, then the rod, rail and carriage, then the front halves
    if (st.carry) out.push(cardSolid(x, jz - CARD.h, CARD.y0, back, true));
    out.push(box({ x: x - 1.6, y: CARD.y0 + 0.5, w: 3.2, d: back - 0.5, r: 0 }, jz - 0.6, 2.4, { tone: 'mid', crease: 'none' }));
    out.push(S(cylinder(x, SPLIT, 0.9, jz + 1.8, RAIL.z - 3 - jz - 1.8, P, 16), { tone: 'mid', crease: 'none' }));
    var cw = 14, cx0 = x - cw / 2;
    out.push(box({ x: RAIL.x0, y: RAIL.y, w: Math.max(0.5, cx0 - RAIL.x0), d: RAIL.d, r: 0 }, RAIL.z, RAIL.h, { tone: 'mid' }));
    out.push(box({ x: cx0, y: RAIL.y - 3, w: cw, d: RAIL.d + 6, r: 1 }, RAIL.z - 3, RAIL.h + 6, { tone: 'mid' }, 0.5));
    out.push(Dots([[cx0 + 2.2, RAIL.y + RAIL.d + 3, RAIL.z + 1], [cx0 + cw - 2.2, RAIL.y + RAIL.d + 3, RAIL.z + 1], [cx0 + 2.2, RAIL.y + RAIL.d + 3, RAIL.z + RAIL.h - 1], [cx0 + cw - 2.2, RAIL.y + RAIL.d + 3, RAIL.z + RAIL.h - 1]], { size: 0.45, tone: 'mid' }));
    out.push(box({ x: cx0 + cw, y: RAIL.y, w: Math.max(0.5, RAIL.x1 - cx0 - cw), d: RAIL.d, r: 0 }, RAIL.z, RAIL.h, { tone: 'mid' }));
    // Ruler on the rail's front face, a tick every 4 units, each end on a post
    var ticks = '';
    for (var tx = RAIL.x0 + 4; tx < RAIL.x1 - 1; tx += 4) {
      if (tx > cx0 - 0.5 && tx < cx0 + cw + 0.5) continue;
      ticks += seg([tx, RAIL.y + RAIL.d, RAIL.z + RAIL.h], [tx, RAIL.y + RAIL.d, RAIL.z + RAIL.h - ((tx - RAIL.x0) % 20 === 0 ? 1.8 : 1)]);
    }
    out.push(L(ticks, { tone: 'lo' }));
    out.push(box({ x: x - 1.6, y: SPLIT, w: 3.2, d: front - 0.5, r: 0 }, jz - 0.6, 2.4, { tone: 'mid', crease: 'none' }));
    if (st.carry) out.push(cardSolid(x, jz - CARD.h, SPLIT, front, true));
    return out.join('');
  }

  // ---------- Instance ----------
  function create(opts) {
    opts = opts || {};
    var root = document.createElement('div');
    root.className = 'mcat msort';
    var model = null, shown = null, sig = '';
    var st = { x: PICK_X, jz: PARK_Z, carry: false, stand: 1 };
    var steps = [], stepAt = 0, from = null, frame = 0, last = 0;
    var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var svg, sceneG, moveG, readout;

    function build() {
      var defs = '<defs><filter id="msortBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter></defs>';
      root.innerHTML = plateHtml({
        fig: 'Fig 2', title: 'Card sorter', hint: opts.hint || 'Grade the card to file it', readout: '',
        keys: [
          { mark: 'lit', label: 'The card you are studying' },
          { mark: 'raised', label: 'Compartments: when each card comes back' },
          { mark: 'dim', label: 'Past the flag: safe until exam day' }
        ],
        body: '<div class="iso-stage msort-stage">' + figureSvg({
          width: WIDTH, height: HEIGHT,
          label: 'A card sorting machine. A carriage on an overhead rail files each graded flashcard into the compartment for its next review. Cards past the exam-day flag will not come back before the exam.',
          body: [defs, '<g data-part="scene"></g>', '<g data-part="move"></g>']
        }) + '</div>'
      });
      svg = root.querySelector('svg');
      sceneG = svg.querySelector('[data-part="scene"]');
      moveG = svg.querySelector('[data-part="move"]');
      readout = root.querySelector('[data-readout]');
    }
    function drawScene() { sceneG.innerHTML = scene(model, shown); }
    function drawMove() { moveG.innerHTML = moving(st); }

    function tick(now) {
      frame = 0;
      var dt = last ? now - last : 16;
      last = now;
      while (steps.length) {
        var s = steps[0];
        if (!from) from = { x: st.x, jz: st.jz, stand: st.stand };
        stepAt += still ? s.dur : dt;
        var k = s.dur ? Math.min(1, stepAt / s.dur) : 1, e = ease(k);
        if (s.x !== undefined) st.x = from.x + (s.x - from.x) * e;
        if (s.jz !== undefined) st.jz = from.jz + (s.jz - from.jz) * e;
        if (s.stand !== undefined) st.stand = from.stand + (s.stand - from.stand) * e;
        if (k < 1) break;
        steps.shift(); stepAt = 0; from = null;
        if (s.then) s.then();
        dt = 0;
      }
      drawMove();
      if (steps.length) frame = requestAnimationFrame(tick); else last = 0;
    }
    function finish() {
      // Jump any running animation to its end, so a fast grader never waits
      while (steps.length) {
        var s = steps.shift();
        if (s.x !== undefined) st.x = s.x;
        if (s.jz !== undefined) st.jz = s.jz;
        if (s.stand !== undefined) st.stand = s.stand;
        if (s.then) s.then();
      }
      stepAt = 0; from = null;
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
    }

    function set(next, move) {
      finish();
      model = next;
      var nsig = next.bins.length + ':' + next.flag;
      if (!svg || nsig !== sig) { if (!svg) build(); sig = nsig; }
      shown = { due: next.due, fresh: next.fresh, bins: next.bins.map(function (b) { return b.count; }) };
      readout.textContent = next.readout || '';
      var g = binGeom(next.bins.length);
      if (move && !still) {
        var tx, lowZ, merge;
        if (move.to === 'bin' && g[move.bin]) {
          shown.bins[move.bin] = Math.max(0, shown.bins[move.bin] - 1);
          tx = stackEnd(g[move.bin], shown.bins[move.bin]) + 0.6;
          lowZ = BIN_H + CARD.h + 1.5;
          merge = function () { shown.bins[move.bin] += 1; };
        } else {
          shown.due = Math.max(0, shown.due - 1);
          tx = HOP.x + WT + 1.4 + CARD.h / 2;
          lowZ = HOP_H + CARD.h + 1.5;
          merge = function () { shown.due += 1; };
        }
        st.x = PICK_X; st.jz = PARK_Z; st.carry = false; st.stand = 1;
        var dist = Math.abs(tx - PICK_X);
        steps = [
          { dur: 130, jz: STAND_H + 0.6 + CARD.h + 0.6, then: function () { st.carry = true; st.stand = 0; } },
          { dur: 150, jz: PARK_Z },
          { dur: 180 + dist * 1.6, x: tx },
          { dur: 130, jz: lowZ, then: function () { st.carry = false; merge(); drawScene(); } },
          { dur: 120, jz: PARK_Z },
          { dur: 120 + dist * 1.1, x: PICK_X, stand: next.stand ? 1 : 0 }
        ];
        drawScene(); drawMove();
        frame = requestAnimationFrame(tick);
      } else {
        st.x = PICK_X; st.jz = PARK_Z; st.carry = false; st.stand = next.stand ? 1 : 0;
        drawScene(); drawMove();
      }
    }
    return { root: root, set: set, finish: finish };
  }

  return { create: create };
})();
if (typeof window !== 'undefined') window.MuleSorter = MSORT;
