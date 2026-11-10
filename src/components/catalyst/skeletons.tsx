// What shows while a Catalyst page reads its data (the static shell of the page, drawn before the session is read).

function Bar({ w, h = 14 }: { w: string; h?: number }) {
  return <span className="block animate-pulse rounded-sm bg-line" style={{ width: w, height: h }} />
}

export function PipelineSkeleton({ label = 'Loading the lead pipeline…' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <div className="flex gap-2">
        {[90, 170, 100, 120].map((w) => (
          <span key={w} className="h-10 animate-pulse rounded-md bg-line" style={{ width: w }} />
        ))}
      </div>
      <span className="block h-10 w-full max-w-[760px] animate-pulse rounded-md bg-line" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2.5 rounded-md bg-[#e5e8ef] p-3">
            <Bar w="70%" />
            <span className="block h-24 animate-pulse rounded-[10px] bg-panel" />
          </div>
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  )
}

export function LeadSkeleton() {
  return (
    <div role="status" aria-label="Loading lead…" className="space-y-4">
      <Bar w="160px" h={12} />
      <Bar w="320px" h={34} />
      <Bar w="420px" />
      <span className="block h-12 w-full max-w-[900px] animate-pulse rounded-md bg-line" />
      <span className="block h-64 w-full animate-pulse rounded-lg bg-line" />
      <span className="sr-only">Loading lead…</span>
    </div>
  )
}

/** A card of rows: HubSpot contacts, Calls. */
export function ListSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3 rounded-lg border border-line bg-panel p-5">
      <div className="flex items-center gap-2.5">
        <Bar w="90px" h={16} />
        <Bar w="36px" h={16} />
        <span className="ml-auto block h-9 w-[240px] animate-pulse rounded-sm bg-line" />
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-t border-line pt-3">
          <span className="block h-5 w-5 animate-pulse rounded-full bg-line" />
          <div className="flex-1 space-y-1.5">
            <Bar w="38%" />
            <Bar w="24%" h={11} />
          </div>
          <Bar w="110px" h={28} />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  )
}
