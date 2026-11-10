// A HubSpot contact's name, as the current dashboard puts it together (apHsName): "Jane" + "Doe", never
// "Jane Doe Doe" when HubSpot holds the whole name in the first name too.

export function hsName(first: unknown, last: unknown): string {
  const f = String(first ?? '').trim()
  const l = String(last ?? '').trim()
  if (!l) return f
  if (!f) return l
  const fl = f.toLowerCase()
  const ll = l.toLowerCase()
  if (fl === ll || fl.endsWith(' ' + ll)) return f
  return f + ' ' + l
}
