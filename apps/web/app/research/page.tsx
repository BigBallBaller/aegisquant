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

function fmtProb(x: number) {
  if (!Number.isFinite(x)) return "–"
  return x.toFixed(3)
}

function fmtNum(x: number) {
  if (!Number.isFinite(x)) return "–"
  return x.toFixed(2)
}

function fmtPct(x: number) {
  if (!Number.isFinite(x)) return "–"
  return `${(x * 100).toFixed(2)}%`
}

export default function ResearchPage() {
  const [regime, setRegime] = useState<RegimePoint[]>([])
  const [feats, setFeats] = useState<FeaturePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // controls
  const [limit, setLimit] = useState<number>(1500)
  const [showZ, setShowZ] = useState<boolean>(false)

  // experiment params
  const [zWindow, setZWindow] = useState<number>(252)
  const [k, setK] = useState<number>(1.25)
  const [stress, setStress] = useState<number>(0.7)
  const [running, setRunning] = useState<boolean>(false)

  async function fetchSeries() {
    const [rRes, fRes] = await Promise.all([
      fetch(`http://localhost:8000/regime/series?symbol=SPY&limit=${limit}`, { cache: "no-store" }),
      fetch(`http://localhost:8000/features/series?symbol=SPY&limit=${limit}`, { cache: "no-store" }),
    ])

    if (!rRes.ok) throw new Error(`Failed to fetch regime series (${rRes.status})`)
    if (!fRes.ok) throw new Error(`Failed to fetch features series (${fRes.status})`)

    const rJson = await rRes.json()
    const fJson = await fRes.json()

    const rRows = Array.isArray(rJson?.data) ? (rJson.data as RegimePoint[]) : []
    const fRows = Array.isArray(fJson?.data) ? (fJson.data as FeaturePoint[]) : []

    setRegime(rRows)
    setFeats(fRows)
  }

  useEffect(() => {
    let alive = true

    async function run() {
      try {
        setLoading(true)
        setError(null)
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
  }, [limit])

  const hasRegime = useMemo(() => regime.length > 0, [regime])
  const hasFeats = useMemo(() => feats.length > 0, [feats])
  const latest = useMemo(() => (regime.length ? regime[regime.length - 1] : null), [regime])

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

  return (
    <PageShell
      title="Research"
      badge={<Badge variant="secondary">Baseline Regime</Badge>}
      subtitle="Run baseline regime experiments and visualize regime probabilities alongside price and drawdown."
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
              <span className="text-muted-foreground">stress threshold</span>
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
              <div className="h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={regime}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickMargin={8} minTickGap={24} />
                    <YAxis yAxisId="p" domain={[0, 1]} tickMargin={8} />
                    {showZ ? <YAxis yAxisId="z" orientation="right" tickMargin={8} /> : null}

                    <ReferenceLine yAxisId="p" y={stress} strokeDasharray="6 6" />

                    <Tooltip
                      labelFormatter={(label) => `Date: ${label}`}
                      formatter={(value, name) => {
                        if (name === "risk_off_prob") return [fmtProb(Number(value)), "risk_off_prob"]
                        if (name === "z_vol") return [Number(value).toFixed(3), "z_vol"]
                        return [String(value), String(name)]
                      }}
                    />

                    <Line yAxisId="p" type="monotone" dataKey="risk_off_prob" dot={false} strokeWidth={2} />
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
                        if (name === "drawdown") return [fmtPct(Number(value)), "drawdown"]
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