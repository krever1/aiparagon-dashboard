import 'server-only'
import { type CallMeta, type CallOutput, type FtCall, customTypes } from './calls'
import { callLeads, readCallRows } from './calls-load'
import { ftList } from './fathom'
import { type TaskCard, taskCards } from './tasks'

// Tasks' data, read as the signed-in teammate (renderTasks as v93 and v121 wrapped it): the post-call actions and what
// the team saved about each call, the team's call types, the Catalyst leads, and Fathom's newest calls for the people
// on each call. The current dashboard waits up to 4 seconds for Fathom, then shows the to-dos without it.

const FATHOM_WAIT_MS = 4000

export type TasksData = {
  cards: TaskCard[]
  /** the team's own call types (ai_settings call_types) */
  types: string[]
  /** every call's saved details, for Edit details' folder and tag suggestions */
  metas: CallMeta[]
  /** Fathom answered in time: the people and folders come from its list */
  fathom: boolean
  /** the post-call actions could not be read */
  error: string | null
}

/** Only what Tasks shows of a call and its actions goes to the browser. */
const slimCall = (c: FtCall): FtCall => ({ ...c, summary: '', actions: [] })
const slimOut = (o: CallOutput): CallOutput => ({ ...o, summary: [], deliverable: null, follow_up: null })

export async function loadTasks(): Promise<TasksData> {
  const [rows, calls, leads] = await Promise.all([
    readCallRows(),
    ftList(undefined, FATHOM_WAIT_MS).then(
      (r) => r.items,
      () => null,
    ),
    callLeads().catch(() => []),
  ])
  const cards = taskCards(rows.outputs, rows.meta, calls ?? [], leads).map((c) => ({ ...c, call: c.call && slimCall(c.call), out: slimOut(c.out) }))
  return {
    cards,
    types: customTypes(rows.settings.call_types),
    metas: Object.values(rows.meta),
    fathom: calls !== null,
    error: rows.error,
  }
}
