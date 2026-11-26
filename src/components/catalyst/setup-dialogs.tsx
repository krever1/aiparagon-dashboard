'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Plus, X } from 'lucide-react'
import {
  type KbFile, type TypeInfo, bringBackStage, deleteMeetingType, deleteStage, hideMeetingType, saveMeetingType, saveStageSetup, saveStages, tickStage,
  typeInfo,
} from '@/app/(app)/lead-pipeline/setup-actions'
import { Dialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { type MeetingType, STAGE_COLORS, type StageRec, nameOf, newKey } from '@/lib/catalyst/setup'
import { STAGES, type Stage } from '@/lib/catalyst/stages'
import { type LeadView, viewStage } from '@/lib/catalyst/view'
import { plural } from './bits'

// The windows of Meeting Types and Client Stages (v145, with v146's fixes): Edit stages, a stage's setup, a meeting
// type's setup, and a lead's stage checklist.

const btn = 'inline-flex items-center gap-1.5 rounded-sm border border-line px-3.5 py-2 text-[14px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const ghost = 'rounded-sm px-3 py-2 text-[14px] font-semibold text-ink-2 hover:bg-sunk hover:text-ink disabled:opacity-60'
const primary =
  'inline-flex items-center gap-2 rounded-sm bg-action px-4 py-2 text-[14px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60'
const del = 'rounded-sm px-3 py-2 text-[14px] font-semibold text-bad hover:bg-bad-soft disabled:opacity-60'
const field = 'w-full min-w-0 max-w-full rounded-sm border border-line bg-panel px-3 py-2 text-[14.5px] text-ink focus:border-accent focus:outline-none disabled:bg-sunk disabled:text-ink-3'
const icon = 'grid h-8 w-8 shrink-0 place-items-center rounded-sm text-ink-2 hover:bg-sunk hover:text-ink'

type Msg = { text: string; bad?: boolean } | null

function Status({ msg }: { msg: Msg }) {
  return (
    <span role="status" aria-live="polite" className={`mr-auto text-[13.5px] ${msg?.bad ? 'text-bad' : 'text-ink-2'}`} data-testid="setup-msg">
      {msg?.text ?? ''}
    </span>
  )
}

function Area({ label, value, onChange, placeholder, help, disabled, rows = 3 }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  help?: string
  disabled?: boolean
  rows?: number
}) {
  return (
    <label className="mb-3 block min-w-0">
      <span className="block text-[13.5px] font-semibold text-ink">{label}</span>
      {help ? <small className="mb-1 block text-[12.5px] text-ink-3">{help}</small> : null}
      <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} className={field + ' mt-1 resize-y'} />
    </label>
  )
}

function Text({ label, value, onChange, placeholder, disabled, max = 60 }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  max?: number
}) {
  return (
    <label className="mb-3 block min-w-0">
      <span className="block text-[13.5px] font-semibold text-ink">{label}</span>
      <input type="text" maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} className={field + ' mt-1 h-10'} />
    </label>
  )
}

const fail = { ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.' }

// ---------- Edit stages ----------

type Row = { key: string; name: string; isNew?: boolean; type?: string; c: string; label: string }

/**
 * Client stages (v145StagesEdit): the board's columns for the whole team, in this order. Rename, move up or down, add
 * (with the meeting type it runs) and delete; removed built-in stages can be brought back. Delete and Bring back need
 * the changes saved first (v146), and Prospect research is always kept.
 */
export function StagesEdit({
  recs,
  types,
  leads,
  onClose,
}: {
  recs: StageRec[]
  types: MeetingType[]
  leads: LeadView[]
  onClose: () => void
}) {
  const own = types.filter((t) => t.custom && !t.hidden)
  const label = (r: StageRec) => {
    if (!r.custom) return 'Built in · ' + STAGES.find((s) => s.key === r.key)!.doc
    const t = types.find((x) => x.key === r.type)
    return r.type ? 'Runs ' + (t?.doc || 'its meeting type') : 'Runs nothing yet'
  }
  const start = recs.filter((r) => !r.removed).map((r): Row => ({ key: r.key, name: r.name, c: r.c, label: label(r) }))
  const opened = start.map((r) => r.key + '=' + r.name).join('|')
  const [rows, setRows] = useState<Row[]>(start)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<StageRec | null>(null)
  const removed = recs.filter((r) => r.removed)
  const dirty = () => rows.some((r) => r.isNew) || rows.map((r) => r.key + '=' + nameOf(r.name)).join('|') !== opened

  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    setRows(next)
  }
  const add = () => {
    const n = nameOf(newName)
    if (!n) return setMsg({ text: 'Give the stage a name first.', bad: true })
    if (rows.some((r) => nameOf(r.name).toLowerCase() === n.toLowerCase())) return setMsg({ text: 'There is already a stage called ' + n + '.', bad: true })
    const t = own.find((x) => x.key === newType)
    setRows([
      ...rows,
      { key: newKey('cs'), name: n, isNew: true, type: newType, c: STAGE_COLORS[rows.length % STAGE_COLORS.length], label: 'New · ' + (t ? 'runs ' + t.doc : 'runs nothing yet') },
    ])
    setNewName('')
    setMsg({ text: 'Added. Save changes to keep it.' })
  }
  const save = async () => {
    setBusy(true)
    setMsg({ text: 'Saving…' })
    const r = await saveStages({ rows: rows.map((x) => ({ key: x.key, name: x.name, isNew: x.isNew, type: x.type, c: x.c })) }).catch(() => fail)
    if (!r.ok) {
      setBusy(false)
      return setMsg({ text: r.error, bad: true })
    }
    onClose()
    toast(r.toast)
  }
  const askDelete = (k: string) => {
    if (dirty()) return setMsg({ text: 'Save your changes first, then delete a stage.', bad: true })
    const r = recs.find((x) => x.key === k)
    if (r) setDeleting(r)
  }
  const back = async (k: string) => {
    if (dirty()) return setMsg({ text: 'Save your changes first, then bring a stage back.', bad: true })
    setBusy(true)
    const r = await bringBackStage(k).catch(() => fail)
    setBusy(false)
    if (!r.ok) return setMsg({ text: r.error, bad: true })
    toast(r.toast)
  }

  if (deleting) return <DeleteStage rec={deleting} recs={recs} leads={leads} onBack={() => setDeleting(null)} />

  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Catalyst · Lead pipeline"
      title="Client stages"
      width={720}
      footer={
        <>
          <Status msg={msg} />
          <button
            type="button"
            className={ghost}
            onClick={() => setRows(rows.map((r) => ({ ...r, name: STAGES.find((s) => s.key === r.key)?.defaultName ?? r.name })))}
          >
            Use the usual names
          </button>
          <button type="button" className={btn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={busy} onClick={save}>
            <Check size={16} aria-hidden="true" />
            Save changes
          </button>
        </>
      }
    >
      <p className="mb-3 text-[14px] text-ink-2">
        The board’s columns, for the whole team, in this order. Click a stage’s name on the board to set up what it needs and what it runs.
      </p>
      <ul className="divide-y divide-line" data-testid="stage-rows">
        {rows.map((r, i) => (
          <li key={r.key} data-k={r.key} className="flex flex-wrap items-center gap-2 py-2 sm:flex-nowrap">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.c }} />
            <input
              type="text"
              aria-label={'Stage name: ' + (nameOf(r.name) || r.label)}
              value={r.name}
              maxLength={60}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              className={field + ' h-9 flex-[1_1_160px]'}
            />
            <span className="min-w-0 flex-[0_1_200px] truncate text-[12.5px] text-ink-3 max-sm:basis-full">{r.label}</span>
            <button type="button" className={icon} aria-label={'Move ' + r.name + ' up'} onClick={() => move(i, -1)}>
              <ArrowUp size={15} aria-hidden="true" />
            </button>
            <button type="button" className={icon} aria-label={'Move ' + r.name + ' down'} onClick={() => move(i, 1)}>
              <ArrowDown size={15} aria-hidden="true" />
            </button>
            {r.key === 'research' ? (
              <span className="whitespace-nowrap px-1.5 text-[12px] text-ink-3" title="New leads start here, so it stays. Rename it if you like.">
                Always kept
              </span>
            ) : (
              <button
                type="button"
                className={icon + ' text-bad hover:bg-bad-soft hover:text-bad'}
                aria-label={(r.isNew ? 'Remove ' : 'Delete ') + r.name}
                onClick={() => (r.isNew ? setRows(rows.filter((x) => x.key !== r.key)) : askDelete(r.key))}
              >
                <X size={15} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {removed.length ? (
        <details className="my-3 text-[13.5px]">
          <summary className="cursor-pointer font-semibold text-ink-2">Removed stages</summary>
          <ul className="mt-1 divide-y divide-line">
            {removed.map((r) => (
              <li key={r.key} data-k={r.key} className="flex items-center gap-2 py-2 opacity-80">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.c }} />
                <span className="min-w-0 flex-1 truncate text-ink">{r.name}</span>
                <span className="hidden truncate text-[12.5px] text-ink-3 sm:inline">{label(r)}</span>
                <button type="button" className={btn + ' py-1'} disabled={busy} onClick={() => back(r.key)}>
                  Bring back
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          maxLength={60}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
          placeholder="New stage, e.g. Strategy session"
          aria-label="New stage name"
          className={field + ' h-10 flex-[1_1_200px]'}
        />
        <select aria-label="Meeting type it runs" value={newType} onChange={(e) => setNewType(e.target.value)} className={field + ' h-10 w-auto flex-[0_1_220px]'}>
          <option value="">Runs nothing yet</option>
          {own.map((t) => (
            <option key={t.key} value={t.key}>
              Runs {t.doc}
            </option>
          ))}
        </select>
        <button type="button" className={btn} onClick={add}>
          <Plus size={15} aria-hidden="true" />
          Add stage
        </button>
      </div>
    </Dialog>
  )
}

/** Delete a stage (v145StageDelAsk): a stage with leads in it asks where they go first. */
function DeleteStage({ rec, recs, leads, onBack }: { rec: StageRec; recs: StageRec[]; leads: LeadView[]; onBack: () => void }) {
  const others = recs.filter((r) => !r.removed && r.key !== rec.key)
  const here = leads.filter((l) => viewStage(l) === rec.key)
  const [to, setTo] = useState(others[0]?.key ?? '')
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    const r = await deleteStage({ key: rec.key, to }).catch(() => fail)
    if (!r.ok) {
      setBusy(false)
      return setMsg({ text: r.error, bad: true })
    }
    toast(r.toast)
    onBack()
  }
  return (
    <Dialog
      open
      onClose={onBack}
      kicker="Catalyst · Client stages"
      title={'Delete ' + rec.name + '?'}
      width={560}
      footer={
        <>
          <Status msg={msg} />
          <button type="button" className={btn} onClick={onBack}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={busy} onClick={go}>
            Delete the stage
          </button>
        </>
      }
    >
      {here.length ? (
        <label className="block">
          <span className="mb-1.5 block text-[14.5px] text-ink">
            {plural(here.length, 'lead')} {here.length === 1 ? 'is' : 'are'} in {rec.name}. Move {here.length === 1 ? 'it' : 'them'} to:
          </span>
          <select aria-label="Move its leads to" value={to} onChange={(e) => setTo(e.target.value)} className={field + ' h-10'}>
            {others.map((x) => (
              <option key={x.key} value={x.key}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-[14.5px] text-ink">No leads are in it.</p>
      )}
      {rec.custom ? null : (
        <p className="mt-3 text-[13.5px] text-ink-3">A built-in stage can be brought back later under Removed stages. Its documents stay on each lead.</p>
      )}
    </Dialog>
  )
}

// ---------- a stage's setup ----------

/** A stage's setup (v145StageOpen): what it is, what it runs, what it needs, before and after, its checklists. */
export function StageSetup({ rec, types, onClose }: { rec: StageRec; types: MeetingType[]; onClose: () => void }) {
  const b = STAGES.find((s) => s.key === rec.key) ?? null
  const shown = types.filter((t) => !t.hidden)
  const own = shown.filter((t) => t.custom)
  const [v, setV] = useState({
    name: rec.name,
    desc: rec.desc,
    type: rec.type,
    also: rec.also,
    inputs: rec.inputs,
    before: rec.before,
    after: rec.after,
    template: rec.template,
    deliverables: rec.deliverables.join('\n'),
    tasks: rec.tasks.join('\n'),
  })
  const set = (k: keyof typeof v) => (x: string) => setV({ ...v, [k]: x })
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!nameOf(v.name)) return setMsg({ text: 'Give the stage a name.', bad: true })
    setBusy(true)
    setMsg({ text: 'Saving…' })
    const r = await saveStageSetup(rec.key, v).catch(() => fail)
    if (!r.ok) {
      setBusy(false)
      return setMsg({ text: r.error, bad: true })
    }
    onClose()
    toast(r.toast)
  }
  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Catalyst · Client stage"
      title={rec.name}
      width={680}
      footer={
        <>
          <Status msg={msg} />
          <button type="button" className={btn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={busy} onClick={save}>
            <Check size={16} aria-hidden="true" />
            Save
          </button>
        </>
      }
    >
      <Text label="Name" value={v.name} onChange={set('name')} />
      <Area label="Description" value={v.desc} onChange={set('desc')} placeholder="What this stage is for, and when a client is in it." />
      <div className="mb-3">
        <span className="block text-[13.5px] font-semibold text-ink">Meeting type it runs</span>
        <small className="mb-1 block text-[12.5px] text-ink-3">Runs when a lead moves into this stage, after the team says so.</small>
        {b ? (
          <p className="rounded-sm bg-sunk px-3 py-1.5 text-[13.5px] text-ink">{b.doc} (built in)</p>
        ) : (
          <>
            <select aria-label="Meeting type it runs" value={v.type} onChange={(e) => set('type')(e.target.value)} className={field + ' h-10'}>
              <option value="">Nothing</option>
              {own.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.doc} · {t.name}
                </option>
              ))}
            </select>
            {own.length ? null : <small className="mt-1 block text-[12.5px] text-ink-3">Add a meeting type of your own on the Catalyst Overview, then pick it here.</small>}
          </>
        )}
      </div>
      <fieldset className="mb-3 min-w-0">
        <legend className="text-[13.5px] font-semibold text-ink">Other meeting types in this stage</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 text-[13.5px]">
          {shown
            .filter((t) => t.key !== v.type)
            .map((t) => (
              <label key={t.key} className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={v.also.includes(t.key)}
                  onChange={(e) => setV({ ...v, also: e.target.checked ? [...v.also, t.key] : v.also.filter((x) => x !== t.key) })}
                />
                {t.name}
              </label>
            ))}
        </div>
      </fieldset>
      <Area
        label="Inputs required"
        value={v.inputs}
        onChange={set('inputs')}
        placeholder="e.g. Signed proposal, kickoff date, the client’s main contact"
        help="Shown when a lead moves in, so the team has them ready."
      />
      <Area label="Before this stage" value={v.before} onChange={set('before')} placeholder="What to do or run before the meeting" />
      <Area label="After this stage" value={v.after} onChange={set('after')} placeholder="Follow-up: what to send, run or decide after it" />
      {b && b.agent !== 'meeting_prep' ? null : (
        <Area
          label="Output template"
          value={v.template}
          onChange={set('template')}
          placeholder="One section per line"
          help="The sections its prep follows. Leave it empty to use the meeting type’s."
        />
      )}
      <Area label="Deliverables" value={v.deliverables} onChange={set('deliverables')} placeholder="One per line, e.g. Signed SOW" help="A checklist on each lead in this stage." />
      <Area label="Workflow tasks" value={v.tasks} onChange={set('tasks')} placeholder="One per line, e.g. Send the welcome email" help="A checklist on each lead in this stage." />
      {b ? <p className="text-[13px] text-ink-3">What it reads and its template document are on Atlas › Templates, under this stage.</p> : null}
    </Dialog>
  )
}

// ---------- a meeting type's setup ----------

/**
 * A meeting type (v145TypeOpen, v146): its name, what it writes, what it is for, its sections, what it reads and its
 * knowledge base context. A built-in type is named as its stage is and can be hidden; one of the team's own can be
 * deleted. `type` null adds a new one.
 */
export function TypeSetup({ type, usedBy = [], onClose }: { type: MeetingType | null; usedBy?: string[]; onClose: () => void }) {
  const t: MeetingType = type ?? { key: '', custom: true, name: '', doc: '', desc: '', sections: [], kb: '', kbFiles: [], hidden: false }
  const [info, setInfo] = useState<TypeInfo | null>(null)
  const [v, setV] = useState({ name: t.name, doc: t.doc, desc: t.desc, sections: t.sections.join('\n'), kb: t.kb })
  const [files, setFiles] = useState<string[]>(t.kbFiles)
  const [reads, setReads] = useState<TypeInfo['reads'] | null>(null)
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof v) => (x: string) => setV({ ...v, [k]: x })

  useEffect(() => {
    let live = true
    typeInfo(t.key)
      .then((r) => {
        if (!live) return
        const i = r.ok ? r.info : { files: [] as KbFile[], reads: { calls: true, crm: true, emails: true } }
        setInfo(i)
        setReads(i.reads)
      })
      .catch(() => live && setInfo({ files: [], reads: { calls: true, crm: true, emails: true } }))
    return () => {
      live = false
    }
  }, [t.key])

  const done = (r: Awaited<ReturnType<typeof saveMeetingType>>) => {
    if (!r.ok) {
      setBusy(false)
      return setMsg({ text: r.error, bad: true })
    }
    onClose()
    toast(r.toast)
  }
  const save = async () => {
    setBusy(true)
    setMsg({ text: 'Saving…' })
    const r = await saveMeetingType(t.key, {
      ...v,
      kbFiles: files.filter((f) => (info?.files ?? []).some((x) => x.id === f)),
      shown: (info?.files ?? []).map((f) => f.id),
      reads: t.key === 'research' ? null : reads,
    }).catch(() => fail)
    done(r)
  }
  const hide = async () => {
    setBusy(true)
    done(await hideMeetingType(t.key, !t.hidden).catch(() => fail))
  }
  const remove = async () => {
    const using = usedBy.length ? ' ' + usedBy.join(', ') + ' will run nothing until you pick another.' : ''
    if (!window.confirm('Delete this meeting type?' + using + ' Documents it wrote stay on each lead.')) return
    setBusy(true)
    done(await deleteMeetingType(t.key).catch(() => fail))
  }

  return (
    <Dialog
      open
      onClose={onClose}
      kicker={'Catalyst · Meeting type' + (t.custom ? '' : ' · built in')}
      title={t.key ? t.name : 'New meeting type'}
      width={680}
      footer={
        <>
          {t.key ? (
            t.custom ? (
              <button type="button" className={del} disabled={busy} onClick={remove}>
                Delete
              </button>
            ) : (
              <button type="button" className={ghost} disabled={busy} onClick={hide}>
                {t.hidden ? 'Show it again' : 'Hide it'}
              </button>
            )
          ) : null}
          <Status msg={msg} />
          <button type="button" className={btn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={busy} onClick={save}>
            <Check size={16} aria-hidden="true" />
            {t.key ? 'Save' : 'Add meeting type'}
          </button>
        </>
      }
    >
      <Text label="Meeting name" value={v.name} onChange={set('name')} placeholder="e.g. Strategy session" />
      <Text label="What it writes" value={v.doc} onChange={set('doc')} placeholder="e.g. Strategy session brief" disabled={!t.custom} />
      <Area label="Description" value={v.desc} onChange={set('desc')} placeholder="What the meeting is for, and what the prep should help the team do." />
      {t.custom ? (
        <Area
          label="Output template"
          value={v.sections}
          onChange={set('sections')}
          placeholder="One section per line, e.g. Purpose of the meeting"
          help="The sections it writes, in order. Empty: purpose, what we know, what changed, questions, what to decide."
        />
      ) : (
        <div className="mb-3">
          <span className="block text-[13.5px] font-semibold text-ink">Output template</span>
          <small className="mb-1 block text-[12.5px] text-ink-3">Its sections, from its template on Atlas › Templates:</small>
          <p className="rounded-sm bg-sunk px-3 py-1.5 text-[13.5px] text-ink">{t.sections.join(' · ') || 'Its own sections'}</p>
        </div>
      )}
      <fieldset className="mb-3 min-w-0">
        <legend className="text-[13.5px] font-semibold text-ink">What it reads</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 text-[13.5px]">
          {t.key === 'research' ? (
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked disabled readOnly /> The CRM record
            </label>
          ) : (
            (
              [
                ['calls', 'Call transcripts'],
                ['crm', 'The CRM record'],
                ['emails', 'Emails in HubSpot'],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="inline-flex items-center gap-1.5">
                <input type="checkbox" disabled={!reads} checked={!!reads?.[k]} onChange={(e) => reads && setReads({ ...reads, [k]: e.target.checked })} /> {l}
              </label>
            ))
          )}
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked disabled readOnly /> The lead’s documents so far
          </label>
        </div>
      </fieldset>
      <Area
        label="Knowledge base context"
        value={v.kb}
        onChange={set('kb')}
        placeholder="What Catalyst should know for this meeting: your approach, offers, rules of thumb"
        help="Sent with every run of this meeting type."
      />
      {info?.files.length ? (
        <fieldset className="min-w-0">
          <legend className="text-[13.5px] font-semibold text-ink">Knowledge base files to include</legend>
          <small className="block text-[12.5px] text-ink-3">Up to 6. Their text goes with the run, shortened if long.</small>
          <div className="mt-1 flex max-h-[150px] flex-wrap gap-x-4 gap-y-1.5 overflow-auto text-[13.5px]" data-testid="kb-files">
            {info.files.map((f) => (
              <label key={f.id} className="inline-flex min-w-0 items-center gap-1.5 [overflow-wrap:anywhere]">
                <input
                  type="checkbox"
                  checked={files.includes(f.id)}
                  onChange={(e) => {
                    if (e.target.checked && files.length >= 6) return setMsg({ text: 'Up to 6 files.', bad: true })
                    setFiles(e.target.checked ? [...files, f.id] : files.filter((x) => x !== f.id))
                  }}
                />{' '}
                {f.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </Dialog>
  )
}

// ---------- a lead's stage checklist ----------

/**
 * This stage, on a lead's page (v145StageHtml): what it is, the inputs, before and after, and the deliverables and
 * workflow tasks as checklists, ticked per lead for the team. Nothing when the stage has none of these.
 */
export function StageChecklist({
  rec,
  email,
  ticks,
  onSetup,
}: {
  rec: StageRec | null
  email: string
  ticks: Record<string, boolean>
  onSetup: () => void
}) {
  const [tk, setTk] = useState(ticks)
  if (!rec || (!rec.deliverables.length && !rec.tasks.length && !rec.inputs && !rec.before && !rec.after)) return null
  const tick = async (id: string, on: boolean) => {
    setTk({ ...tk, [id]: on })
    const r = await tickStage({ email, stage: rec.key, id, on }).catch(() => fail)
    if (!r.ok) {
      setTk((x) => ({ ...x, [id]: !on }))
      toast('Could not save the tick: ' + r.error, 'warn')
    }
  }
  const list = (arr: string[], p: string, label: string) =>
    arr.length ? (
      <>
        <h3 className="mb-1 mt-3 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</h3>
        <ul className="space-y-1">
          {arr.map((x, i) => {
            const id = p + ':' + i
            return (
              <li key={id}>
                <label className="flex cursor-pointer items-start gap-2 text-[14px] text-ink">
                  <input type="checkbox" className="mt-1" checked={!!tk[id]} onChange={(e) => tick(id, e.target.checked)} /> <span className="[overflow-wrap:anywhere]">{x}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </>
    ) : null
  return (
    <section aria-labelledby="this-stage" className="mb-4 rounded-lg border border-line bg-panel p-5 shadow-card" data-testid="stage-checklist">
      <h2 id="this-stage" className="flex flex-wrap items-center gap-3 font-display text-[21px] font-semibold text-ink">
        <span className="[overflow-wrap:anywhere]">This stage: {rec.name}</span>
        <button type="button" onClick={onSetup} className="rounded-sm border border-line bg-panel px-3 py-1 font-sans text-[13px] font-semibold text-ink hover:border-line-2">
          Stage setup
        </button>
      </h2>
      <div className="mt-2 space-y-1.5 text-[14px] text-ink-2 [overflow-wrap:anywhere]">
        {rec.desc ? <p>{rec.desc}</p> : null}
        {rec.inputs ? (
          <p>
            <b className="text-ink">Inputs required</b> {rec.inputs}
          </p>
        ) : null}
        {rec.before ? (
          <p>
            <b className="text-ink">Before</b> {rec.before}
          </p>
        ) : null}
        {rec.after ? (
          <p>
            <b className="text-ink">After</b> {rec.after}
          </p>
        ) : null}
      </div>
      {list(rec.deliverables, 'd', 'Deliverables')}
      {list(rec.tasks, 't', 'Workflow tasks')}
    </section>
  )
}

/** What a stage asks to have ready, in the board's question (v145's v136Ask wrapper). */
export function StageNeeds({ rec }: { rec: StageRec | null | undefined }) {
  if (!rec || !(rec.inputs || rec.before || rec.deliverables.length || rec.tasks.length)) return null
  return (
    <div className="mb-3 space-y-1 rounded-md bg-sunk px-3.5 py-2.5 text-[13.5px] text-ink-2 [overflow-wrap:anywhere]" data-testid="stage-needs">
      {rec.inputs ? (
        <p>
          <b className="text-ink">Have these ready</b> {rec.inputs}
        </p>
      ) : null}
      {rec.before ? (
        <p>
          <b className="text-ink">Before this stage</b> {rec.before}
        </p>
      ) : null}
      {rec.deliverables.length ? (
        <p>
          <b className="text-ink">Deliverables</b> {rec.deliverables.join(' · ')}
        </p>
      ) : null}
      {rec.tasks.length ? (
        <p>
          <b className="text-ink">Workflow tasks</b> {rec.tasks.join(' · ')}
        </p>
      ) : null}
    </div>
  )
}

/** Whether a stage only moves (a stage of the team's own with no meeting type). */
export const onlyMoves = (st: Pick<Stage, 'norun'> | undefined) => !!st?.norun
