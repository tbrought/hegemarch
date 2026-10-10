/** Small, fast 3D value noise for procedural textures (visual only). */
export class Noise3 {
  private perm: Uint8Array;
  private vals: Float32Array;

  constructor(seed: number) {
    let s = seed >>> 0 || 1;
    const rand = () => {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    this.vals = new Float32Array(256);
    for (let i = 0; i < 256; i++) this.vals[i] = rand();
  }

  private h(x: number, y: number, z: number): number {
    const P = this.perm;
    return this.vals[P[P[P[x & 255] + (y & 255)] + (z & 255)]];
  }

  noise(x: number, y: number, z: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = x - xi;
    const yf = y - yi;
    const zf = z - zi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const w = zf * zf * (3 - 2 * zf);
    const c000 = this.h(xi, yi, zi);
    const c100 = this.h(xi + 1, yi, zi);
    const c010 = this.h(xi, yi + 1, zi);
    const c110 = this.h(xi + 1, yi + 1, zi);
    const c001 = this.h(xi, yi, zi + 1);
    const c101 = this.h(xi + 1, yi, zi + 1);
    const c011 = this.h(xi, yi + 1, zi + 1);
    const c111 = this.h(xi + 1, yi + 1, zi + 1);
    const x00 = c000 + (c100 - c000) * u;
    const x10 = c010 + (c110 - c010) * u;
    const x01 = c001 + (c101 - c001) * u;
    const x11 = c011 + (c111 - c011) * u;
    const y0 = x00 + (x10 - x00) * v;
    const y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  }

  fbm(x: number, y: number, z: number, oct = 5, lac = 2.0, gain = 0.5): number {
    let amp = 0.5;
    let f = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * this.noise(x * f, y * f, z * f);
      norm += amp;
      amp *= gain;
      f *= lac;
    }
    return sum / norm;
  }

  ridge(x: number, y: number, z: number, oct = 4): number {
    let amp = 0.5;
    let f = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      const n = 1 - Math.abs(this.noise(x * f, y * f, z * f) * 2 - 1);
      sum += amp * n * n;
      norm += amp;
      amp *= 0.5;
      f *= 2.1;
    }
    return sum / norm;
  }
}
