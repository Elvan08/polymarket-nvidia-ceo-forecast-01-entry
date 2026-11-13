// polymarket-nvidia-ceo-forecast-01 entry: per-market robust-volatility persistence fan.
//
// The house baseline keeps every market at its last price with one fixed spread
// (0.0025 per sqrt-minute) for all markets. These markets differ wildly: most are
// illiquid longshots whose midpoint sits still for hours, a few trade actively.
// A fixed spread is far too wide for the quiet markets (pure pinball waste on
// every minute they do not move) and too narrow for the jumpy ones.
//
// This entry keeps the persistence centre (the last price is the median) but
// estimates each market's own minute-move scale from its last 24 hours of
// 1-minute changes, robustly (an average of two normal-consistent scale
// estimates from the change distribution's interquantile ranges, so the large
// atom at zero and the occasional jump do not blow it up), floors and caps it,
// and fans out with the normal quantiles on a sqrt(h) random-walk scaling.
//
// Reads every <id>.in in the input directory, writes <id>.out per case:
// {"forecasts":[{"id","q"}]} with horizon_minutes rows of the five quantiles
// [0.05, 0.25, 0.5, 0.75, 0.95], non-decreasing, in [0,1]. Offline, stdlib only.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The quantile levels the contest scores, in the order each row lists them. */
const QUANTILES = [0.05, 0.25, 0.5, 0.75, 0.95];
/** The standard normal's quantile at each level, to 6 decimals. */
const Z = [-1.644854, -0.67449, 0, 0.67449, 1.644854];
/** Minutes of recent history the volatility estimate reads. */
const VOL_WINDOW = 1440;
/** Per-market scale bounds, in price units per sqrt-minute. */
const SIGMA_FLOOR = 0.0002;
const SIGMA_CAP = 0.02;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  horizon_minutes: number;
  quantiles: number[];
  markets: CaseMarket[];
}

/** x clamped to [0,1] and rounded to 6 decimals (0, never -0). */
const price6 = (x: number): number => Math.round(Math.min(1, Math.max(0, x)) * 1e6) / 1e6 + 0;

/** The tau-quantile of an ascending-sorted array (linear interpolation). */
function quantileSorted(sorted: number[], tau: number): number {
  if (sorted.length === 0) return 0;
  const i = tau * (sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? (sorted[lo] as number) : (sorted[lo] as number) + ((sorted[hi] as number) - (sorted[lo] as number)) * (i - lo);
}

/**
 * One market's minute-move scale from its recent 1-minute changes: the average
 * of the IQR-based and the 5-95-range-based normal-consistent estimates.
 */
function marketSigma(prices: number[]): number {
  const from = Math.max(1, prices.length - VOL_WINDOW);
  const changes: number[] = [];
  for (let i = from; i < prices.length; i++) changes.push((prices[i] as number) - (prices[i - 1] as number));
  if (changes.length === 0) return SIGMA_FLOOR;
  const s = [...changes].sort((a, b) => a - b);
  const byIqr = (quantileSorted(s, 0.75) - quantileSorted(s, 0.25)) / 1.349;
  const byRange = (quantileSorted(s, 0.95) - quantileSorted(s, 0.05)) / 3.29;
  const sigma = (byIqr + byRange) / 2;
  return Math.min(SIGMA_CAP, Math.max(SIGMA_FLOOR, sigma));
}

/** The forecast of one market: horizon rows of five quantiles around its last price. */
function forecast(m: CaseMarket, horizon: number): number[][] {
  if (m.prices.length === 0) throw new Error(`market ${m.id} has no prices`);
  const x = m.prices[m.prices.length - 1] as number;
  const sigma = marketSigma(m.prices);
  const rows: number[][] = [];
  for (let h = 1; h <= horizon; h++) {
    const w = sigma * Math.sqrt(h);
    rows.push(Z.map((z) => price6(x + z * w)));
  }
  return rows;
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (c.quantiles.length !== QUANTILES.length || c.quantiles.some((t, j) => t !== QUANTILES[j])) throw new Error(`${file} asks for quantiles ${JSON.stringify(c.quantiles)}, not ${JSON.stringify(QUANTILES)}`);
  const forecasts = c.markets.map((m) => ({ id: m.id, q: forecast(m, c.horizon_minutes) }));
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ forecasts })}\n`);
}
