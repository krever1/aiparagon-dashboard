import { dayText } from '@/components/ui/local-date'

// Dates the Pipeline pages draw, in the viewer's own time zone once the page is in the browser (UTC before).

/** "20 to 21 Jul", "4 to 8 Oct", "30 Sep to 2 Oct", or one day (nwSpan). */
export function spanText(a: string, z: string | null, timeZone?: string): string {
  const da = new Date(a)
  if (Number.isNaN(da.getTime())) return ''
  if (!z || dayText(a, timeZone) === dayText(z, timeZone)) return dayText(a, timeZone)
  const dz = new Date(z)
  if (Number.isNaN(dz.getTime())) return dayText(a, timeZone)
  const parts = (d: Date) => {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(d)
    const g = (k: string) => p.find((x) => x.type === k)?.value ?? ''
    return { day: g('day'), month: g('month'), year: g('year') }
  }
  const pa = parts(da)
  const pz = parts(dz)
  const sameMonth = pa.month === pz.month && pa.year === pz.year
  return (sameMonth ? pa.day : dayText(a, timeZone)) + ' to ' + dayText(z, timeZone)
}
