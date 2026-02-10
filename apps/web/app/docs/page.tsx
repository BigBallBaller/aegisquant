import { PageShell } from "@/components/page-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function DocsPage() {
  return (
    <PageShell
      title="Docs"
      badge={<Badge variant="secondary">How to use AegisQuant</Badge>}
      subtitle="A quick guide to what you are looking at, what the signal means, and how to run experiments locally."
    >
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What is AegisQuant?</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-6">
            AegisQuant is a quantitative research platform for probabilistic market regime inference on real price data.
            It focuses on uncertainty and risk regimes rather than point price prediction.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">What does “risk-off probability” mean?</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-6">
            Risk-off probability is a continuous value from 0 to 1. Higher values indicate market conditions consistent with
            elevated stress. The baseline model uses rolling volatility (vol_20), converts it into a rolling z-score over a
            window (z_window), then maps it through a sigmoid (k controls sensitivity).
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">How to run locally (copy/paste)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-6">
            <div className="font-mono text-xs whitespace-pre-wrap rounded-md border p-3 bg-background">
{`# Terminal 1 (API)
cd ~/aegisquant/apps/api
source .venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2 (Web)
cd ~/aegisquant/apps/web
npm run dev`}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">How to run an experiment</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-6">
            Go to Research. Adjust z_window, k, and the stress threshold. Click Run baseline. The model reruns and the charts
            refresh. Use the table to compare risk-on vs risk-off behavior using next-day returns.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Interpretation</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-6">
            If the model is useful, risk-off periods should show higher volatility and worse forward returns than risk-on periods.
            This is not a trading strategy by itself. It is a regime signal designed to be evaluated, compared, and improved.
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}