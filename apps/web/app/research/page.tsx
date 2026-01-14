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
} from "recharts"

type RegimePoint = {
  date: string
  z_vol: number
  risk_off_prob: number
}

export default function ResearchPage() {
  const [data, setData] = useState<RegimePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true

    async function run() {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch(
          "http://localhost:8000/regime/series?symbol=SPY&limit=1500",
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
  }, [])

  const hasData = useMemo(() => data.length > 0, [data])

  return (
    <PageShell
      title="Research"
      badge={<Badge variant="secondary">Baseline Regime</Badge>}
      subtitle="Visualize regime probabilities generated from real features. This is the baseline model (volatility z-score → sigmoid probability)."
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Risk-off probability</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading regime series…</div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : !hasData ? (
            <div className="text-sm text-muted-foreground">No data returned.</div>
          ) : (
            <div className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickMargin={8} minTickGap={24} />
                  <YAxis domain={[0, 1]} tickMargin={8} />
                  <Tooltip />
                  <Line type="monotone" dataKey="risk_off_prob" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}