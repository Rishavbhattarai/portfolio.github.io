/* Built by tools/mule-catalog/build.mjs. Do not edit; edit catalog.src.js. Kit: Anatomy (MIT). */
(function () {
const AZIMUTH = 45;
const ELEVATION = 30;
const SHADES = 4;
const RADIANS = Math.PI / 180;
const UNIT = Math.sqrt(1.6);
function cameraOf({ scale, azimuth = AZIMUTH, elevation = ELEVATION }) {
    const a = azimuth * RADIANS;
    const e = elevation * RADIANS;
    return { sinA: Math.sin(a), cosA: Math.cos(a), sinE: Math.sin(e), cosE: Math.cos(e), k: scale * UNIT };
}
function iso([x, y, z], projection) {
    const { origin } = projection;
    const { sinA, cosA, sinE, cosE, k } = cameraOf(projection);
    return [origin[0] + (x * sinA - y * cosA) * k, origin[1] + ((x * cosA + y * sinA) * sinE - z * cosE) * k];
}
function towardViewer(projection) {
    const { sinA, cosA } = cameraOf(projection);
    return [cosA, sinA];
}
function depthOf([x, y, z], projection) {
    const { sinA, cosA, sinE, cosE } = cameraOf(projection);
    return (x * cosA + y * sinA) * cosE + z * sinE;
}
const tenth = (value) => {
    const text = (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "");
    return text === "-0" ? "0" : text;
};
function pathOf(points, closed = false) {
    if (!points.length)
        return "";
    return points.map(([x, y], at) => `${at ? "L" : "M"}${tenth(x)} ${tenth(y)}`).join("") + (closed ? "Z" : "");
}
const joinPaths = (paths) => paths.filter(Boolean).join("");
function roundedPlan({ x, y, w, d, r }, steps = 8) {
    const radius = Math.max(0, Math.min(r, w / 2, d / 2));
    const corners = [
        [x + w - radius, y + radius, -90],
        [x + w - radius, y + d - radius, 0],
        [x + radius, y + d - radius, 90],
        [x + radius, y + radius, 180],
    ];
    const out = [];
    for (const [cx, cy, start] of corners) {
        const count = radius > 0 ? steps : 0;
        for (let step = 0; step <= count; step++) {
            const angle = (start + (count ? (90 * step) / count : 45)) * RADIANS;
            out.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
        }
    }
    return out;
}
function signedArea(points) {
    let area = 0;
    for (let index = 0; index < points.length; index++) {
        const [ax, ay] = points[index];
        const [bx, by] = points[(index + 1) % points.length];
        area += ax * by - bx * ay;
    }
    return area / 2;
}
const oriented = (points) => (signedArea(points) < 0 ? [...points].reverse() : points);
function convexHull(points) {
    const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (sorted.length < 3)
        return sorted;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const point of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0)
            lower.pop();
        lower.push(point);
    }
    const upper = [];
    for (let index = sorted.length - 1; index >= 0; index--) {
        const point = sorted[index];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0)
            upper.pop();
        upper.push(point);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function runsOf(flags, want) {
    const count = flags.length;
    const runs = [];
    const start = flags.findIndex((flag, index) => flag !== flags[(index + count - 1) % count]);
    if (start < 0)
        return flags[0] === want ? [Array.from({ length: count + 1 }, (_, index) => index % count)] : [];
    let run = null;
    for (let step = 0; step < count; step++) {
        const index = (start + step) % count;
        if (flags[index] === want) {
            if (!run)
                run = [index];
            run.push((index + 1) % count);
        }
        else if (run) {
            runs.push(run);
            run = null;
        }
    }
    if (run)
        runs.push(run);
    return runs;
}
function extrude(ring, z, height, projection, options = {}) {
    const convex = options.convex === undefined || options.convex === null ? true : options.convex;
    const count = ring.length;
    const counter = signedArea(ring) > 0;
    const [vx, vy] = towardViewer(projection);
    const { sinA, cosA } = cameraOf(projection);
    const normals = ring.map(([ax, ay], index) => {
        const [bx, by] = ring[(index + 1) % count];
        const dx = bx - ax;
        const dy = by - ay;
        const length = Math.hypot(dx, dy) || 1;
        return (counter ? [dy / length, -dx / length] : [-dy / length, dx / length]);
    });
    const facing = normals.map(([nx, ny]) => nx * vx + ny * vy > 1e-9);
    const top = ring.map(([x, y]) => iso([x, y, z + height], projection));
    const bottom = ring.map(([x, y]) => iso([x, y, z], projection));
    const outline = [];
    const crease = [];
    for (const run of runsOf(facing, false))
        outline.push(pathOf(run.map((index) => top[index])));
    for (const run of runsOf(facing, true)) {
        crease.push(pathOf(run.map((index) => top[index])));
        if (height > 0)
            outline.push(pathOf(run.map((index) => bottom[index])));
    }
    if (height > 0) {
        for (let index = 0; index < count; index++) {
            if (facing[(index + count - 1) % count] !== facing[index])
                outline.push(pathOf([top[index], bottom[index]]));
        }
    }
    let fill;
    if (convex) {
        fill = pathOf(convexHull([...top, ...bottom]), true);
    }
    else {
        const parts = [pathOf(oriented(top), true), pathOf(oriented(bottom), true)];
        for (let index = 0; index < count; index++) {
            if (!facing[index])
                continue;
            const next = (index + 1) % count;
            parts.push(pathOf(oriented([top[index], top[next], bottom[next], bottom[index]]), true));
        }
        fill = parts.join("");
    }
    const buckets = Array.from({ length: SHADES }, () => []);
    if (height > 0) {
        const [lx, ly] = [-sinA, cosA];
        for (let index = 0; index < count; index++) {
            if (!facing[index])
                continue;
            const [nx, ny] = normals[index];
            const lit = (nx * lx + ny * ly + 1) / 2;
            const shade = Math.min(SHADES - 1, Math.max(0, Math.floor(lit * SHADES)));
            const next = (index + 1) % count;
            buckets[shade].push(pathOf(oriented([top[index], top[next], bottom[next], bottom[index]]), true));
        }
    }
    let bevel;
    if (options.bevel && options.bevel > 0) {
        const by = options.bevel;
        const inset = ring.map(([x, y], index) => {
            const [ax, ay] = normals[(index + count - 1) % count];
            const [bx, by2] = normals[index];
            const mx = ax + bx;
            const my = ay + by2;
            const length = Math.hypot(mx, my) || 1;
            return [x - (mx / length) * by, y - (my / length) * by];
        });
        const insetTop = inset.map(([x, y]) => iso([x, y, z + height], projection));
        bevel = runsOf(facing, true)
            .map((run) => pathOf([top[run[0]], ...run.slice(1, -1).map((index) => insetTop[index]), top[run[run.length - 1]]]))
            .join("");
    }
    return {
        fill,
        outline: outline.join(""),
        crease: crease.join(""),
        top: pathOf(oriented(top), true),
        shades: buckets.map((paths) => paths.join("")),
        bevel,
    };
}
const ringOf = (plan, steps = 8) => roundedPlan(plan, steps);
function slabOf(plan, z, height, projection, steps = 8, bevel = 0) {
    return extrude(ringOf(plan, steps), z, height, projection, { convex: true, bevel });
}
function circleRing(cx, cy, radius, steps = 40) {
    return Array.from({ length: steps }, (_, step) => {
        const angle = (step / steps) * Math.PI * 2;
        return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    });
}
function cylinder(cx, cy, radius, z, height, projection, steps = 32, bevel = 0) {
    return extrude(circleRing(cx, cy, radius, steps), z, height, projection, { convex: true, bevel });
}
const insetPlan = ({ x, y, w, d, r }, by) => ({ x: x + by, y: y + by, w: w - by * 2, d: d - by * 2, r: Math.max(0, r - by) });
function onTop(points, z, projection, closed = false) {
    return pathOf(points.map(([x, y]) => iso([x, y, z], projection)), closed);
}
const planOutline = (plan, z, projection, steps = 8) => onTop(ringOf(plan, steps), z, projection, true);
const lineOnTop = (from, to, z, projection) => onTop([from, to], z, projection);
const segment = (from, to, projection) => pathOf([iso(from, projection), iso(to, projection)]);
const rise = (at, from, to, projection) => segment([at[0], at[1], from], [at[0], at[1], to], projection);
const ring = (cx, cy, radius, z, projection, steps = 40) => onTop(circleRing(cx, cy, radius, steps), z, projection, true);
const pointsAt = (points, projection) => points.map((point) => iso(point, projection));
function dotGrid(x, y, columns, rows, gap, z, projection) {
    const dots = [];
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++)
            dots.push(iso([x + column * gap, y + row * gap, z], projection));
    }
    return dots;
}
function corners({ x, y, w, d }, inset = 0) {
    return [
        [x + inset, y + inset],
        [x + w - inset, y + inset],
        [x + inset, y + d - inset],
        [x + w - inset, y + d - inset],
    ];
}
function boxCorners({ x, y, w, d }, z0, z1) {
    const out = [];
    for (const px of [x, x + w])
        for (const py of [y, y + d])
            for (const z of [z0, z1])
                out.push([px, py, z]);
    return out;
}
function knurl(cx, cy, radius, z0, z1, count, projection, inset = 0.4) {
    const [vx, vy] = towardViewer(projection);
    const lines = [];
    for (let index = 0; index < count; index++) {
        const angle = (index / count) * Math.PI * 2;
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        if (nx * vx + ny * vy < 0.15)
            continue;
        lines.push(segment([cx + radius * nx, cy + radius * ny, z0 + inset], [cx + radius * nx, cy + radius * ny, z1 - inset], projection));
    }
    return lines.join("");
}
function sideArc(cx, cy, radius, z, projection, steps = 24) {
    const [vx, vy] = towardViewer(projection);
    const facing = Math.atan2(vy, vx);
    const points = [];
    for (let step = 0; step <= steps; step++) {
        const angle = facing - Math.PI / 2 + (step / steps) * Math.PI;
        points.push(iso([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), z], projection));
    }
    return pathOf(points);
}
function ringSeam(ring, z, projection) {
    const count = ring.length;
    const counter = signedArea(ring) > 0;
    const [vx, vy] = towardViewer(projection);
    const facing = ring.map(([ax, ay], index) => {
        const [bx, by] = ring[(index + 1) % count];
        const dx = bx - ax;
        const dy = by - ay;
        const [nx, ny] = counter ? [dy, -dx] : [-dy, dx];
        return nx * vx + ny * vy > 1e-9;
    });
    return runsOf(facing, true).map((run) => pathOf(run.map((index) => iso([ring[index][0], ring[index][1], z], projection)))).join("");
}
const sideSeam = (plan, z, projection, steps = 8) => ringSeam(ringOf(plan, steps), z, projection);
function sideRing(center, radius, axis, projection, steps = 20) {
    const [px, py, pz] = center;
    const points = [];
    for (let step = 0; step < steps; step++) {
        const angle = (step / steps) * Math.PI * 2;
        const u = radius * Math.cos(angle);
        const v = radius * Math.sin(angle);
        points.push(iso(axis === "x" ? [px, py + u, pz + v] : [px + u, py, pz + v], projection));
    }
    return pathOf(points, true);
}
function coil(from, to, center, radius, turns, axis, projection, perTurn = 16) {
    const count = Math.max(1, Math.round(turns * perTurn));
    const back = [];
    const front = [];
    let run = [];
    let near = null;
    for (let index = 0; index <= count; index++) {
        const share = index / count;
        const angle = share * turns * Math.PI * 2;
        const u = radius * Math.cos(angle);
        const v = radius * Math.sin(angle);
        const along = from + (to - from) * share;
        const point = axis === "x" ? [along, center[0] + u, center[1] + v] : [center[0] + u, along, center[1] + v];
        const normal = axis === "x" ? [0, Math.cos(angle), Math.sin(angle)] : [Math.cos(angle), 0, Math.sin(angle)];
        const facing = depthOf(normal, projection) > 0;
        const flat = iso(point, projection);
        if (near === null)
            near = facing;
        if (facing !== near) {
            run.push(flat);
            (near ? front : back).push(pathOf(run));
            run = [flat];
            near = facing;
            continue;
        }
        run.push(flat);
    }
    if (run.length > 1)
        (near ? front : back).push(pathOf(run));
    return { back: back.join(""), front: front.join("") };
}
function topTicks(from, to, step, every, edge, z, lengths, projection, axis = "x") {
    const minor = [];
    const major = [];
    const first = Math.ceil(from / step) * step;
    for (let at = first, index = Math.round(first / step); at <= to + 1e-9; at += step, index++) {
        const big = index % every === 0;
        const length = big ? lengths[1] : lengths[0];
        const a = axis === "x" ? [at, edge] : [edge, at];
        const b = axis === "x" ? [at, edge + length] : [edge + length, at];
        (big ? major : minor).push(lineOnTop(a, b, z, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
function sideTicks(from, to, step, every, face, top, lengths, projection, axis = "x") {
    const minor = [];
    const major = [];
    const first = Math.ceil(from / step) * step;
    for (let at = first, index = Math.round(first / step); at <= to + 1e-9; at += step, index++) {
        const big = index % every === 0;
        const length = big ? lengths[1] : lengths[0];
        const a = axis === "x" ? [at, face, top] : [face, at, top];
        const b = axis === "x" ? [at, face, top - length] : [face, at, top - length];
        (big ? major : minor).push(segment(a, b, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
function radialTicks(cx, cy, radius, count, every, z, lengths, projection, from = 0, span = Math.PI * 2) {
    const minor = [];
    const major = [];
    const closed = Math.abs(span - Math.PI * 2) < 1e-9;
    const steps = closed ? count : count + 1;
    for (let index = 0; index < steps; index++) {
        const angle = from + (index / count) * span;
        const big = index % every === 0;
        const inner = radius - (big ? lengths[1] : lengths[0]);
        const sx = Math.sin(angle);
        const sy = -Math.cos(angle);
        (big ? major : minor).push(lineOnTop([cx + sx * inner, cy + sy * inner], [cx + sx * radius, cy + sy * radius], z, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
const haloOf = (plan, z, height, projection) => slabOf(plan, z, height, projection).fill;
function axisVector(projection, [dx, dy, dz]) {
    const origin = iso([0, 0, 0], projection);
    const moved = iso([dx, dy, dz], projection);
    return [moved[0] - origin[0], moved[1] - origin[1]];
}
const fine = (value) => Math.round(value * 100) / 100;
function translateAlong(projection, by) {
    const [x, y] = axisVector(projection, by);
    return `translate(${fine(x)} ${fine(y)})`;
}
const thousandth = (value) => Math.round(value * 1000) / 1000;
function axesAt(at, z, projection) {
    const origin = iso([at[0], at[1], z], projection);
    const along = (point) => {
        const [px, py] = iso(point, projection);
        return [px - origin[0], py - origin[1]];
    };
    return { origin, x: along([at[0] + 1, at[1], z]), y: along([at[0], at[1] + 1, z]), z: along([at[0], at[1], z + 1]) };
}
const matrixOf = (u, v, origin) => `matrix(${thousandth(u[0])} ${thousandth(u[1])} ${thousandth(v[0])} ${thousandth(v[1])} ${thousandth(origin[0])} ${thousandth(origin[1])})`;
function holdStill(element, [dx, dy]) {
    const text = dx || dy ? `translate(${-dx} ${-dy})` : "";
    element.querySelectorAll("[data-hold]").forEach((node) => (text ? node.setAttribute("transform", text) : node.removeAttribute("transform")));
}
function topMatrix(at, z, projection, along = "x") {
    const { origin, x, y } = axesAt(at, z, projection);
    return along === "x" ? matrixOf(x, y, origin) : matrixOf([-y[0], -y[1]], x, origin);
}
function sideMatrix(at, z, projection, face) {
    const { origin, x, y, z: up } = axesAt(at, z, projection);
    const down = [-up[0], -up[1]];
    return face === "left" ? matrixOf(x, down, origin) : matrixOf([-y[0], -y[1]], down, origin);
}
function screenRise(height, projection) {
    const { cosE, k } = cameraOf(projection);
    return height * cosE * k;
}
function fitProjection(points, width, height, { pad = 24, headroom = 0, azimuth = AZIMUTH, elevation = ELEVATION } = {}) {
    const unit = { origin: [0, 0], scale: 1, azimuth, elevation };
    const flat = points.map((point) => iso(point, unit));
    const xs = flat.map(([x]) => x);
    const ys = flat.map(([, y]) => y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const up = Math.min(...ys);
    const down = Math.max(...ys);
    const scale = Math.min((width - pad * 2) / (right - left), (height - pad * 2 - headroom) / (down - up));
    return {
        origin: [width / 2 - ((left + right) / 2) * scale, headroom + (height - headroom) / 2 - ((up + down) / 2) * scale],
        scale,
        azimuth,
        elevation,
    };
}
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const attrs = (pairs) => Object.entries(pairs)
    .filter(([, value]) => value !== undefined && value !== false)
    .map(([key, value]) => ` ${key}="${escape(String(value))}"`)
    .join("");
function solidSvg(paths, { tone = "hi", crease = "faint", halo = false, lit = false, flat = false, className, inner = "" } = {}) {
    const parts = [];
    if (halo)
        parts.push(`<path class="iso-halo" d="${paths.fill}"/>`);
    parts.push(`<path class="iso-fill" d="${paths.fill}"/>`);
    if (!flat) {
        paths.shades.forEach((d, shade) => {
            if (d)
                parts.push(`<path class="iso-shade" data-shade="${shade}" d="${d}"/>`);
        });
        parts.push(`<path class="iso-top" d="${paths.top}"/>`);
    }
    if (crease !== "none" && paths.crease)
        parts.push(`<path class="iso-line iso-crease" data-tone="${crease}" d="${paths.crease}"/>`);
    if (crease !== "none" && paths.bevel)
        parts.push(`<path class="iso-line iso-bevel" data-tone="${crease}" d="${paths.bevel}"/>`);
    if (inner)
        parts.push(inner);
    parts.push(`<path class="iso-line iso-edge" data-tone="${tone}" d="${paths.outline}"/>`);
    return `<g${attrs({ class: className ? `iso-solid ${className}` : "iso-solid", "data-lit": lit ? "" : undefined, "data-seamless": paths.seamless ? "" : undefined })}>${parts.join("")}</g>`;
}
function lineSvg(d, { tone = "lo", dotted = false, dashed = false, flow = false, className, free } = {}) {
    if (!d)
        return "";
    return `<path${attrs({
        class: className ? `iso-line ${className}` : "iso-line",
        "data-tone": tone,
        "data-free": free === true ? "" : free || undefined,
        "data-dotted": dotted ? "" : undefined,
        "data-dashed": dashed ? "" : undefined,
        "data-flow": flow ? "" : undefined,
        d,
    })}/>`;
}
function dotsSvg(points, { size = 0.5, tone = "mid", pulse = false } = {}) {
    const dots = points
        .map(([x, y, alpha], index) => `<circle cx="${tenth(x)}" cy="${tenth(y)}" r="${size}"${alpha !== undefined && alpha < 1 ? ` fill-opacity="${Math.max(0, alpha).toFixed(2)}"` : ""}${pulse ? ` data-pulse="" style="--pulse-at:${(index * 137) % 1600}ms"` : ""}/>`)
        .join("");
    return `<g class="iso-dots" data-tone="${tone}">${dots}</g>`;
}
function fadedSvg(list, style = {}) {
    const groups = new Map();
    for (const entry of list) {
        const [d, alpha] = Array.isArray(entry) ? entry : [entry.d, entry.alpha];
        if (!d || !(alpha > 0.02))
            continue;
        const level = Math.min(1, Math.round(alpha * 20) / 20);
        groups.set(level, (groups.get(level) || "") + d);
    }
    return [...groups].map(([alpha, d]) => (alpha >= 1 ? lineSvg(d, style) : `<g opacity="${alpha.toFixed(2)}">${lineSvg(d, style)}</g>`)).join("");
}
function fadeLineSvg(points, { fade = [0, 0], tone = "lo", className, stops = 6 } = {}) {
    if (points.length < 2)
        return "";
    const ease = (t) => t * t * (3 - 2 * t);
    const hashOf = (text) => {
        let hash = 2166136261;
        for (let index = 0; index < text.length; index++)
            hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
        return (hash >>> 0).toString(36);
    };
    const lengths = [0];
    for (let index = 1; index < points.length; index++)
        lengths.push(lengths[index - 1] + Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]));
    const at = (length) => {
        let index = 1;
        while (index < points.length - 1 && lengths[index] < length)
            index++;
        const span = lengths[index] - lengths[index - 1] || 1;
        const t = Math.max(0, Math.min(1, (length - lengths[index - 1]) / span));
        return [points[index - 1][0] + (points[index][0] - points[index - 1][0]) * t, points[index - 1][1] + (points[index][1] - points[index - 1][1]) * t];
    };
    const pieceOf = (from, to) => [at(from), ...points.filter((_, index) => lengths[index] > from + 1e-6 && lengths[index] < to - 1e-6), at(to)];
    const total = lengths[lengths.length - 1];
    if (total < 1e-6)
        return "";
    let [start, end] = Array.isArray(fade) ? fade : [fade, fade];
    if (start + end > total) {
        const share = total / (start + end);
        start *= share;
        end *= share;
    }
    const paint = `var(--anatomy-${tone})`;
    const ramp = (piece, rising) => {
        const d = pathOf(piece);
        const [x1, y1] = piece[0];
        const [x2, y2] = piece[piece.length - 1];
        const id = `iso-fade-${hashOf(`${d}|${tone}|${rising}`)}`;
        const marks = Array.from({ length: stops + 1 }, (_, index) => {
            const t = index / stops;
            const alpha = ease(rising ? t : 1 - t);
            return `<stop offset="${t.toFixed(3)}" stop-opacity="${alpha.toFixed(3)}" style="stop-color:${paint}"/>`;
        }).join("");
        const gradient = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${tenth(x1)}" y1="${tenth(y1)}" x2="${tenth(x2)}" y2="${tenth(y2)}">${marks}</linearGradient>`;
        return `<defs>${gradient}</defs><path${attrs({ class: className ? `iso-line ${className}` : "iso-line", "data-tone": tone, "data-free": rising ? "start" : "end", d, style: `stroke:url(#${id})` })}/>`;
    };
    const parts = [];
    if (start > 0.05)
        parts.push(ramp(pieceOf(0, start), true));
    if (total - end - start > 0.05)
        parts.push(lineSvg(pathOf(pieceOf(start, total - end)), { tone, className }));
    if (end > 0.05)
        parts.push(ramp(pieceOf(total - end, total), false));
    return `<g class="iso-fade">${parts.join("")}</g>`;
}
function wireSvg(from, to, { via = [], tone = "lo", dotted = false, dashed = false, flow = false, ends = "both", size = 1.2 } = {}) {
    const d = pathOf([from, ...via, to]);
    const end = ([x, y]) => `<circle class="iso-wire-end" cx="${tenth(x)}" cy="${tenth(y)}" r="${size}"/>`;
    return `<g class="iso-wire" data-tone="${tone}">${lineSvg(d, { tone, dotted, dashed, flow })}${ends === "both" || ends === "from" ? end(from) : ""}${ends === "both" || ends === "to" ? end(to) : ""}</g>`;
}
function faceTextSvg(transform, text, { size = 3, tone = "mid", anchor = "start" } = {}) {
    return `<text class="iso-face-text" data-tone="${tone}" transform="${transform}" font-size="${size}" text-anchor="${anchor}">${escape(text)}</text>`;
}
function groupSvg(children, extra = {}) {
    return `<g${attrs(extra)}>${Array.isArray(children) ? children.join("") : children}</g>`;
}
function figureSvg({ width, height, label, body, standalone = false, className }) {
    const style = standalone ? `<style>${ISO_CSS}</style>` : "";
    return `<svg${attrs({
        xmlns: "http://www.w3.org/2000/svg",
        class: `iso-svg${standalone ? " iso" : ""}${className ? ` ${className}` : ""}`,
        "data-theme": standalone || undefined,
        viewBox: `0 0 ${width} ${height}`,
        role: "img",
        "aria-label": label,
    })}>${style}${Array.isArray(body) ? body.join("") : body}</svg>`;
}
function swatchSvg(mark) {
    if (mark === "raised" || mark === "flat" || mark === "lit") {
        const body = mark === "flat" ? "M2 6.5 8 3.5 14 6.5 8 9.5Z" : "M2 4.5 8 1.5 14 4.5 14 6 8 9 2 6Z";
        const crease = mark === "flat" ? "" : `<path class="iso-swatch-crease" d="M2 4.5 8 7.5 14 4.5"/>`;
        return `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="${body}"/>${crease}</svg>`;
    }
    return `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="M1.5 5h13"/></svg>`;
}
function plateHtml({ fig, title, hint, readout = "", keys = [], caption, body }) {
    const corner = (name, text, extra = "") => `<span class="iso-plate-corner" data-corner="${name}"${extra}>${escape(text)}</span>`;
    const legend = keys.length || caption
        ? `<figcaption class="iso-legend">${keys.length ? `<span class="iso-keys">${keys.map((key) => `<span class="iso-key">${swatchSvg(key.mark)}${escape(key.label)}</span>`).join("")}</span>` : ""}${caption ? `<span class="iso-caption">${escape(caption)}</span>` : ""}</figcaption>`
        : "";
    return `<figure class="iso-figure"><div class="iso-plate"><div class="iso-plate-corners" aria-hidden="true">${corner("fig", fig)}${title ? corner("title", title) : ""}${hint ? corner("hint", hint) : ""}${corner("readout", readout, " data-readout")}</div>${body}</div>${legend}</figure>`;
}
function pageHtml({ title, theme = "dark", body, script = "", width = 650 }) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>${ISO_CSS}${PAGE_CSS.replace("__WIDTH__", String(width))}</style></head><body class="iso" data-theme="${theme}"><main class="iso-page">${body}</main>${script ? `<script type="module">${script.replace(/<\/(script)/gi, "<\\/$1")}</script>` : ""}</body></html>`;
}
const PAGE_CSS = `
*{box-sizing:border-box}
html{color-scheme:dark}
body[data-theme="light"]{color-scheme:light}
body{margin:0;background:var(--anatomy-page);color:var(--anatomy-text);font:14px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.iso-page{width:min(__WIDTH__px,100% - 32px);margin:64px auto 96px}
`;

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

})();
