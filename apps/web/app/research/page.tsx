"use client"

import { useEffect, useMemo, useState } from "react"
import { PageShell } from "@/components/page-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
} from "recharts"

type RegimePoint = {
  date: string
  z_vol?: number
  risk_off_prob: number
}

type FeaturePoint = {
  date: string
  close: number
  drawdown: number
  vol_20?: number
  mom_60?: number
}

type EquityPoint = {
  date: string
  bh: number
  regime_gross: number
  regime_net: number
  pos: number
  trade: number
}

type EquitySummary = {
  n: number
  cagr: number | null
  ann_return: number | null
  ann_vol: number | null
  sharpe: number | null
  max_drawdown: number | null
  final_equity: number | null
}

type EquityResponse = {
  debug?: string
  symbol: string
  model: string
  threshold: number
  cost_bps: number
  start: string
  end: string
  rows: number
  trades: number
  trades_per_year: number
  cost_drag_final_equity?: number
  summaries: {
    buy_hold: EquitySummary
    regime_gross: EquitySummary
    regime_net: EquitySummary
  }
  data: EquityPoint[]
}

function computeRiskOffBands(
  dates: string[],
  probs: number[],
  threshold: number
): { x1: string; x2: string }[] {
  const bands: { x1: string; x2: string }[] = []
  let start: string | null = null

  for (let i = 0; i < dates.length; i++) {
    const isOff = probs[i] >= threshold
    if (isOff && start == null) start = dates[i]
    if (!isOff && start != null) {
      bands.push({ x1: start, x2: dates[i] })
      start = null
    }
  }

  if (start != null && dates.length > 0) {
    bands.push({ x1: start, x2: dates[dates.length - 1] })
  }

  return bands
}

function fmtProb(x: number) {
  if (!Number.isFinite(x)) return "–"
  return x.toFixed(3)
}

function fmtNum(x: number) {
  if (!Number.isFinite(x)) return "–"
  return x.toFixed(2)
}

function fmtMaybeNum(x: number | null | undefined, digits = 2) {
  if (x == null || !Number.isFinite(x)) return "–"
  return Number(x).toFixed(digits)
}

function fmtMaybePct(x: number | null | undefined, digits = 2) {
  if (x == null || !Number.isFinite(x)) return "–"
  return `${(Number(x) * 100).toFixed(digits)}%`
}

export default function ResearchPage() {
  const [regime, setRegime] = useState<RegimePoint[]>([])
  const [feats, setFeats] = useState<FeaturePoint[]>([])
  const [stats, setStats] = useState<any | null>(null)
  const [equity, setEquity] = useState<EquityResponse | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // UI controls
  const [limit, setLimit] = useState<number>(1500)
  const [showZ, setShowZ] = useState<boolean>(false)

  // Baseline model params
  const [zWindow, setZWindow] = useState<number>(252)
  const [k, setK] = useState<number>(1.25)

  // Strategy / visualization params
  const [stress, setStress] = useState<number>(0.7)
  const [threshold, setThreshold] = useState<number>(0.45)
  const [costBps, setCostBps] = useState<number>(5.0)

  const [running, setRunning] = useState<boolean>(false)

  const latest = useMemo(
    () => (regime.length ? regime[regime.length - 1] : null),
    [regime]
  )

  const riskOffBands = useMemo(() => {
    if (!regime || regime.length === 0) return []
    const dates = regime.map((d) => d.date)
    const probs = regime.map((d) => d.risk_off_prob)
    return computeRiskOffBands(dates, probs, stress)
  }, [regime, stress])

  async function fetchSeries() {
    const [rRes, fRes, sRes, eRes] = await Promise.all([
      fetch(`http://localhost:8000/regime/series?symbol=SPY&limit=${limit}`, {
        cache: "no-store",
      }),
      fetch(`http://localhost:8000/features/series?symbol=SPY&limit=${limit}`, {
        cache: "no-store",
      }),
      fetch(
        `http://localhost:8000/regime/stats?symbol=SPY&threshold=${stress}`,
        { cache: "no-store" }
      ),
      fetch(
        `http://localhost:8000/regime/equity?symbol=SPY&threshold=${threshold}&cost_bps=${costBps}&limit=${limit}`,
        { cache: "no-store" }
      ),
    ])

    if (!rRes.ok) throw new Error(`Failed to fetch regime series (${rRes.status})`)
    if (!fRes.ok) throw new Error(`Failed to fetch features series (${fRes.status})`)
    if (!sRes.ok) throw new Error(`Failed to fetch regime stats (${sRes.status})`)
    if (!eRes.ok) throw new Error(`Failed to fetch equity series (${eRes.status})`)

    const rJson = await rRes.json()
    const fJson = await fRes.json()
    const sJson = await sRes.json()
    const eJson = await eRes.json()

    const rRows = Array.isArray(rJson?.data) ? (rJson.data as RegimePoint[]) : []
    const fRows = Array.isArray(fJson?.data) ? (fJson.data as FeaturePoint[]) : []

    setRegime(rRows)
    setFeats(fRows)
    setStats(sJson)
    setEquity(eJson as EquityResponse)
  }

  useEffect(() => {
    let alive = true

    async function run() {
      try {
        setLoading(true)
        setError(null)
        setStats(null)
        setEquity(null)

        if (!alive) return
        await fetchSeries()
      } catch (e: any) {
        if (alive) setError(e?.message ?? "Unknown error")
      } finally {
        if (alive) setLoading(false)
      }
    }

    run()
    return () => {
      alive = false
    }
  }, [limit, stress, threshold, costBps])

  async function runBaseline() {
    try {
      setRunning(true)
      setError(null)

      const url = `http://localhost:8000/regime/run?symbol=SPY&z_window=${zWindow}&k=${k}`
      const res = await fetch(url, { method: "POST" })

      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.detail ?? `Run failed (${res.status})`)
      }

      await fetchSeries()
    } catch (e: any) {
      setError(e?.message ?? "Unknown error")
    } finally {
      setRunning(false)
    }
  }

  const hasRegime = regime.length > 0
  const hasFeats = feats.length > 0

  return (
    <PageShell
      title="Research"
      badge={<Badge variant="secondary">Baseline Regime</Badge>}
      subtitle="Run baseline regime experiments and visualize regime probabilities alongside price, drawdown, and strategy equity."
    >
      {/* Experiment Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Experiment controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Lookback</span>
              <select
                className="h-9 rounded-md border bg-background px-3"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              >
                <option value={500}>500</option>
                <option value={1500}>1500</option>
                <option value={3000}>3000</option>
                <option value={5000}>5000</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">z_window</span>
              <input
                className="h-9 w-28 rounded-md border bg-background px-3"
                type="number"
                min={20}
                max={1000}
                value={zWindow}
                onChange={(e) => setZWindow(Number(e.target.value))}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">k</span>
              <input
                className="h-9 w-28 rounded-md border bg-background px-3"
                type="number"
                step="0.05"
                min={0.1}
                max={10}
                value={k}
                onChange={(e) => setK(Number(e.target.value))}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">stress shading ≥</span>
              <input
                className="h-9 w-28 rounded-md border bg-background px-3"
                type="number"
                step="0.05"
                min={0}
                max={1}
                value={stress}
                onChange={(e) => setStress(Number(e.target.value))}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">strategy threshold</span>
              <input
                className="h-9 w-28 rounded-md border bg-background px-3"
                type="number"
                step="0.05"
                min={0}
                max={1}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">cost (bps)</span>
              <input
                className="h-9 w-28 rounded-md border bg-background px-3"
                type="number"
                step="1"
                min={0}
                max={200}
                value={costBps}
                onChange={(e) => setCostBps(Number(e.target.value))}
              />
            </label>

            <label className="flex items-center gap-2 pb-1.5">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={showZ}
                onChange={(e) => setShowZ(e.target.checked)}
              />
              <span className="text-muted-foreground">Show z_vol overlay</span>
            </label>

            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">
                Current risk-off: {latest ? fmtProb(latest.risk_off_prob) : "–"}
              </Badge>
              <Button onClick={runBaseline} disabled={running}>
                {running ? "Running…" : "Run baseline"}
              </Button>
            </div>
          </div>

          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
        </CardContent>
      </Card>

      {/* Regime Stats Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regime-conditioned stats (next-day returns)</CardTitle>
        </CardHeader>
        <CardContent>
          {!stats ? (
            <div className="text-sm text-muted-foreground">Loading stats…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left">Bucket</th>
                    <th className="py-2 text-right">Coverage</th>
                    <th className="py-2 text-right">Ann Return</th>
                    <th className="py-2 text-right">Ann Vol</th>
                    <th className="py-2 text-right">Sharpe</th>
                  </tr>
                </thead>
                <tbody>
                  {["risk_on", "risk_off"].map((key) => {
                    const row = stats[key]
                    const pct = (x: number | null) =>
                      x == null ? "–" : `${(x * 100).toFixed(2)}%`
                    const num = (x: number | null) =>
                      x == null ? "–" : Number(x).toFixed(2)

                    return (
                      <tr key={key} className="border-b">
                        <td className="py-2">
                          {key === "risk_on" ? "Risk-on" : `Risk-off (≥ ${stats.threshold})`}
                        </td>
                        <td className="py-2 text-right">{pct(row.coverage)}</td>
                        <td className="py-2 text-right">{pct(row.ann_return)}</td>
                        <td className="py-2 text-right">{pct(row.ann_vol)}</td>
                        <td className="py-2 text-right">{num(row.sharpe)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Equity Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Equity backtest (baseline timing)</CardTitle>
        </CardHeader>
        <CardContent>
          {!equity ? (
            <div className="text-sm text-muted-foreground">Loading equity…</div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">
                  Trades: {equity.trades} ({fmtMaybeNum(equity.trades_per_year, 2)}/yr)
                </Badge>
                <Badge variant="secondary">
                  Cost drag (final equity): {fmtMaybeNum(equity.cost_drag_final_equity, 3)}
                </Badge>
                <Badge variant="secondary">
                  Range: {equity.start} → {equity.end}
                </Badge>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 text-left">Series</th>
                      <th className="py-2 text-right">CAGR</th>
                      <th className="py-2 text-right">Sharpe</th>
                      <th className="py-2 text-right">Max DD</th>
                      <th className="py-2 text-right">Final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        { name: "Buy & Hold", s: equity.summaries.buy_hold },
                        { name: "Regime (gross)", s: equity.summaries.regime_gross },
                        { name: "Regime (net)", s: equity.summaries.regime_net },
                      ] as Array<{ name: string; s: EquitySummary }>
                    ).map((row) => (
                      <tr key={row.name} className="border-b">
                        <td className="py-2">{row.name}</td>
                        <td className="py-2 text-right">{fmtMaybePct(row.s.cagr)}</td>
                        <td className="py-2 text-right">{fmtMaybeNum(row.s.sharpe, 2)}</td>
                        <td className="py-2 text-right">{fmtMaybePct(row.s.max_drawdown)}</td>
                        <td className="py-2 text-right">{fmtMaybeNum(row.s.final_equity, 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equity.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickMargin={8} minTickGap={24} />
                    <YAxis tickMargin={8} />
                    <Tooltip />
                    <Line type="monotone" dataKey="bh" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="regime_gross" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="regime_net" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Series Charts */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading series…</div>
      ) : !hasRegime || !hasFeats ? (
        <div className="text-sm text-muted-foreground">No data returned.</div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Risk-off probability</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[380px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={regime}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickMargin={8} minTickGap={24} />
                    <YAxis yAxisId="p" domain={[0, 1]} tickMargin={8} />
                    {showZ ? <YAxis yAxisId="z" orientation="right" tickMargin={8} /> : null}

                    {/* highlight risk-off bands */}
                    {riskOffBands.map((b, i) => (
                      <ReferenceArea
                        key={i}
                        x1={b.x1}
                        x2={b.x2}
                        yAxisId="p"
                        y1={0}
                        y2={1}
                        ifOverflow="extendDomain"
                      />
                    ))}

                    <ReferenceLine yAxisId="p" y={stress} strokeDasharray="6 6" />

                    <Tooltip
                      labelFormatter={(label) => `Date: ${label}`}
                      formatter={(value, name) => {
                        if (name === "risk_off_prob") return [fmtProb(Number(value)), "risk_off_prob"]
                        if (name === "z_vol") return [Number(value).toFixed(3), "z_vol"]
                        return [String(value), String(name)]
                      }}
                    />

                    <Line
                      yAxisId="p"
                      type="monotone"
                      dataKey="risk_off_prob"
                      dot={false}
                      strokeWidth={2}
                    />
                    {showZ ? (
                      <Line yAxisId="z" type="monotone" dataKey="z_vol" dot={false} strokeWidth={2} />
                    ) : null}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">SPY close price</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={feats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickMargin={8} minTickGap={24} />
                    <YAxis tickMargin={8} />
                    <Tooltip
                      labelFormatter={(label) => `Date: ${label}`}
                      formatter={(value, name) => {
                        if (name === "close") return [fmtNum(Number(value)), "close"]
                        return [String(value), String(name)]
                      }}
                    />
                    <Line type="monotone" dataKey="close" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Drawdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={feats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickMargin={8} minTickGap={24} />
                    <YAxis tickMargin={8} />
                    <Tooltip
                      labelFormatter={(label) => `Date: ${label}`}
                      formatter={(value, name) => {
                        if (name === "drawdown") return [`${(Number(value) * 100).toFixed(2)}%`, "drawdown"]
                        return [String(value), String(name)]
                      }}
                    />
                    <ReferenceLine y={0} strokeDasharray="6 6" />
                    <Line type="monotone" dataKey="drawdown" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  )
}