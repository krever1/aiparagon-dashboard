// Tasks' post-call to-dos (apTkHtml as v121 redefined it): every call whose post-call actions are written and have next
// steps, open ones first, then the newest, 40 at most; the type buttons over them; and the calls filed in client
// folders, newest folder first. Pure: the page and the tests both use it.

import { type CallMeta, type CallOutput, type FtCall, type Guest, CAT_MAIN, catButtonsOf, catOf, folderOf, leadOf, peopleOf, typeOf } from './calls'

export const TASK_CARDS_MAX = 40

export type TaskCard = {
  /** the Fathom call id */
  id: string
  /** the call as Fathom lists it, or null when it is not on Fathom's first page (or Fathom did not answer in time) */
  call: FtCall | null
  meta: CallMeta | null
  out: CallOutput
  /** the title the team saved, else the one the post-call actions saved, else "Call" */
  title: string
  /** when the call started, else when its actions were written */
  when: string
  type: string
  cat: string
  folder: string
  people: Guest[]
}

/** How many of the next steps are not ticked off. */
export const openOf = (tasks: { done: boolean }[]) => tasks.filter((t) => !t.done).length

export function taskCards(
  outputs: Record<string, CallOutput>,
  meta: Record<string, CallMeta>,
  calls: FtCall[],
  leads: { emails: string[]; company: string }[],
): TaskCard[] {
  const byId = new Map(calls.map((c) => [c.id, c]))
  const when = (o: CallOutput) => o.call_start || o.created_at
  return Object.values(outputs)
    .filter((o) => o.status === 'done' && o.tasks.length > 0)
    .sort((a, b) => {
      const oa = openOf(a.tasks) > 0
      const ob = openOf(b.tasks) > 0
      if (oa !== ob) return oa ? -1 : 1
      return when(b).localeCompare(when(a))
    })
    .slice(0, TASK_CARDS_MAX)
    .map((o) => {
      const c = byId.get(o.call_id) ?? null
      const m = meta[o.call_id] ?? null
      const type = typeOf(m, o)
      // a Catalyst lead names the folder only for a call Fathom listed, as in the current dashboard
      const lead = c ? leadOf(c, m, leads) : null
      return {
        id: o.call_id,
        call: c,
        meta: m,
        out: o,
        title: m?.title || o.call_title || 'Call',
        when: when(o),
        type,
        cat: catOf(type),
        folder: folderOf(c, m, o, lead?.company ?? ''),
        people: peopleOf(c, m),
      }
    })
}

/** The type buttons over the to-dos. */
export const taskButtons = (cards: TaskCard[]) => catButtonsOf(cards.map((c) => c.cat))

/** The kind of call shown: a picked kind with nothing in it shows everything again, unless it is one of Erica's three. */
export function shownCat(cards: TaskCard[], picked: string): string {
  if (!picked || CAT_MAIN.includes(picked) || cards.some((c) => c.cat === picked)) return picked
  return ''
}

export type TaskFolder = { folder: string; cards: TaskCard[] }

/** The calls by client folder, the folder with the newest call first; each folder keeps the cards' order. */
export function taskFolders(cards: TaskCard[]): TaskFolder[] {
  const groups = new Map<string, TaskCard[]>()
  for (const c of cards) {
    const L = groups.get(c.folder)
    if (L) L.push(c)
    else groups.set(c.folder, [c])
  }
  const newest = (L: TaskCard[]) => L.map((c) => c.when).sort().pop() ?? ''
  return [...groups]
    .map(([folder, L]) => ({ folder, cards: L, newest: newest(L) }))
    .sort((a, b) => b.newest.localeCompare(a.newest))
    .map(({ folder, cards: L }) => ({ folder, cards: L }))
}
