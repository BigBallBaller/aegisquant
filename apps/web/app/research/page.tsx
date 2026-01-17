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

function fmtProb(x: number) {
  if (!Number.isFinite(x)) return "–"
  return x.toFixed(3)
}

export default function ResearchPage() {
  const [data, setData] = useState<RegimePoint[]>([])
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

        const res = await fetch(
          `http://localhost:8000/regime/series?symbol=SPY&limit=${limit}`,
          { cache: "no-store" }
        )

        if (!res.ok) throw new Error(`Failed to fetch regime series (${res.status})`)

        const json = await res.json()
        const rows = Array.isArray(json?.data) ? (json.data as RegimePoint[]) : []

        if (alive) setData(rows)
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

  const hasData = useMemo(() => data.length > 0, [data])
  const latest = useMemo(() => (data.length ? data[data.length - 1] : null), [data])

  const stress = 0.7

  return (
    <PageShell
      title="Research"
      badge={<Badge variant="secondary">Baseline Regime</Badge>}
      subtitle="Visualize regime probabilities generated from real features. Baseline model: rolling volatility z-score mapped through a sigmoid → risk-off probability."
    >
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base">Risk-off probability</CardTitle>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">
                Current risk-off: {latest ? fmtProb(latest.risk_off_prob) : "–"}
              </Badge>
              <Badge variant="outline">Stress threshold: {stress.toFixed(2)}</Badge>
            </div>
          </div>

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
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading regime series…</div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : !hasData ? (
            <div className="text-sm text-muted-foreground">No data returned.</div>
          ) : (
            <div className="h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickMargin={8} minTickGap={24} />

                  {/* Left axis for probability */}
                  <YAxis yAxisId="p" domain={[0, 1]} tickMargin={8} />

                  {/* Right axis for z_vol (only if showing) */}
                  {showZ ? <YAxis yAxisId="z" orientation="right" tickMargin={8} /> : null}

                  <ReferenceLine yAxisId="p" y={stress} strokeDasharray="6 6" />

                  <Tooltip
                    labelFormatter={(label) => `Date: ${label}`}
                    formatter={(value, name) => {
                      if (name === "risk_off_prob")
                        return [fmtProb(Number(value)), "risk_off_prob"]
                      if (name === "z_vol")
                        return [Number(value).toFixed(3), "z_vol"]
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
                    <Line
                      yAxisId="z"
                      type="monotone"
                      dataKey="z_vol"
                      dot={false}
                      strokeWidth={2}
                    />
                  ) : null}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}