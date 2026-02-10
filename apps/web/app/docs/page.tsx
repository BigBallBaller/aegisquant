import { PageShell } from "@/components/page-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function DocsPage() {
  return (
    <PageShell
      title="Documentation"
      badge={<Badge variant="secondary">AegisQuant</Badge>}
      subtitle="What this system does, how it works, and how to use it."
    >
      <div className="space-y-6">

        <Card>
          <CardHeader>
            <CardTitle>What is AegisQuant?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              AegisQuant is a quantitative research system designed to study market
              regimes using real price data and probabilistic signals.
            </p>
            <p>
              Instead of predicting prices directly, AegisQuant focuses on identifying
              periods of elevated risk and measuring how strategy performance changes
              across regimes.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Core Idea</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Markets behave differently under different volatility and risk conditions.
              AegisQuant models this by:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Engineering volatility, momentum, and drawdown features</li>
              <li>Transforming those features into regime probabilities</li>
              <li>Evaluating performance conditional on regime state</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Regime Model (Baseline)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              The baseline regime model uses a volatility z-score transformed through
              a sigmoid function to estimate a daily probability of a risk-off regime.
            </p>
            <p>
              A threshold (e.g. 0.7) separates risk-on and risk-off states, allowing
              performance metrics to be computed conditionally.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="list-disc pl-6 space-y-1">
              <li>Daily OHLCV data pulled from Yahoo Finance</li>
              <li>Raw data stored immutably as parquet files</li>
              <li>Derived features cached separately for reproducibility</li>
              <li>All downstream models read from frozen datasets</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Using the System</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              The API exposes endpoints for data ingestion, feature inspection,
              regime inference, and regime-conditioned statistics.
            </p>
            <p>
              The Research page visualizes regime probabilities over time and
              summarizes how risk characteristics change across regimes.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Limitations & Future Work</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="list-disc pl-6 space-y-1">
              <li>Baseline model is intentionally simple</li>
              <li>Future models may include HMMs or Bayesian changepoints</li>
              <li>Multi-asset and allocation layers are planned extensions</li>
            </ul>
          </CardContent>
        </Card>

      </div>
    </PageShell>
  )
}