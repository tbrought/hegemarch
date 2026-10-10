/**
 * Deterministic, serializable PRNG (sfc32 seeded through splitmix32).
 * Every gameplay-affecting random roll goes through an RNG instance so a run
 * is fully reproducible from its seed plus the player's commands.
 */
export class RNG {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number | number[]) {
    if (Array.isArray(seed)) {
      [this.a, this.b, this.c, this.d] = seed.map((v) => v >>> 0) as [number, number, number, number];
    } else {
      let s = seed >>> 0;
      const sm = () => {
        s = (s + 0x9e3779b9) >>> 0;
        let z = s;
        z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
        z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
        return (z ^ (z >>> 16)) >>> 0;
      };
      this.a = sm();
      this.b = sm();
      this.c = sm();
      this.d = sm();
      for (let i = 0; i < 12; i++) this.next();
    }
  }

  state(): number[] {
    return [this.a, this.b, this.c, this.d];
  }

  /** Uniform float in [0, 1). */
  next(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = (this.b ^ (this.b >>> 9)) >>> 0;
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t / 4294967296;
  }

  float(min = 0, max = 1): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  weighted<T>(items: readonly T[], weight: (t: T) => number): T | undefined {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Derive an independent child seed (for visuals etc.). */
  fork(): number {
    return (this.next() * 4294967296) >>> 0;
  }
}

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function randomSeed(): number {
  return (Math.random() * 4294967296) >>> 0;
}

/** Daily-run seed: identical for everyone on the same UTC date. */
export function dailySeed(date = new Date()): number {
  const key = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  return hashString('hegemarch-daily-' + key);
}
