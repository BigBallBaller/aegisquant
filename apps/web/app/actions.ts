"use server";

import fs from "fs/promises";
import path from "path";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance();

// ─── Configuration ──────────────────────────────────────────────────────────

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const RAW_DIR = path.join(DATA_DIR, "raw");
const PROCESSED_DIR = path.join(DATA_DIR, "processed");

async function ensureDirs() {
  await fs.mkdir(RAW_DIR, { recursive: true });
  await fs.mkdir(PROCESSED_DIR, { recursive: true });
}

// ─── Types ──────────────────────────────────────────────────────────────────

type RawRow = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
};

type FeatureRow = {
  date: string;
  close: number;
  volume?: number;
  log_ret: number;
  vol_20: number;
  mom_60: number;
  drawdown: number;
};

type RegimeRow = {
  date: string;
  z_vol: number;
  risk_off_prob: number;
};

// ─── Math Utilities ─────────────────────────────────────────────────────────

function rollingMean(arr: number[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(arr.length).fill(null);
  for (let i = window - 1; i < arr.length; i++) {
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) sum += arr[j];
    out[i] = sum / window;
  }
  return out;
}

function rollingStd(arr: number[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(arr.length).fill(null);
  const means = rollingMean(arr, window);
  for (let i = window - 1; i < arr.length; i++) {
    const m = means[i]!;
    let sumSq = 0;
    for (let j = i - window + 1; j <= i; j++) {
      const d = arr[j] - m;
      sumSq += d * d;
    }
    out[i] = Math.sqrt(sumSq / (window - 1)); // ddof=1 to match pandas
  }
  return out;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function arrMean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function arrStd(arr: number[], ddof = 1): number {
  const m = arrMean(arr);
  const sumSq = arr.reduce((s, v) => s + (v - m) ** 2, 0);
  return Math.sqrt(sumSq / (arr.length - ddof));
}

// ─── File I/O ───────────────────────────────────────────────────────────────

function utcStamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z/, "Z");
}

async function latestFile(
  dir: string,
  prefix: string
): Promise<string | null> {
  try {
    const files = await fs.readdir(dir);
    const matching = files
      .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
      .sort();
    return matching.length > 0
      ? path.join(dir, matching[matching.length - 1])
      : null;
  } catch {
    return null;
  }
}

async function readJson<T>(fp: string): Promise<T> {
  const raw = await fs.readFile(fp, "utf-8");
  return JSON.parse(raw) as T;
}

async function writeJson(fp: string, data: unknown): Promise<void> {
  await fs.writeFile(fp, JSON.stringify(data), "utf-8");
}

// ─── Internal: Read Cached Data ─────────────────────────────────────────────

async function readLatestPrices(symbol: string): Promise<RawRow[]> {
  const sym = symbol.toUpperCase().trim();
  const fp = await latestFile(RAW_DIR, `${sym}_1d_`);
  if (!fp) throw new Error(`No cached raw data for ${sym}. Pull data first.`);
  return readJson<RawRow[]>(fp);
}

async function readLatestFeatures(symbol: string): Promise<FeatureRow[]> {
  const sym = symbol.toUpperCase().trim();
  const fp = await latestFile(PROCESSED_DIR, `${sym}_features_`);
  if (!fp)
    throw new Error(`No cached features for ${sym}. Run process first.`);
  return readJson<FeatureRow[]>(fp);
}

async function readLatestRegime(
  symbol: string,
  model = "baseline"
): Promise<RegimeRow[]> {
  const sym = symbol.toUpperCase().trim();
  const fp = await latestFile(PROCESSED_DIR, `${sym}_regime_${model}_`);
  if (!fp)
    throw new Error(
      `No cached regime data for ${sym} model=${model}. Run regime first.`
    );
  return readJson<RegimeRow[]>(fp);
}

// ─── Internal: Feature Engineering ──────────────────────────────────────────

function buildFeatures(
  rows: RawRow[],
  volWindow = 20,
  momWindow = 60
): FeatureRow[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const closes = sorted.map((r) => r.close);
  const n = closes.length;

  // log returns
  const logRet: (number | null)[] = [null];
  for (let i = 1; i < n; i++) {
    logRet.push(Math.log(closes[i] / closes[i - 1]));
  }

  // rolling volatility (on log returns, treating first null as 0 for window)
  const logRetForRoll = logRet.map((v) => v ?? 0);
  const vol = rollingStd(logRetForRoll, volWindow);

  // momentum
  const mom: (number | null)[] = new Array(n).fill(null);
  for (let i = momWindow; i < n; i++) {
    mom[i] = Math.log(closes[i] / closes[i - momWindow]);
  }

  // drawdown
  let runMax = -Infinity;
  const dd: number[] = [];
  for (let i = 0; i < n; i++) {
    runMax = Math.max(runMax, closes[i]);
    dd.push(closes[i] / runMax - 1);
  }

  // keep only rows where all rolling values are available
  const out: FeatureRow[] = [];
  for (let i = 0; i < n; i++) {
    if (logRet[i] === null || vol[i] === null || mom[i] === null) continue;
    const row: FeatureRow = {
      date: sorted[i].date,
      close: sorted[i].close,
      log_ret: logRet[i]!,
      vol_20: vol[i]!,
      mom_60: mom[i]!,
      drawdown: dd[i],
    };
    if (sorted[i].volume != null) {
      row.volume = sorted[i].volume;
    }
    out.push(row);
  }
  return out;
}

// ─── Internal: Regime Model ─────────────────────────────────────────────────

function buildBaselineRegime(
  feats: FeatureRow[],
  volCol: "vol_20" = "vol_20",
  zWindow = 252,
  k = 1.25
): RegimeRow[] {
  const sorted = [...feats].sort((a, b) => a.date.localeCompare(b.date));
  const vols = sorted.map((r) => r[volCol]);

  const mu = rollingMean(vols, zWindow);
  const sd = rollingStd(vols, zWindow);

  const out: RegimeRow[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (mu[i] === null || sd[i] === null || sd[i] === 0) continue;
    const z = (vols[i] - mu[i]!) / sd[i]!;
    out.push({
      date: sorted[i].date,
      z_vol: z,
      risk_off_prob: sigmoid(k * z),
    });
  }
  return out;
}

// ─── Internal: Quality Report ───────────────────────────────────────────────

type QualityReport = {
  ok: boolean;
  error?: string;
  rows?: number;
  start?: string;
  end?: string;
  duplicate_dates?: number;
  missing_business_days_count?: number;
  missing_business_days_sample?: string[];
  close_missing?: number;
  volume_missing?: number;
};

function qualityReport(rows: RawRow[]): QualityReport {
  if (rows.length === 0) return { ok: false, error: "no data" };

  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));

  // duplicate dates
  const dateSet = new Set<string>();
  let dupDates = 0;
  for (const r of sorted) {
    if (dateSet.has(r.date)) dupDates++;
    dateSet.add(r.date);
  }

  // business day gaps (Mon-Fri, no holiday calendar — matches pandas freq="B")
  const startDate = new Date(sorted[0].date + "T00:00:00");
  const endDate = new Date(sorted[sorted.length - 1].date + "T00:00:00");
  const businessDays: string[] = [];
  const d = new Date(startDate);
  while (d <= endDate) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      businessDays.push(d.toISOString().split("T")[0]);
    }
    d.setDate(d.getDate() + 1);
  }

  const actualDates = new Set(sorted.map((r) => r.date));
  const missing = businessDays.filter((bd) => !actualDates.has(bd));

  const closeMissing = sorted.filter((r) => r.close == null).length;
  const volumeMissing = sorted.filter((r) => r.volume == null).length;

  return {
    ok: true,
    rows: sorted.length,
    start: sorted[0].date,
    end: sorted[sorted.length - 1].date,
    duplicate_dates: dupDates,
    missing_business_days_count: missing.length,
    missing_business_days_sample: missing.slice(0, 10),
    close_missing: closeMissing,
    volume_missing: volumeMissing,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVER ACTIONS — all exported async functions below are callable from
// both server components and client components.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Metrics ────────────────────────────────────────────────────────────────

export async function getMetricsSummary() {
  return {
    symbol: "SPY",
    cagr: 0.134,
    sharpe: 1.12,
    max_drawdown: -0.187,
    updated_at: "local-dev",
  };
}

// ─── Data: Pull / Status / Quality ──────────────────────────────────────────

export async function pullPrices(symbol = "SPY", start = "2010-01-01") {
  await ensureDirs();
  const sym = symbol.toUpperCase().trim();

  const chartResult = await yf.chart(sym, {
    period1: start,
    period2: new Date(),
    interval: "1d",
  });

  const quotes = chartResult.quotes;
  if (!quotes || quotes.length === 0) {
    throw new Error(`No data returned for ${sym} start=${start}`);
  }

  const rows: RawRow[] = quotes
    .map((r) => ({
      date:
        r.date instanceof Date
          ? r.date.toISOString().split("T")[0]
          : String(r.date).split("T")[0],
      open: r.open ?? 0,
      high: r.high ?? 0,
      low: r.low ?? 0,
      close: r.close ?? 0,
      adjClose: r.adjclose ?? r.close ?? 0,
      volume: r.volume ?? 0,
    }))
    .filter((r) => r.close !== 0 && r.date != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  const stamp = utcStamp();
  const fp = path.join(RAW_DIR, `${sym}_1d_${start}_${stamp}.json`);
  await writeJson(fp, rows);

  return {
    symbol: sym,
    rows: rows.length,
    start: rows[0].date,
    end: rows[rows.length - 1].date,
    raw_path: fp,
  };
}

export async function getDataStatus(symbol = "SPY") {
  await ensureDirs();
  const sym = symbol.toUpperCase().trim();
  const fp = await latestFile(RAW_DIR, `${sym}_1d_`);
  if (!fp) return { symbol: sym, cached: false };

  const rows = await readJson<RawRow[]>(fp);
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return {
    symbol: sym,
    cached: true,
    rows: rows.length,
    start: sorted[0].date,
    end: sorted[sorted.length - 1].date,
    latest_file: fp,
  };
}

export async function getDataQuality(symbol = "SPY"): Promise<QualityReport & { symbol: string }> {
  const sym = symbol.toUpperCase().trim();
  const rows = await readLatestPrices(sym);
  return { symbol: sym, ...qualityReport(rows) };
}

// ─── Features: Process / Status / Preview / Series ──────────────────────────

export async function processFeatures(symbol = "SPY") {
  await ensureDirs();
  const sym = symbol.toUpperCase().trim();
  const rows = await readLatestPrices(sym);
  const feats = buildFeatures(rows);

  const stamp = utcStamp();
  const fp = path.join(PROCESSED_DIR, `${sym}_features_${stamp}.json`);
  await writeJson(fp, feats);

  return {
    symbol: sym,
    rows: feats.length,
    start: feats[0].date,
    end: feats[feats.length - 1].date,
    features_path: fp,
  };
}

export async function getFeaturesStatus(symbol = "SPY") {
  await ensureDirs();
  const sym = symbol.toUpperCase().trim();
  const fp = await latestFile(PROCESSED_DIR, `${sym}_features_`);
  if (!fp) return { symbol: sym, cached: false };

  const rows = await readJson<FeatureRow[]>(fp);
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return {
    symbol: sym,
    cached: true,
    rows: rows.length,
    start: sorted[0].date,
    end: sorted[sorted.length - 1].date,
    latest_file: fp,
    columns: Object.keys(rows[0]),
  };
}

export async function getFeaturesPreview(symbol = "SPY", n = 5) {
  const sym = symbol.toUpperCase().trim();
  const rows = await readLatestFeatures(sym);
  n = Math.max(1, Math.min(n, 25));
  return {
    symbol: sym,
    n,
    head: rows.slice(0, n),
    tail: rows.slice(-n),
  };
}

export async function getFeaturesSeries(symbol = "SPY", limit = 1500) {
  const sym = symbol.toUpperCase().trim();
  const fp = await latestFile(PROCESSED_DIR, `${sym}_features_`);
  if (!fp) return null;

  const rows = await readJson<FeatureRow[]>(fp);
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));

  limit = Math.max(1, Math.min(limit, 5000));
  const sliced = sorted.slice(-limit);

  const data = sliced.map((r) => ({
    date: r.date,
    close: r.close,
    drawdown: r.drawdown,
    vol_20: r.vol_20,
    mom_60: r.mom_60,
  }));

  return { symbol: sym, rows: data.length, data };
}

// ─── Regime: Run / Status / Preview / Series / Stats / Equity ───────────────

export async function runRegimeModel(
  symbol = "SPY",
  zWindow = 252,
  k = 1.25
) {
  await ensureDirs();
  const sym = symbol.toUpperCase().trim();
  const feats = await readLatestFeatures(sym);
  const regime = buildBaselineRegime(feats, "vol_20", zWindow, k);

  const stamp = utcStamp();
  const fp = path.join(
    PROCESSED_DIR,
    `${sym}_regime_baseline_${stamp}.json`
  );
  await writeJson(fp, regime);

  return {
    symbol: sym,
    rows: regime.length,
    start: regime[0].date,
    end: regime[regime.length - 1].date,
    model: "baseline",
    output_path: fp,
  };
}

export async function getRegimeStatus(symbol = "SPY", model = "baseline") {
  await ensureDirs();
  const sym = symbol.toUpperCase().trim();
  const fp = await latestFile(PROCESSED_DIR, `${sym}_regime_${model}_`);
  if (!fp) return { symbol: sym, model, cached: false };

  const rows = await readJson<RegimeRow[]>(fp);
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return {
    symbol: sym,
    model,
    cached: true,
    rows: rows.length,
    start: sorted[0].date,
    end: sorted[sorted.length - 1].date,
    latest_file: fp,
    columns: Object.keys(rows[0]),
  };
}

export async function getRegimePreview(
  symbol = "SPY",
  model = "baseline",
  n = 5
) {
  const sym = symbol.toUpperCase().trim();
  const rows = await readLatestRegime(sym, model);
  n = Math.max(1, Math.min(n, 25));
  return {
    symbol: sym,
    model,
    n,
    head: rows.slice(0, n),
    tail: rows.slice(-n),
  };
}

export async function getRegimeSeries(
  symbol = "SPY",
  limit = 1500,
  model = "baseline"
) {
  const sym = symbol.toUpperCase().trim();
  const fp = await latestFile(PROCESSED_DIR, `${sym}_regime_${model}_`);
  if (!fp) return null;

  const rows = await readJson<RegimeRow[]>(fp);
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));

  limit = Math.max(50, Math.min(limit, 5000));
  const sliced = sorted.slice(-limit);

  return { symbol: sym, model, rows: sliced.length, data: sliced };
}

export async function getRegimeStats(
  symbol = "SPY",
  threshold = 0.7,
  model = "baseline"
) {
  const sym = symbol.toUpperCase().trim();
  const featsFp = await latestFile(PROCESSED_DIR, `${sym}_features_`);
  const regimeFp = await latestFile(PROCESSED_DIR, `${sym}_regime_${model}_`);
  if (!featsFp || !regimeFp) return null;

  const feats = await readJson<FeatureRow[]>(featsFp);
  const regime = await readJson<RegimeRow[]>(regimeFp);

  // Build lookup: date -> risk_off_prob
  const regimeMap = new Map(regime.map((r) => [r.date, r.risk_off_prob]));

  // Merge features + regime on date
  const merged = feats
    .filter((f) => regimeMap.has(f.date))
    .map((f) => ({
      ...f,
      risk_off_prob: regimeMap.get(f.date)!,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Forward returns: signal at day t, evaluate return at day t+1
  const withFwd = merged.slice(0, -1).map((r, i) => ({
    ...r,
    fwd_log_ret_1d: merged[i + 1].log_ret,
  }));

  const thr = threshold;

  function summarize(rows: typeof withFwd) {
    const n = rows.length;
    if (n < 5) {
      return {
        n,
        coverage: withFwd.length > 0 ? n / withFwd.length : 0,
        mean_daily: null,
        ann_return: null,
        ann_vol: null,
        sharpe: null,
      };
    }
    const rets = rows.map((r) => r.fwd_log_ret_1d);
    const meanD = arrMean(rets);
    const volD = arrStd(rets, 1);
    const annReturn = meanD * 252;
    const annVol = volD * Math.sqrt(252);
    const sharpe = annVol > 0 ? annReturn / annVol : null;

    return {
      n,
      coverage: n / withFwd.length,
      mean_daily: meanD,
      ann_return: annReturn,
      ann_vol: annVol,
      sharpe,
    };
  }

  const riskOff = withFwd.filter((r) => r.risk_off_prob >= thr);
  const riskOn = withFwd.filter((r) => r.risk_off_prob < thr);

  const riskOffStats = summarize(riskOff);
  const riskOnStats = summarize(riskOn);

  // Delta: risk_on minus risk_off
  const delta: Record<string, number | null> = {};
  for (const key of [
    "mean_daily",
    "ann_return",
    "ann_vol",
    "sharpe",
  ] as const) {
    const a = riskOnStats[key];
    const b = riskOffStats[key];
    delta[key] = a != null && b != null ? a - b : null;
  }

  return {
    symbol: sym,
    model,
    threshold: thr,
    rows_used: withFwd.length,
    risk_on: riskOnStats,
    risk_off: riskOffStats,
    delta_risk_on_minus_off: delta,
  };
}

export async function getRegimeEquity(
  symbol = "SPY",
  threshold = 0.7,
  costBps = 5.0,
  limit = 5000,
  model = "baseline"
) {
  const sym = symbol.toUpperCase().trim();
  threshold = Math.max(0, Math.min(1, threshold));
  limit = Math.max(1, Math.min(limit, 5000));
  costBps = Math.max(0, Math.min(200, costBps));
  const cost = costBps / 10000;

  const featsFp = await latestFile(PROCESSED_DIR, `${sym}_features_`);
  const regimeFp = await latestFile(PROCESSED_DIR, `${sym}_regime_${model}_`);
  if (!featsFp || !regimeFp) return null;

  const feats = await readJson<FeatureRow[]>(featsFp);
  const regime = await readJson<RegimeRow[]>(regimeFp);

  // Merge on date
  const regimeMap = new Map(regime.map((r) => [r.date, r.risk_off_prob]));

  const merged = feats
    .filter((f) => regimeMap.has(f.date))
    .map((f) => ({
      date: f.date,
      close: f.close,
      risk_off_prob: regimeMap.get(f.date)!,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (merged.length === 0)
    throw new Error("No overlapping dates between features and regime series.");

  // Daily simple returns
  const ret: number[] = [0];
  for (let i = 1; i < merged.length; i++) {
    ret.push((merged[i].close - merged[i - 1].close) / merged[i - 1].close);
  }

  // Position: invest when risk_off_prob < threshold
  const pos = merged.map((r) => (r.risk_off_prob < threshold ? 1 : 0));

  // Trade events: when position flips
  const trade: number[] = [0];
  for (let i = 1; i < pos.length; i++) {
    trade.push(pos[i] !== pos[i - 1] ? 1 : 0);
  }

  // Equity curves
  const bh: number[] = [];
  const regimeGrossRet: number[] = [];
  const regimeGross: number[] = [];
  const regimeNetRet: number[] = [];
  const regimeNet: number[] = [];

  let bhEq = 1;
  let rgEq = 1;
  let rnEq = 1;

  for (let i = 0; i < merged.length; i++) {
    bhEq *= 1 + ret[i];
    bh.push(bhEq);

    const rgr = ret[i] * pos[i];
    regimeGrossRet.push(rgr);
    rgEq *= 1 + rgr;
    regimeGross.push(rgEq);

    const tc = trade[i] * cost;
    const rnr = rgr - tc;
    regimeNetRet.push(rnr);
    rnEq *= 1 + rnr;
    regimeNet.push(rnEq);
  }

  // Performance helpers
  function maxDrawdownFromEquity(eq: number[]): number {
    let runMax = -Infinity;
    let maxDd = 0;
    for (const v of eq) {
      runMax = Math.max(runMax, v);
      const dd = v / runMax - 1;
      maxDd = Math.min(maxDd, dd);
    }
    return maxDd;
  }

  function perfFromReturns(rets: number[]) {
    const n = rets.length;
    if (n < 5) {
      return {
        n,
        cagr: null,
        ann_return: null,
        ann_vol: null,
        sharpe: null,
      };
    }
    const meanD = arrMean(rets);
    const volD = arrStd(rets, 1);
    const annReturn = meanD * 252;
    const annVol = volD * Math.sqrt(252);
    const sharpe = annVol > 0 ? annReturn / annVol : null;

    // CAGR from realized equity
    let eq = 1;
    for (const r of rets) eq *= 1 + r;
    const years = Math.max(1e-9, n / 252);
    const cagr = Math.pow(eq, 1 / years) - 1;

    return { n, cagr, ann_return: annReturn, ann_vol: annVol, sharpe };
  }

  function summary(eqArr: number[], retArr: number[]) {
    const stats = perfFromReturns(retArr);
    return {
      ...stats,
      max_drawdown: maxDrawdownFromEquity(eqArr),
      final_equity: eqArr[eqArr.length - 1],
    };
  }

  const trades = trade.reduce((s, v) => s + v, 0);
  const years = Math.max(1e-9, merged.length / 252);
  const tradesPerYear = trades / years;
  const costDrag =
    regimeGross[regimeGross.length - 1] - regimeNet[regimeNet.length - 1];

  const summaries = {
    buy_hold: summary(bh, ret),
    regime_gross: summary(regimeGross, regimeGrossRet),
    regime_net: summary(regimeNet, regimeNetRet),
  };

  // Payload data (tail by limit)
  const allData = merged.map((_, i) => ({
    date: merged[i].date,
    bh: bh[i],
    regime_gross: regimeGross[i],
    regime_net: regimeNet[i],
    pos: pos[i],
    trade: trade[i],
  }));
  const outData = allData.slice(-limit);

  return {
    symbol: sym,
    model,
    threshold,
    cost_bps: costBps,
    start: merged[0].date,
    end: merged[merged.length - 1].date,
    rows: outData.length,
    trades,
    trades_per_year: tradesPerYear,
    cost_drag_final_equity: costDrag,
    summaries,
    data: outData,
  };
}

// ─── Pipeline: Seed (pull + process + regime in one shot) ───────────────────

export async function seedPipeline(
  symbol = "SPY",
  start = "2010-01-01",
  zWindow = 252,
  k = 1.25
) {
  await pullPrices(symbol, start);
  await processFeatures(symbol);
  await runRegimeModel(symbol, zWindow, k);
  return { ok: true };
}
