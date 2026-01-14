import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PageShell } from "@/components/page-shell"

async function getJSON(url: string) {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`Failed: ${url}`)
  return res.json()
}

export default async function DataPage() {
  const status = await getJSON("http://localhost:8000/data/status?symbol=SPY")
  const quality = await getJSON("http://localhost:8000/data/quality?symbol=SPY")
  const features = await getJSON("http://localhost:8000/data/features/status?symbol=SPY")

  return (
    <PageShell
      title="Data"
      badge={<Badge variant="secondary">SPY</Badge>}
      subtitle="Frozen raw datasets, quality checks, and processed features used by the regime engine."
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Raw Dataset Status</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <div>
            Cached: <span className="text-foreground">{String(status.cached)}</span>
          </div>
          {status.cached && (
            <>
              <div>
                Rows: <span className="text-foreground">{status.rows}</span>
              </div>
              <div>
                Range: <span className="text-foreground">{status.start}</span> →{" "}
                <span className="text-foreground">{status.end}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quality Report</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <div>
            Duplicate dates: <span className="text-foreground">{quality.duplicate_dates}</span>
          </div>
          <div>
            Missing business days:{" "}
            <span className="text-foreground">{quality.missing_business_days_count}</span>
          </div>
          <div className="text-xs">
            Note: “missing business days” are expected market holidays/closures, not missing data.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feature Dataset Status</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <div>
            Cached: <span className="text-foreground">{String(features.cached)}</span>
          </div>
          {features.cached && (
            <>
              <div>
                Rows: <span className="text-foreground">{features.rows}</span>
              </div>
              <div>
                Range: <span className="text-foreground">{features.start}</span> →{" "}
                <span className="text-foreground">{features.end}</span>
              </div>
              <div>
                Columns: <span className="text-foreground">{features.columns.join(", ")}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}