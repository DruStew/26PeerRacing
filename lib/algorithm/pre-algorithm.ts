/**
 * Port of 26_PR Program/src/prealgorithm.py — recommends percentile cutoffs that
 * exclude extreme outliers (|z-score| beyond the limits) from division calculations.
 * "Tweak the ends": producers can still override these percentiles manually.
 */

import type { AlgorithmEntry } from "./entry";
import { npMean, npStd } from "./numeric";

export interface PreAlgorithmResult {
  lowPercentileCutoff: number;
  highPercentileCutoff: number;
}

export function runPreAlgorithm(
  entries: AlgorithmEntry[],
  zLow = -3,
  zHigh = 3,
): PreAlgorithmResult {
  const timesH = entries.map((e) => e.timeS / 3600.0);
  const avg = npMean(timesH);
  const std = npStd(timesH);

  const zscore = (t: number) => (t - avg) / std;
  // Python: 100 * (count of strictly-smaller times) / n
  const percentile = (t: number) => {
    let count = 0;
    for (const other of timesH) if (other < t) count++;
    return (100 * count) / timesH.length;
  };

  let lowPCutoff = 0;
  let highPCutoff = 100;

  for (const t of timesH) {
    const z = zscore(t);
    if (z < 0 && z < zLow) {
      let p = Math.ceil(percentile(t));
      p = p > 0 ? p : 1;
      lowPCutoff = Math.max(lowPCutoff, p);
    } else if (z > 0 && z > zHigh) {
      const p = Math.floor(percentile(t));
      highPCutoff = Math.min(highPCutoff, p);
    }
  }

  return { lowPercentileCutoff: lowPCutoff, highPercentileCutoff: highPCutoff };
}
