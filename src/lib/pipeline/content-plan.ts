// New draft's plan (v121's plan pane in the current dashboard, for pieces): the parts the draft is built in, in order,
// before it runs. They start as the template's sections (the structure picked, else the kind's usual shape), or the
// team's default for that kind of piece (ai_settings build_plans, the keys Marketing Generation's posts share); each
// part can be renamed, given what goes in it, moved, removed, and parts added; Save as our default keeps the plan for
// the team. What is sent is the plan: the template's sections. Pure: the form, the server and the tests use it.

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
type Row = Record<string, unknown>

/** A part of the plan (v121Step, for pieces): its key, its name and what goes in it. */
export type Step = { key: string; name: string; note: string; added: boolean }
/** At most twelve parts. */
export const PLAN_MAX = 12
export const NAME_MAX = 80
export const NOTE_MAX = 600

/**
 * The plan's key (v121Key): the kind of post (a paid ad by its own shape: a carousel and a video have parts of their
 * own), and the structure picked, when one is (a structure's plan is never the team's default).
 */
export function planKey(kind: string, type: string, cat: string, struct: string): string {
  const t = kind === 'adcopy' ? (cat === 'ad_carousel' || cat === 'ad_video' ? cat : 'ad') : type
  return 'piece:' + t + (struct ? ':tpl:' + struct : '')
}
export const isTplKey = (key: string) => key.includes(':tpl:')
const KEY = /^piece:[a-z_]{1,40}(:tpl:[\w:.-]{1,80})?$/

/** A part as kept, checked: a key, a name and a note no longer than the plan keeps. */
export function stepOf(s: unknown, i: number): Step {
  const o = s && typeof s === 'object' ? (s as Row) : {}
  return {
    key: str(o.key).trim().slice(0, 40) || 'part_' + (i + 1),
    name: str(o.name).slice(0, NAME_MAX),
    note: str(o.note).slice(0, NOTE_MAX),
    added: o.added === true,
  }
}

/** The parts as they come (v121Builtin): the template's sections, those with a title. */
export function builtinSteps(sections: readonly { title: string; guidance: string }[]): Step[] {
  return sections
    .map((s, i) => ({ key: 'part_' + (i + 1), name: str(s.title).slice(0, NAME_MAX), note: str(s.guidance).slice(0, NOTE_MAX), added: false }))
    .filter((s) => s.name.trim())
}

/** The team's default for a key (v121Team), unless a structure is picked; null when there is none. */
export function teamSteps(buildPlans: unknown, key: string): { steps: Step[]; by: string; at: string } | null {
  if (isTplKey(key)) return null
  const B = buildPlans && typeof buildPlans === 'object' ? (buildPlans as Row) : {}
  const P = B[key] && typeof B[key] === 'object' ? (B[key] as Row) : null
  if (!P || !Array.isArray(P.steps) || !P.steps.length) return null
  return { steps: P.steps.slice(0, PLAN_MAX).map(stepOf), by: str(P.by), at: str(P.at) }
}

/** Two plans with the same parts in the same order (v121Sig: their keys, names and notes). */
export const samePlan = (a: Step[], b: Step[]) =>
  a.length === b.length && a.every((s, i) => s.key === b[i].key && s.name === b[i].name && s.note === b[i].note)

/** The template's sections the plan sends (v121's nwCtTemplate wrapper): twelve at most, trimmed, the untitled left out. */
export function planSections(steps: Step[]): { title: string; guidance: string }[] {
  return steps
    .slice(0, PLAN_MAX)
    .map((s) => ({ title: str(s.name).trim().slice(0, NAME_MAX), guidance: str(s.note).trim().slice(0, 400) }))
    .filter((s) => s.title)
}

/** A part added (v121Add): the first free part_N key, named New part. */
export function addStep(steps: Step[]): Step[] {
  if (steps.length >= PLAN_MAX) return steps
  let n = steps.length + 1
  while (steps.some((s) => s.key === 'part_' + n)) n++
  return [...steps, { key: 'part_' + n, name: 'New part', note: '', added: true }]
}
/** A part moved up (-1) or down (1). */
export function moveStep(steps: Step[], i: number, d: -1 | 1): Step[] {
  const j = i + d
  if (i < 0 || j < 0 || i >= steps.length || j >= steps.length) return steps
  const out = steps.slice()
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}
export const removeStep = (steps: Step[], i: number) => steps.filter((_, j) => j !== i)
export const setStep = (steps: Step[], i: number, p: Partial<Pick<Step, 'name' | 'note'>>) =>
  steps.map((s, j) =>
    j === i ? { ...s, ...(p.name !== undefined ? { name: p.name.slice(0, NAME_MAX) } : {}), ...(p.note !== undefined ? { note: p.note.slice(0, NOTE_MAX) } : {}) } : s,
  )

/** The plan sent from the browser, checked: a key the form makes, and its parts. */
export function planFrom(input: unknown): { key: string; steps: Step[] } | null {
  const o = input && typeof input === 'object' ? (input as Row) : null
  if (!o || !KEY.test(str(o.key)) || !Array.isArray(o.steps)) return null
  return { key: str(o.key), steps: o.steps.slice(0, PLAN_MAX).map(stepOf) }
}

/**
 * The team's default as build_plans keeps it (v121SaveDef), so the current dashboard reads it too: each part with its
 * key, kind, name, what it does, its note, its questions and whether it was added, who saved it and when.
 */
export function savedPlan(steps: Step[], by: string, at: string): Row {
  return {
    steps: steps.slice(0, PLAN_MAX).map((s) => ({ key: s.key, kind: 'part', name: s.name, does: '', note: s.note, q: [], added: s.added })),
    by,
    at,
  }
}

/** One line under a part's name: what goes in it, else that nothing is set (v121Sum). */
export const stepSum = (s: Step) => {
  const t = str(s.note).replace(/\s+/g, ' ').trim()
  return t ? (t.length > 80 ? t.slice(0, 79).replace(/\s+\S*$/, '') + '…' : t) : 'Nothing set for this part yet'
}
