export type SeededRandom = {
  next(): number;
  nextInt(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
};

function hashSeed(seed: string): number {
  let hash = 2_166_136_261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
}

/**
 * Creates a deterministic pseudo-random sequence for one battle.
 * The returned values are in the [0, 1) interval.
 */
export function createSeededRandom(seed: string): SeededRandom {
  if (seed.length === 0) {
    throw new Error("A battle seed cannot be empty.");
  }

  let state = hashSeed(seed);

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };

  return {
    next,
    nextInt(min: number, max: number): number {
      assertFiniteNumber(min, "min");
      assertFiniteNumber(max, "max");

      if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
        throw new RangeError("Random integer bounds must be ordered integers.");
      }

      return Math.floor(next() * (max - min + 1)) + min;
    },
    chance(probability: number): boolean {
      assertFiniteNumber(probability, "probability");

      if (probability < 0 || probability > 1) {
        throw new RangeError("Probability must be between 0 and 1.");
      }

      if (probability === 0) return false;
      if (probability === 1) return true;

      return next() < probability;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new RangeError("Cannot pick an item from an empty list.");
      }

      return items[Math.floor(next() * items.length)];
    },
  };
}
