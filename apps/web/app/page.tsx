import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getMetricsSummary } from "./actions"

export default async function Page() {
  const s = await getMetricsSummary()

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl p-6 space-y-6">
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">AegisQuant</h1>
            <Badge variant="secondary">Regime + Allocation</Badge>
          </div>
          <p className="text-muted-foreground">
            Probabilistic regime inference and uncertainty-aware allocation on real market data.
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">CAGR</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {(s.cagr * 100).toFixed(1)}%
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Sharpe</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {Number(s.sharpe).toFixed(2)}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Max Drawdown</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {(s.max_drawdown * 100).toFixed(1)}%
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Data: {s.symbol} • Updated: {s.updated_at}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
