"use client"

import { useMemo } from "react"
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

import { Badge } from "@/components/ui/badge"

type RegimePoint = {
  date: string
  z_vol?: number
  risk_off_prob: number
}

function fmtProb(x: number) {
  if (!Number.isFinite(x)) return "–"
  return x.toFixed(3)
}

export function RegimeChart({ data }: { data: RegimePoint[] }) {
  const latest = useMemo(() => {
    if (!data || data.length === 0) return null
    return data[data.length - 1]
  }, [data])

  const current = latest?.risk_off_prob
  const stress = 0.7

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          Current risk-off: {current == null ? "–" : fmtProb(current)}
        </Badge>
        <Badge variant="outline">Stress threshold: {stress.toFixed(2)}</Badge>
      </div>

      <div className="h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickMargin={8} minTickGap={24} />
            <YAxis domain={[0, 1]} tickMargin={8} />

            <ReferenceLine y={stress} strokeDasharray="6 6" />

            <Tooltip
              labelFormatter={(label) => `Date: ${label}`}
              formatter={(value, name) => {
                if (name === "risk_off_prob") return [fmtProb(Number(value)), "risk_off_prob"]
                if (name === "z_vol") return [Number(value).toFixed(3), "z_vol"]
                return [String(value), String(name)]
              }}
            />

            <Line type="monotone" dataKey="risk_off_prob" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}