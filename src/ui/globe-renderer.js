// A holographic Earth drawn on a 2D canvas: no WebGL and no libraries.
// The view is orthographic, centred on (view.lat, view.lng). Everything is a unit vector rotated
// into view space, where x is right, y is up and z points at the viewer.

import { arcPoints, boundingCap, toVector } from '../domain/geo.js';
import { decodeLandMask, isLand } from './land-mask.js';

const RAD = Math.PI / 180;
const TAU = Math.PI * 2;
const ZOOM = { min: 0.8, max: 28 };
const CYAN = '94, 234, 255';
const BLUE = '56, 150, 255';
const SPIN_DEGREES_PER_SECOND = 5;
const RESUME_SPIN_AFTER_MS = 3500;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wrapLng = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// Land as evenly spread points (a Fibonacci sphere filtered by the land mask).
// Each point gets a brightness tier, which also lifts it slightly for a sense of relief.
function buildLandDots(count = 30000) {
  const mask = decodeLandMask();
  const golden = Math.PI * (3 - Math.sqrt(5));
  const dots = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - ((i + 0.5) * 2) / count;
    const ring = Math.sqrt(1 - y * y);
    const x = Math.cos(i * golden) * ring;
    const z = Math.sin(i * golden) * ring;
    if (!isLand(mask, Math.asin(y) / RAD, Math.atan2(x, z) / RAD)) continue;
    const noise = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    const tier = noise > 0.9 ? 2 : noise > 0.55 ? 1 : 0;
    const height = 1 + tier * 0.012;
    dots.push(x * height, y * height, z * height, tier);
  }
  return new Float32Array(dots);
}

function buildGraticule(spacing, step) {
  const lines = [];
  for (let lng = -180; lng < 180; lng += spacing) {
    const line = [];
    for (let lat = -90; lat <= 90; lat += step) line.push(toVector(lat, lng));
    lines.push(line);
  }
  for (let lat = -90 + spacing; lat < 90; lat += spacing) {
    const line = [];
    for (let lng = -180; lng <= 180; lng += step) line.push(toVector(lat, lng));
    lines.push(line);
  }
  return lines;
}

const toRGB = (color) => {
  const hex = /^#?([0-9a-f]{6})$/i.exec(color.trim())?.[1];
  return hex ? [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ') : CYAN;
};

export function createGlobe(canvas, { onSelect = () => {} } = {}) {
  const ctx = canvas.getContext('2d');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const dots = buildLandDots();
  const projected = new Float32Array((dots.length / 4) * 3);
  const graticule = buildGraticule(30, 3);
  const fineGraticule = buildGraticule(5, 1); // shown when zoomed in, to keep a sense of place
  const sprites = new Map();

  const view = { lat: 18, lng: 20, zoom: 1 };
  let scene = { stops: [], legs: [], selectedId: null };
  let size = { width: 0, height: 0, ratio: 1 };
  let spin = !reducedMotion.matches;
  let lastTouched = -Infinity;
  let flight = null;
  let frame = 0;
  let previous = 0;
  let hubs = []; // screen positions of visible stops, for hit testing
  let destroyed = false;

  // --- camera ---

  const radius = () => Math.min(size.width, size.height) * 0.38 * view.zoom;
  const centre = () => ({ x: size.width / 2, y: size.height * 0.48 });

  let sinLng = 0;
  let cosLng = 1;
  let sinLat = 0;
  let cosLat = 1;
  const aim = () => {
    sinLng = Math.sin(view.lng * RAD);
    cosLng = Math.cos(view.lng * RAD);
    sinLat = Math.sin(view.lat * RAD);
    cosLat = Math.cos(view.lat * RAD);
  };
  const rotate = (x, y, z) => {
    const x1 = x * cosLng - z * sinLng;
    const z1 = x * sinLng + z * cosLng;
    return [x1, y * cosLat - z1 * sinLat, y * sinLat + z1 * cosLat];
  };

  const touch = () => {
    lastTouched = performance.now();
    flight = null;
  };

  const flyTo = (lat, lng, zoom = view.zoom) => {
    const target = { lat: clamp(lat, -85, 85), lng: view.lng + wrapLng(lng - view.lng), zoom: clamp(zoom, ZOOM.min, ZOOM.max) };
    lastTouched = performance.now();
    if (reducedMotion.matches) {
      Object.assign(view, target, { lng: wrapLng(target.lng) });
      flight = null;
    } else {
      flight = { from: { ...view }, to: target, start: performance.now(), duration: 1100 };
    }
    wake();
  };

  // Frames every located stop, or the whole Earth when there is nothing to show.
  const fit = () => {
    const cap = boundingCap(scene.stops.map((stop) => toVector(stop.lat, stop.lng)));
    if (!cap) return flyTo(18, view.lng, 1);
    flyTo(cap.lat, cap.lng, clamp(0.85 / Math.sin(Math.max(cap.radius * 1.25, 0.12)), 1, ZOOM.max));
  };

  // --- drawing ---

  const glow = (rgb) => {
    if (!sprites.has(rgb)) {
      const sprite = document.createElement('canvas');
      sprite.width = sprite.height = 64;
      const g = sprite.getContext('2d');
      const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, `rgba(${rgb}, 0.95)`);
      gradient.addColorStop(0.25, `rgba(${rgb}, 0.45)`);
      gradient.addColorStop(1, `rgba(${rgb}, 0)`);
      g.fillStyle = gradient;
      g.fillRect(0, 0, 64, 64);
      sprites.set(rgb, sprite);
    }
    return sprites.get(rgb);
  };

  // Strokes the parts of a 3D polyline that are on the wanted side of the globe.
  const tracePath = (points, cx, cy, R, wantFront) => {
    let drawing = false;
    for (const point of points) {
      const [x, y, z] = rotate(point[0], point[1], point[2]);
      // A raised point behind the limb is still visible when it clears the disc.
      const front = z >= 0 || x * x + y * y > 1;
      if (front !== wantFront) {
        drawing = false;
        continue;
      }
      if (drawing) ctx.lineTo(cx + R * x, cy - R * y);
      else ctx.moveTo(cx + R * x, cy - R * y);
      drawing = true;
    }
  };

  const drawBackdrop = (cx, cy, R) => {
    // The glass surface the globe floats over fades away as you zoom in.
    const floor = clamp(1 - (view.zoom - 1) / 0.5, 0, 1);
    if (floor > 0) {
      const y = cy + R * 1.16;
      const pool = ctx.createRadialGradient(cx, y, 0, cx, y, R);
      pool.addColorStop(0, `rgba(${CYAN}, ${0.16 * floor})`);
      pool.addColorStop(1, `rgba(${CYAN}, 0)`);
      ctx.save();
      ctx.translate(cx, y);
      ctx.scale(1, 0.14);
      ctx.translate(-cx, -y);
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.arc(cx, y, R, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 1;
      for (const ring of [0.55, 0.8, 1]) {
        ctx.strokeStyle = `rgba(${CYAN}, ${0.22 * floor * (1.2 - ring)})`;
        ctx.beginPath();
        ctx.arc(cx, y, R * ring, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    const halo = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.32);
    halo.addColorStop(0, `rgba(${BLUE}, 0.34)`);
    halo.addColorStop(0.35, `rgba(${BLUE}, 0.1)`);
    halo.addColorStop(1, `rgba(${BLUE}, 0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.32, 0, TAU);
    ctx.fill();

    const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
    body.addColorStop(0, 'rgba(26, 78, 150, 0.5)');
    body.addColorStop(0.6, 'rgba(8, 28, 68, 0.62)');
    body.addColorStop(1, 'rgba(3, 10, 30, 0.86)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
  };

  const drawGraticule = (cx, cy, R, front) => {
    ctx.lineWidth = 1;
    const fine = front ? clamp((view.zoom - 3) / 3, 0, 1) : 0;
    if (fine > 0) {
      ctx.beginPath();
      for (const line of fineGraticule) tracePath(line, cx, cy, R, true);
      ctx.strokeStyle = `rgba(${CYAN}, ${0.09 * fine})`;
      ctx.stroke();
    }
    ctx.beginPath();
    for (const line of graticule) tracePath(line, cx, cy, R, front);
    ctx.strokeStyle = `rgba(${CYAN}, ${front ? 0.2 : 0.06})`;
    ctx.stroke();
  };

  const drawLand = (cx, cy, R) => {
    const count = dots.length / 4;
    for (let i = 0; i < count; i++) {
      const [x, y, z] = rotate(dots[i * 4], dots[i * 4 + 1], dots[i * 4 + 2]);
      projected[i * 3] = cx + R * x;
      projected[i * 3 + 1] = cy - R * y;
      projected[i * 3 + 2] = z;
    }
    const dot = clamp(0.9 + view.zoom * 0.5, 1.3, 5);
    // One pass per look, so the fill style changes seven times a frame instead of thousands.
    const passes = [
      { style: `rgba(${BLUE}, 0.13)`, test: (z) => z < -0.02, scale: 0.8 },
      { style: `rgba(${BLUE}, 0.3)`, test: (z, tier) => z >= 0 && z < 0.3 && tier === 0, scale: 0.85 },
      { style: `rgba(${CYAN}, 0.42)`, test: (z, tier) => z >= 0 && z < 0.3 && tier > 0, scale: 0.9 },
      { style: `rgba(${BLUE}, 0.62)`, test: (z, tier) => z >= 0.3 && tier === 0, scale: 1 },
      { style: `rgba(${CYAN}, 0.8)`, test: (z, tier) => z >= 0.3 && tier === 1, scale: 1.05 },
      { style: 'rgba(214, 250, 255, 0.95)', test: (z, tier) => z >= 0.3 && tier === 2, scale: 1.2 },
    ];
    for (const pass of passes) {
      const side = dot * pass.scale;
      ctx.fillStyle = pass.style;
      for (let i = 0; i < count; i++) {
        if (!pass.test(projected[i * 3 + 2], dots[i * 4 + 3])) continue;
        const x = projected[i * 3];
        const y = projected[i * 3 + 1];
        if (x < -4 || y < -4 || x > size.width + 4 || y > size.height + 4) continue;
        ctx.fillRect(x - side / 2, y - side / 2, side, side);
      }
    }
  };

  const drawLegs = (cx, cy, R, now) => {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const leg of scene.legs) {
      const active = leg.from === scene.selectedId || leg.to === scene.selectedId;
      ctx.beginPath();
      tracePath(leg.points, cx, cy, R, true);
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(${CYAN}, ${active ? 0.22 : 0.12})`;
      ctx.lineWidth = active ? 9 : 6;
      ctx.stroke();
      ctx.strokeStyle = `rgba(${CYAN}, ${active ? 0.95 : 0.7})`;
      ctx.lineWidth = active ? 2.2 : 1.5;
      ctx.stroke();
      // The data stream: bright dashes travelling from origin to destination.
      if (!reducedMotion.matches) {
        ctx.setLineDash([3, 26]);
        ctx.lineDashOffset = -(now / 28) % 29;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  const drawStops = (cx, cy, R, now) => {
    hubs = [];
    const labels = [];
    const ordered = [...scene.stops].sort((a, b) => (a.id === scene.selectedId) - (b.id === scene.selectedId));
    ctx.save();
    ctx.lineCap = 'round';
    for (const stop of ordered) {
      const [x, y, z] = rotate(...stop.vector);
      if (z < 0.02) continue;
      const selected = stop.id === scene.selectedId;
      const px = cx + R * x;
      const py = cy - R * y;
      hubs.push({ id: stop.id, x: px, y: py });

      // A beam of light rising from the place, leaning with the curve of the globe.
      const reach = Math.min(R * (selected ? 0.34 : 0.2), selected ? 130 : 80);
      const tipX = px + x * reach;
      const tipY = py - y * reach - z * reach * 0.6;
      const beam = ctx.createLinearGradient(px, py, tipX, tipY);
      beam.addColorStop(0, `rgba(${stop.rgb}, 0.95)`);
      beam.addColorStop(1, `rgba(${stop.rgb}, 0)`);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = beam;
      for (const [width, alpha] of [[9, 0.22], [2.5, 1]]) {
        ctx.globalAlpha = alpha;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      const spread = selected ? 54 : 34;
      ctx.drawImage(glow(stop.rgb), px - spread / 2, py - spread / 2, spread, spread);
      if (selected) {
        const pulse = reducedMotion.matches ? 0.5 : (now / 1400) % 1;
        ctx.strokeStyle = `rgba(${stop.rgb}, ${0.9 * (1 - pulse)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, 7 + pulse * 16, 0, TAU);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, selected ? 3.6 : 2.6, 0, TAU);
      ctx.fill();
      labels.unshift({ text: stop.label, x: px + 10, y: py + 4, selected });
    }

    // Labels, most important first; one that would cover another is left out.
    const placed = [];
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const label of labels) {
      ctx.font = `${label.selected ? 700 : 600} ${label.selected ? 14 : 12}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      const box = { x: label.x, y: label.y - 9, w: ctx.measureText(label.text).width, h: 18 };
      if (placed.some((p) => box.x < p.x + p.w + 4 && p.x < box.x + box.w + 4 && box.y < p.y + p.h && p.y < box.y + box.h)) continue;
      placed.push(box);
      ctx.strokeStyle = 'rgba(2, 8, 22, 0.85)';
      ctx.lineWidth = 4;
      ctx.strokeText(label.text, label.x, label.y);
      ctx.fillStyle = label.selected ? '#ffffff' : 'rgba(214, 246, 255, 0.92)';
      ctx.fillText(label.text, label.x, label.y);
    }
    ctx.restore();
  };

  const draw = (now) => {
    const { width, height, ratio } = size;
    if (!width || !height) return;
    aim();
    const R = radius();
    const { x: cx, y: cy } = centre();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawBackdrop(cx, cy, R);
    drawGraticule(cx, cy, R, false);
    drawLand(cx, cy, R);
    drawGraticule(cx, cy, R, true);
    ctx.strokeStyle = `rgba(${CYAN}, 0.55)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();
    drawLegs(cx, cy, R, now);
    drawStops(cx, cy, R, now);
  };

  // --- animation: frames are only produced while something is moving ---

  const spinning = (now) =>
    spin && !scene.selectedId && !reducedMotion.matches && now - lastTouched > RESUME_SPIN_AFTER_MS && pointers.size === 0;
  const animating = () => !reducedMotion.matches && (spin || flight || scene.legs.length > 0 || scene.selectedId);

  const tick = (now) => {
    frame = 0;
    if (destroyed) return;
    const elapsed = Math.min(now - previous, 100);
    previous = now;
    if (flight) {
      const t = clamp((now - flight.start) / flight.duration, 0, 1);
      const k = ease(t);
      for (const key of ['lat', 'lng', 'zoom']) view[key] = flight.from[key] + (flight.to[key] - flight.from[key]) * k;
      if (t === 1) {
        view.lng = wrapLng(view.lng);
        flight = null;
        lastTouched = now;
      }
    } else if (spinning(now)) {
      view.lng = wrapLng(view.lng - (SPIN_DEGREES_PER_SECOND * elapsed) / 1000);
    }
    draw(now);
    if (animating() && !document.hidden) wake();
  };

  function wake() {
    if (frame || destroyed) return;
    previous = performance.now();
    frame = requestAnimationFrame(tick);
  }

  // --- input ---

  const pointers = new Map();
  let travelled = 0;
  let pinch = 0;

  const local = (event) => {
    const box = canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const hit = (point, reach = 24) => {
    let best = null;
    for (const hub of hubs) {
      const distance = Math.hypot(hub.x - point.x, hub.y - point.y);
      if (distance <= reach && (!best || distance < best.distance)) best = { id: hub.id, distance };
    }
    return best?.id ?? null;
  };
  const zoomBy = (factor) => {
    touch();
    view.zoom = clamp(view.zoom * factor, ZOOM.min, ZOOM.max);
    wake();
  };
  const turn = (dLng, dLat) => {
    touch();
    view.lng = wrapLng(view.lng + dLng);
    view.lat = clamp(view.lat + dLat, -85, 85);
    wake();
  };

  const onPointerDown = (event) => {
    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, local(event));
    travelled = 0;
    if (pointers.size === 2) pinch = Math.hypot(...pinchDelta());
    touch();
  };
  const pinchDelta = () => {
    const [a, b] = [...pointers.values()];
    return [a.x - b.x, a.y - b.y];
  };
  const onPointerMove = (event) => {
    const point = local(event);
    const before = pointers.get(event.pointerId);
    if (!before) {
      canvas.style.cursor = hit(point) ? 'pointer' : 'grab';
      return;
    }
    pointers.set(event.pointerId, point);
    if (pointers.size === 2) {
      const distance = Math.hypot(...pinchDelta());
      if (pinch) zoomBy(distance / pinch);
      pinch = distance;
      return;
    }
    const dx = point.x - before.x;
    const dy = point.y - before.y;
    travelled += Math.abs(dx) + Math.abs(dy);
    canvas.style.cursor = 'grabbing';
    turn(-dx / radius() / RAD, dy / radius() / RAD);
  };
  const onPointerUp = (event) => {
    const point = local(event);
    const tapped = pointers.size === 1 && travelled < 6;
    pointers.delete(event.pointerId);
    pinch = 0;
    canvas.style.cursor = 'grab';
    if (tapped) onSelect(hit(point, event.pointerType === 'touch' ? 32 : 24));
    lastTouched = performance.now();
    wake();
  };
  const onPointerCancel = (event) => {
    pointers.delete(event.pointerId);
    pinch = 0;
  };
  const onWheel = (event) => {
    event.preventDefault();
    zoomBy(Math.exp(-event.deltaY * (Math.abs(event.deltaY) < 50 ? 0.012 : 0.0016)));
  };
  const onKeyDown = (event) => {
    const step = 12 / view.zoom;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[event.key]) turn(...moves[event.key]);
    else if (event.key === '+' || event.key === '=') zoomBy(1.3);
    else if (event.key === '-' || event.key === '_') zoomBy(1 / 1.3);
    else return;
    event.preventDefault();
  };
  const onVisibility = () => !document.hidden && wake();

  const resize = () => {
    const box = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    size = { width: box.width, height: box.height, ratio };
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    draw(performance.now());
    wake();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', onVisibility);
  reducedMotion.addEventListener('change', wake);

  return {
    // stops: [{ id, label, lat, lng, color }]   legs: [{ from, to, method }] (ids of stops)
    setScene({ stops, legs, selectedId }) {
      const byId = new Map(stops.map((stop) => [stop.id, stop]));
      scene = {
        selectedId,
        stops: stops.map((stop) => ({ ...stop, vector: toVector(stop.lat, stop.lng), rgb: toRGB(stop.color ?? '') })),
        legs: legs
          .filter((leg) => byId.has(leg.from) && byId.has(leg.to))
          .map((leg) => {
            const a = toVector(byId.get(leg.from).lat, byId.get(leg.from).lng);
            const b = toVector(byId.get(leg.to).lat, byId.get(leg.to).lng);
            const span = Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));
            // Flights arc high; ground travel hugs the surface.
            const lift = leg.method === 'flight' || !leg.method ? 0.03 + span * 0.22 : 0.008 + span * 0.05;
            return { ...leg, points: arcPoints(a, b, lift) };
          }),
      };
      wake();
    },
    flyTo,
    fit,
    // The zoom at which two places `angle` radians apart sit `pixels` apart on screen.
    zoomToSeparate: (angle, pixels) => clamp(pixels / (angle * Math.min(size.width, size.height) * 0.38), 2.5, ZOOM.max),
    zoomBy,
    setSpin(on) {
      spin = on;
      lastTouched = -Infinity;
      wake();
    },
    getView: () => ({ ...view, spinning: spinning(performance.now()), hubs: hubs.map((hub) => ({ ...hub })) }),
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener('change', wake);
    },
  };
}
