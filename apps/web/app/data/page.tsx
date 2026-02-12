import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PageShell } from "@/components/page-shell"
import { getDataStatus, getDataQuality, getFeaturesStatus } from "../actions"

export default async function DataPage() {
  const status = await getDataStatus("SPY")
  const quality = status.cached ? await getDataQuality("SPY") : null
  const features = await getFeaturesStatus("SPY")

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

      {quality && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quality Report</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <div>
              Duplicate dates: <span className="text-foreground">{quality.duplicate_dates ?? 0}</span>
            </div>
            <div>
              Missing business days:{" "}
              <span className="text-foreground">{quality.missing_business_days_count ?? 0}</span>
            </div>
            <div className="text-xs">
              Note: "missing business days" are expected market holidays/closures, not missing data.
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feature Dataset Status</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <div>
            Cached: <span className="text-foreground">{String(features.cached)}</span>
          </div>
          {features.cached && "columns" in features && (
            <>
              <div>
                Rows: <span className="text-foreground">{features.rows}</span>
              </div>
              <div>
                Range: <span className="text-foreground">{features.start}</span> →{" "}
                <span className="text-foreground">{features.end}</span>
              </div>
              <div>
                Columns: <span className="text-foreground">{(features as { columns: string[] }).columns.join(", ")}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}
