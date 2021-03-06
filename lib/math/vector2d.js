export function copy(dst, src) {
  dst.x = src.x;
  dst.y = src.y;
}

export function dot(p, q) {
  return p.x * q.x + p.y * q.y;
}

export function len(p) {
  return Math.sqrt(len2(p));
}

export function len2(p) {
  return dot(p, p);
}

export function dist(p, q) {
  return len(sub(p, q));
}

export function dist2(p, q) {
  return len2(sub(p, q));
}

export function sub(p, q) {
  return {x: p.x - q.x, y: p.y - q.y};
}

export function add(p, q) {
  return {x: p.x + q.x, y: p.y + q.y};
}

export function scale(p, s) {
  return {x: p.x * s, y: p.y * s};
}

export function crossMag(p, q) {
  // The magnitude of the cross product of two 2d vectors is easy to calculate:
  return p.x * q.y - q.x * p.y;
}

export function side(p, q, x) {
  return crossMag(sub(q, p), sub(x, p));
}

export function lerp(p, q, s) {
  return add(p, scale(sub(q, p), s));
}

export function project(v, b) {
  return scale(b, dot(v, b) / len2(b));
}

export function flip(v, b) {
  const vOnB = project(v, b);
  return sub(v, scale(sub(v, vOnB), 2));
}

// CW, of all things.
export function rot(v, angle) {
  return rotCW(v, angle);
}

export function rotCW(v, angle) {
  return rotCCW(v, -angle);
}

export function rotCCW(v, angle) {
  return {
    x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
    y: v.x * Math.sin(angle) + v.y * Math.cos(angle),
  };
}
