"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Badge } from "@/components/ui/badge"

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/data", label: "Data" },
  { href: "/research", label: "Research" },
  { href: "/docs", label: "Docs" },
]

export function TopNav() {
  const pathname = usePathname()

  return (
    <div className="border-b">
      <div className="mx-auto w-full max-w-6xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            AegisQuant
          </Link>
          <Badge variant="secondary">Local</Badge>
        </div>

        <nav className="flex items-center gap-4 text-sm">
          {links.map((l) => {
            const active = pathname === l.href
            return (
              <Link
                key={l.href}
                href={l.href}
                className={
                  active
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }
              >
                {l.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
