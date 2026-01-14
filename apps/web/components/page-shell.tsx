import { ReactNode } from "react"

export function PageShell({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string
  subtitle?: string
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-6 py-10 space-y-8">
        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
            {badge}
          </div>
          {subtitle ? (
            <p className="text-base text-muted-foreground max-w-3xl leading-relaxed">
              {subtitle}
            </p>
          ) : null}
        </header>

        {children}
      </div>
    </main>
  )
}
