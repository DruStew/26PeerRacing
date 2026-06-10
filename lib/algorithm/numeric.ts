/**
 * Numeric helpers that mirror NumPy / CPython semantics so the TypeScript port of the
 * Peer Racing algorithm reproduces the original Python program's results exactly.
 *
 * Reference: 26_PR Program/src/peer_racing_algorithm.py (np.mean, np.std, np.percentile,
 * np.linspace) and CPython's round() (banker's rounding).
 */

/** NumPy block size for pairwise summation (numpy/core/src/umath/loops_utils.h). */
const PW_BLOCKSIZE = 128;

/**
 * NumPy's pairwise summation (np.add.reduce). Plain left-to-right JS summation rounds
 * differently in the last bits; mean/std feed division boundaries, so we match NumPy.
 */
function pairwiseSum(a: ArrayLike<number>, offset: number, n: number): number {
  if (n < 8) {
    let res = 0;
    for (let i = 0; i < n; i++) res += a[offset + i];
    return res;
  }
  if (n <= PW_BLOCKSIZE) {
    const r: number[] = new Array(8);
    for (let j = 0; j < 8; j++) r[j] = a[offset + j];
    let i = 8;
    for (; i < n - (n % 8); i += 8) {
      for (let j = 0; j < 8; j++) r[j] += a[offset + i + j];
    }
    let res = ((r[0] + r[1]) + (r[2] + r[3])) + ((r[4] + r[5]) + (r[6] + r[7]));
    for (; i < n; i++) res += a[offset + i];
    return res;
  }
  let n2 = Math.floor(n / 2);
  n2 -= n2 % 8;
  return pairwiseSum(a, offset, n2) + pairwiseSum(a, offset + n2, n - n2);
}

export function npSum(xs: ArrayLike<number>): number {
  return pairwiseSum(xs, 0, xs.length);
}

/** np.mean */
export function npMean(xs: ArrayLike<number>): number {
  return npSum(xs) / xs.length;
}

/** np.std — population standard deviation (ddof=0), squared deviations summed pairwise. */
export function npStd(xs: ArrayLike<number>): number {
  const m = npMean(xs);
  const sq: number[] = new Array(xs.length);
  for (let i = 0; i < xs.length; i++) {
    const d = xs[i] - m;
    sq[i] = d * d;
  }
  return Math.sqrt(npMean(sq));
}

export function npMin(xs: ArrayLike<number>): number {
  let m = xs[0];
  for (let i = 1; i < xs.length; i++) if (xs[i] < m) m = xs[i];
  return m;
}

export function npMax(xs: ArrayLike<number>): number {
  let m = xs[0];
  for (let i = 1; i < xs.length; i++) if (xs[i] > m) m = xs[i];
  return m;
}

/**
 * np.percentile with the default "linear" method, including NumPy's _lerp trick of
 * computing from the upper bound when t >= 0.5 (affects the last float bit).
 */
export function npPercentile(xs: ArrayLike<number>, q: number): number {
  const a = Array.from(xs).sort((x, y) => x - y);
  const n = a.length;
  if (n === 1) return a[0];
  const rank = (q / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.min(lo + 1, n - 1);
  const t = rank - lo;
  const diff = a[hi] - a[lo];
  return t >= 0.5 ? a[hi] - diff * (1 - t) : a[lo] + diff * t;
}

/** np.linspace with endpoint=True (final element pinned to `stop` exactly, as NumPy does). */
export function npLinspace(start: number, stop: number, num: number): number[] {
  if (num <= 0) return [];
  if (num === 1) return [start];
  const step = (stop - start) / (num - 1);
  const out: number[] = new Array(num);
  for (let i = 0; i < num; i++) out[i] = start + step * i;
  out[num - 1] = stop;
  return out;
}

/** CPython round(x) with no ndigits: round-half-to-even ("banker's rounding"), returns int. */
export function pythonRound(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** scipy.stats.norm.pdf — used only for analysis-chart data, never for division math. */
export function normPdf(x: number, mu: number, sigma: number): number {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}
