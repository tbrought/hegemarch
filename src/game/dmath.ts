/**
 * Sine, cosine, arc tangent and the length of a vector, the same in every browser to the last bit.
 *
 * The simulation must come out the same wherever it runs: a Daily run is checked by playing its orders
 * again on a server (the board, 1.25), and a run played in Firefox or Safari must come out there as it
 * did for its player. JavaScript fixes `+ - * /` and `Math.sqrt` to the last bit (IEEE 754), but leaves
 * `Math.sin`, `Math.cos`, `Math.atan2` and `Math.hypot` to each engine, and engines differ in the last
 * bit now and then; in a game of thousands of ticks such a bit grows into another game. These are made of
 * the fixed operations alone (the polynomials and reductions of fdlibm, as FreeBSD has them), so they are
 * the same everywhere. The simulation (src/game) uses these and never the others; a test holds it.
 */

// sin and cos on [-pi/4, pi/4] (fdlibm k_sin.c, k_cos.c): x and its tail y.
const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

function ksin(x: number, y: number): number {
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x - (z * (0.5 * y - v * r) - y - v * S1);
}

function kcos(x: number, y: number): number {
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  const hz = 0.5 * z;
  const w = 1 - hz;
  return w + (1 - w - hz + (z * r - x * y));
}

// x - n·pi/2, as a head and a tail (fdlibm e_rem_pio2.c, its medium path): good to many thousands of radians.
const INV_PIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417;
const PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.07710050630396597660e-11;
const PIO2_2T = 2.02226624879595063154e-21;
const PIO4 = 7.85398163397448278999e-1;
/** The quadrant of the last reduction, and its head and tail. */
let rn = 0;
let r0 = 0;
let r1 = 0;

function reduce(x: number) {
  const fn = Math.floor(x * INV_PIO2 + 0.5);
  let r = x - fn * PIO2_1;
  let w = fn * PIO2_1T;
  const t = r;
  w = fn * PIO2_2;
  r = t - w;
  w = fn * PIO2_2T - (t - r - w);
  r0 = r - w;
  r1 = r - r0 - w;
  rn = ((fn % 4) + 4) % 4;
}

/** The sine of x (radians), the same in every engine. */
export function dsin(x: number): number {
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  if (x > -PIO4 && x < PIO4) return ksin(x, 0);
  reduce(x);
  if (rn === 0) return ksin(r0, r1);
  if (rn === 1) return kcos(r0, r1);
  if (rn === 2) return -ksin(r0, r1);
  return -kcos(r0, r1);
}

/** The cosine of x (radians), the same in every engine. */
export function dcos(x: number): number {
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  if (x > -PIO4 && x < PIO4) return kcos(x, 0);
  reduce(x);
  if (rn === 0) return kcos(r0, r1);
  if (rn === 1) return -ksin(r0, r1);
  if (rn === 2) return -kcos(r0, r1);
  return ksin(r0, r1);
}

// atan (fdlibm s_atan.c).
const ATAN_HI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.57079632679489655800];
const ATAN_LO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.11111104054623557880e-1, 9.09088713343650656196e-2,
  -7.69187620504482999495e-2, 6.66107313738753120669e-2, -5.83357013379057348645e-2, 4.97687799461593236017e-2, -3.65315727442169155270e-2,
  1.62858201153657823623e-2,
];

function datan(x: number): number {
  if (x !== x) return NaN;
  const neg = x < 0;
  let a = neg ? -x : x;
  if (a >= 7.3786976294838206464e19) return neg ? -ATAN_HI[3] - ATAN_LO[3] : ATAN_HI[3] + ATAN_LO[3];
  let id = -1;
  if (a < 0.4375) {
    if (a < 3.7252902984e-9) return x;
  } else if (a < 1.1875) {
    if (a < 0.6875) {
      id = 0;
      a = (2 * a - 1) / (2 + a);
    } else {
      id = 1;
      a = (a - 1) / (a + 1);
    }
  } else if (a < 2.4375) {
    id = 2;
    a = (a - 1.5) / (1 + 1.5 * a);
  } else {
    id = 3;
    a = -1 / a;
  }
  const z = a * a;
  const w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) {
    const r = a - a * (s1 + s2);
    return neg ? -r : r;
  }
  const r = ATAN_HI[id] - (a * (s1 + s2) - ATAN_LO[id] - a);
  return neg ? -r : r;
}

const PI = 3.1415926535897931160;
const PI_LO = 1.2246467991473531772e-16;

/** The angle of the point (x, y) from the x axis, in (-pi, pi], as `Math.atan2(y, x)`: the same in every engine. */
export function datan2(y: number, x: number): number {
  if (x !== x || y !== y) return NaN;
  if (y === 0) return x > 0 || (x === 0 && 1 / x > 0) ? y : 1 / y > 0 ? PI : -PI;
  if (x === 0) return y > 0 ? PI / 2 : -PI / 2;
  const z = datan(Math.abs(y / x));
  if (x > 0) return y > 0 ? z : -z;
  return y > 0 ? PI - (z - PI_LO) : z - PI_LO - PI;
}

/** The length of the vector (x, y), as `Math.hypot(x, y)`: the same in every engine. */
export function dhypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}
