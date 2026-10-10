// Geometry for the globe view: pure maths plus the route a trip traces across the Earth.
// Vectors are unit [x, y, z] with y towards the north pole and z towards longitude 0.

const RAD = Math.PI / 180;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const normalize = (v) => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

export const isCoordinate = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

export function toVector(lat, lng) {
  const phi = lat * RAD;
  const lambda = lng * RAD;
  return [Math.cos(phi) * Math.sin(lambda), Math.sin(phi), Math.cos(phi) * Math.cos(lambda)];
}

export const toLatLng = (v) => ({ lat: Math.asin(clamp(v[1], -1, 1)) / RAD, lng: Math.atan2(v[0], v[2]) / RAD });

export const angleBetween = (a, b) => Math.acos(clamp(dot(a, b), -1, 1));

// Great-circle interpolation.
export function slerp(a, b, t) {
  const omega = angleBetween(a, b);
  if (omega < 1e-6) return [...a];
  const sin = Math.sin(omega);
  // Exactly opposite points have no single shortest path; nudge one to pick a side.
  if (sin < 1e-6) return slerp(a, normalize([b[0] + 1e-3, b[1] + 1e-3, b[2]]), t);
  const ka = Math.sin((1 - t) * omega) / sin;
  const kb = Math.sin(t * omega) / sin;
  return [ka * a[0] + kb * b[0], ka * a[1] + kb * b[1], ka * a[2] + kb * b[2]];
}

// Points along the great circle from a to b, raised above the surface in the middle by `lift`.
export function arcPoints(a, b, lift = 0.1, steps = 48) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const height = 1 + lift * Math.sin(Math.PI * t);
    const [x, y, z] = slerp(a, b, t);
    points.push([x * height, y * height, z * height]);
  }
  return points;
}

// A view that takes in a set of places: centred between the two furthest apart,
// with `radius` the angle (in radians) from that centre to the most distant one.
export function boundingCap(vectors) {
  if (!vectors.length) return null;
  let pair = [vectors[0], vectors[0]];
  let widest = 0;
  for (const a of vectors) {
    for (const b of vectors) {
      const angle = angleBetween(a, b);
      if (angle > widest) [widest, pair] = [angle, [a, b]];
    }
  }
  const centre = slerp(pair[0], pair[1], 0.5);
  return { ...toLatLng(centre), radius: Math.max(...vectors.map((v) => angleBetween(centre, v))) };
}

// The angle from one place to its nearest neighbour, or null when it has none.
export function nearestNeighbour(vector, others) {
  const angles = others.map((other) => angleBetween(vector, other)).filter((angle) => angle > 1e-9);
  return angles.length ? Math.min(...angles) : null;
}

// "Osaka to Riyadh" -> ['Osaka', 'Riyadh']
export function splitRouteName(name) {
  const parts = String(name).split(/\s+(?:to|→|->|–|—|-)\s+/i).map((part) => part.trim());
  return parts.length === 2 && parts[0] && parts[1] ? parts : null;
}

// Turns a trip into stops and the legs between them.
// Stays are stops. A travel leg with no stay beyond it (the flight home) contributes its far end
// as a stop too, named from the leg ("Osaka to Riyadh" ends in Riyadh) and located on the leg itself.
export function buildRoute(trip) {
  const stops = [];
  const legs = [];
  let travel = null; // the travel leg seen since the last stop

  const connect = (stop) => {
    const previous = stops[stops.length - 1];
    if (previous) {
      legs.push({
        id: travel?.id ?? `${previous.id}>${stop.id}`,
        from: previous.id,
        to: stop.id,
        segmentId: travel?.id ?? null,
        method: travel?.method ?? null,
        name: travel?.name ?? '',
        date: travel?.startDate ?? stop.startDate,
      });
    }
    stops.push(stop);
    travel = null;
  };

  const place = (segment, name, kind) => ({
    id: kind === 'stay' ? segment.id : `${segment.id}:end`,
    segmentId: segment.id,
    kind,
    name,
    place: segment.place ?? '',
    lat: segment.lat ?? null,
    lng: segment.lng ?? null,
    located: isCoordinate(segment.lat, segment.lng),
    startDate: kind === 'stay' ? segment.startDate : segment.endDate,
    endDate: segment.endDate,
  });

  for (const segment of trip.segments) {
    if (segment.type === 'city') connect(place(segment, segment.name, 'stay'));
    else travel = segment;
  }
  if (travel && stops.length) {
    const destination = splitRouteName(travel.name)?.[1];
    if (destination) connect(place(travel, destination, 'end'));
  }
  return { stops, legs };
}
