"use client"

import { useEffect, useMemo, useState } from "react"
import { PageShell } from "@/components/page-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

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

  useEffect(() => {
    let alive = true

    async function run() {
      try {
        setLoading(true)
        setError(null)

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

        if (alive) {
          setRegime(rRows)
          setFeats(fRows)
        }
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

  const stress = 0.7

  return (
    <PageShell
      title="Research"
      badge={<Badge variant="secondary">Baseline Regime</Badge>}
      subtitle="Regime probabilities + market context on real SPY data. Baseline model: rolling volatility z-score mapped through a sigmoid → risk-off probability."
    >
      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap text-sm">
        <label className="flex items-center gap-2">
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

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={showZ}
            onChange={(e) => setShowZ(e.target.checked)}
          />
          <span className="text-muted-foreground">Show z_vol overlay</span>
        </label>

        <div className="flex items-center gap-2 flex-wrap ml-auto">
          <Badge variant="secondary">
            Current risk-off: {latest ? fmtProb(latest.risk_off_prob) : "–"}
          </Badge>
          <Badge variant="outline">Stress threshold: {stress.toFixed(2)}</Badge>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading series…</div>
      ) : error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : !hasRegime || !hasFeats ? (
        <div className="text-sm text-muted-foreground">No data returned.</div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {/* Regime chart */}
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

          {/* Price chart */}
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

          {/* Drawdown chart */}
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