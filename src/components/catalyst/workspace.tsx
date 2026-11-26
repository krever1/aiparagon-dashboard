'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckSquare, LayoutGrid, Pencil, Plus, Star, Upload } from 'lucide-react'
import type { LeadCallRow } from '@/app/(app)/lead-pipeline/actions'
import { finishUpload, indexFile, startUpload } from '@/app/(app)/lead-pipeline/file-actions'
import { wsAsanaMark, wsDelete, wsEdit, wsMove, wsNewFolder, wsNotionMark, wsStar } from '@/app/(app)/lead-pipeline/ws-actions'
import { notionDatabases } from '@/app/(app)/tasks/actions'
import { AsanaDialog } from '@/components/tasks/asana-send'
import { NotionDialog, entryTitle } from '@/components/tasks/notion-send'
import { Dialog } from '@/components/ui/dialog'
import { LocalDay, usDateText, useHydrated } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { SUPABASE_ANON_KEY } from '@/lib/config'
import { MAX_UPLOAD } from '@/lib/catalyst/files'
import type { LeadPageData } from '@/lib/catalyst/lead-page'
import { type LeadTab, safeUrl, viewStage } from '@/lib/catalyst/view'
import {
  type WsFolder, type WsItem, type WsMeta, asanaNotes, kindWord, pickedOf, sendTitle, wsCalls, wsFiles, wsFolders, wsShown,
} from '@/lib/catalyst/workspace'
import { plural } from './bits'

type Found = Extract<LeadPageData, { found: true }>
type Msg = { text: string; bad?: boolean } | null

const btn = 'inline-flex items-center gap-1.5 rounded-sm border border-line bg-panel px-3 py-1.5 text-[13.5px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const primary =
  'inline-flex items-center gap-1.5 rounded-sm bg-action px-3 py-1.5 text-[13.5px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60'
const field = 'w-full min-w-0 max-w-full rounded-sm border border-line bg-panel px-3 py-2 text-[14px] text-ink focus:border-accent focus:outline-none'
const icon = 'grid h-8 w-8 shrink-0 place-items-center rounded-sm text-ink-2 hover:bg-sunk hover:text-ink'
const fmtCls = 'rounded-[6px] border border-line px-1.5 text-[11.5px] text-ink hover:bg-sunk'
const fail = { ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.' }

/** A call's date, as a small calendar page: the month and the day, in the viewer's zone once the page is in it. */
function DateBlock({ at }: { at: string }) {
  const h = useHydrated()
  const d = new Date(at)
  const ok = !Number.isNaN(d.getTime())
  const tz = h ? undefined : 'UTC'
  return (
    <span aria-hidden="true" className="flex h-10 w-9 shrink-0 flex-col items-center justify-center rounded-md bg-sunk">
      <small className="text-[9px] uppercase text-ink-3">{ok ? d.toLocaleDateString('en-US', { month: 'short', timeZone: tz }) : ''}</small>
      <b className="text-[15px] leading-none text-ink">{ok ? d.toLocaleDateString('en-US', { day: 'numeric', timeZone: tz }) : ''}</b>
    </span>
  )
}

/**
 * The client workspace (v145, Erica's design; v146's fixes): the lead's Files tab, with Files and Calls side by side,
 * folders on the left (All content, Starred, To organize, a folder per client stage and the team's own), stage folder
 * cards, search, a type filter, a sort and a grid. Each item can be starred, moved, renamed and described; uploads can
 * be deleted. Upload file adds a file or a pasted transcript, with a name, a folder and a description, and whether the
 * stage runs read it. Select (v151) picks items, and the bar sends them to Asana (a task each) or Notion (an entry each),
 * named for the item and the client; what went where shows on each row (In Asana · <project>, In Notion · <database>).
 */
export function Workspace({
  data,
  calls,
  onCalls,
  onTab,
}: {
  data: Found
  calls: { rows: LeadCallRow[]; error: string } | null
  onCalls: () => void
  onTab: (t: LeadTab) => void
}) {
  const { lead, stages } = data
  const [meta, setMeta] = useState<WsMeta>(data.ws)
  // the server's newer copy wins when it comes (after an upload, a delete, a refresh)
  const [seen, setSeen] = useState(data.ws)
  if (seen !== data.ws) {
    setSeen(data.ws)
    setMeta(data.ws)
  }
  const [view, setView] = useState<'files' | 'calls'>('files')
  const [folder, setFolder] = useState('all')
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [sort, setSort] = useState('new')
  const [grid, setGrid] = useState(false)
  const [edit, setEdit] = useState<WsItem | null>(null)
  const [newFolder, setNewFolder] = useState(false)
  const [upload, setUpload] = useState(false)
  // Select (v151): picking items to send, the ones picked, and the items in the Send to Notion and Send to Asana windows
  const [pick, setPick] = useState(false)
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [notion, setNotion] = useState<WsItem[] | null>(null)
  const [asana, setAsana] = useState<WsItem[] | null>(null)
  const hydrated = useHydrated()

  const folders = useMemo(() => wsFolders(stages, meta), [stages, meta])
  const files = useMemo(
    () =>
      wsFiles({
        docs: data.docs.map((d) => ({ agent: d.agent, label: d.label, done: d.done, at: d.at, url: safeUrl(d.url), documentId: d.documentId, gammaDocUrl: safeUrl(d.gammaDocUrl) })),
        prep: Object.values(data.prep)
          .filter((p): p is NonNullable<typeof p> => !!p)
          .map((p) => ({ key: p.key, at: p.at })),
        uploads: data.files.rows
          .filter((f) => f.source === 'upload')
          .map((f) => ({ id: f.id, name: f.name, url: safeUrl(f.url), stage: f.stage, note: f.note, by: f.by, at: f.at, category: f.category, indexed: f.indexed, hs: f.hs })),
        stages,
        meta,
      }),
    [data.docs, data.prep, data.files.rows, stages, meta],
  )
  const callItems = useMemo(() => wsCalls({ calls: calls?.rows ?? [], files, stages, meta }), [calls, files, stages, meta])
  const list = view === 'calls' ? callItems : files
  const shown = wsShown(list, { folder, q, type, sort }, folders)
  const cur = viewStage(lead)
  const count = (id: string) => ({ f: files.filter((i) => i.folder === id).length, c: callItems.filter((i) => i.folder === id).length })
  const fname = (id: string) => folders.find((f) => f.id === id)?.name ?? ''
  const orgCalls = view === 'calls' ? callItems.filter((i) => !i.folder).length : 0
  const picked = pick ? pickedOf(files, callItems, sel) : []
  const client = lead.company || lead.name || lead.email || 'the client'
  const stopPicking = () => {
    setPick(false)
    setSel({})
  }

  const star = async (i: WsItem) => {
    const r = await wsStar(lead.id, i.key).catch(() => fail)
    if (r.ok) setMeta(r.ws)
    else toast(r.error, 'warn')
  }
  const move = async (i: WsItem, f: string) => {
    const r = await wsMove(lead.id, i.key, f).catch(() => fail)
    if (!r.ok) return toast(r.error, 'warn')
    setMeta(r.ws)
    toast(r.toast)
    if (i.kind === 'call') onCalls()
  }

  const row = (i: WsItem) => (
    <div key={i.key} data-k={i.key} data-testid="ws-item" className={`flex min-w-0 items-center gap-2.5 py-2.5 ${grid ? 'flex-wrap rounded-lg border border-line px-3' : 'border-b border-line px-1 max-[860px]:flex-wrap'}`}>
      {pick ? (
        <input
          type="checkbox"
          className="h-[18px] w-[18px] shrink-0 cursor-pointer"
          aria-label={'Pick ' + i.name}
          checked={!!sel[i.key]}
          onChange={(e) => setSel((x) => ({ ...x, [i.key]: e.target.checked }))}
        />
      ) : null}
      {i.kind === 'call' ? (
        <DateBlock at={i.at} />
      ) : (
        <span aria-hidden="true" className="grid h-10 w-9 shrink-0 place-items-center rounded-md bg-sunk text-[14px] text-ink-2">
          {i.kind === 'transcript' ? '≋' : '▤'}
        </span>
      )}
      <div className="min-w-0 flex-1 max-[860px]:basis-[calc(100%-50px)]">
        <b className="block truncate text-[14px] font-semibold text-ink [overflow-wrap:anywhere]" title={i.name}>
          {i.name}
        </b>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
          {i.fm.map((f) =>
            f.u ? (
              <a key={f.l} href={f.u} target="_blank" rel="noopener noreferrer" className={fmtCls}>
                {f.l}
              </a>
            ) : f.tab ? (
              <button key={f.l} type="button" className={fmtCls} onClick={() => onTab(f.tab as LeadTab)}>
                {f.l}
              </button>
            ) : (
              <span key={f.l} className={fmtCls}>
                {f.l}
              </span>
            ),
          )}
          <span>
            {i.kind === 'call'
              ? [i.mins ? i.mins + ' min' : '', i.who, i.src].filter(Boolean).join(' · ')
              : (i.src === 'Uploaded' ? 'Uploaded' + (i.by ? ' by ' : '') : '') + i.by + (i.hs ? ' · from HubSpot' : '')}
          </span>
          {(i.kind === 'upload' || i.kind === 'transcript') && i.source ? (
            <span className="rounded-[6px] bg-good-soft px-1.5 text-[11px] text-good" title="What this client’s stage runs read">
              Source
            </span>
          ) : null}
          {i.sent.map((x) => (
            <span
              key={x.to}
              data-testid="ws-sent"
              title={'Sent to ' + x.to + ' on ' + usDateText(x.at, hydrated ? undefined : 'UTC')}
              className="max-w-full truncate whitespace-nowrap rounded-full bg-accent-soft px-2 text-[12px] text-accent-text"
            >
              In {x.to} · {x.name}
            </span>
          ))}
        </div>
        {i.desc || i.sum ? <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{String(i.desc || i.sum).slice(0, 180)}</p> : null}
      </div>
      {i.folder ? (
        <span className="max-w-[150px] shrink-0 truncate rounded-[6px] bg-[#eef3ea] px-2 py-0.5 text-[12px] text-[#3b6b2c]">{fname(i.folder) || 'Folder'}</span>
      ) : (
        <label className="shrink-0">
          <span className="sr-only">Folder for {i.name}</span>
          <select
            value=""
            onChange={(e) => move(i, e.target.value)}
            className="max-w-[140px] rounded-[6px] border border-[#e2c98a] bg-[#fff8e6] px-1.5 py-1 text-[12px]"
          >
            <option value="">To organize</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <span className="min-w-[46px] shrink-0 text-right text-[12px] text-ink-3">{i.at ? <LocalDay iso={i.at} /> : ''}</span>
      <button type="button" className={icon + (i.star ? ' text-[#b38a2a]' : '')} aria-pressed={i.star} aria-label={(i.star ? 'Unstar ' : 'Star ') + i.name} onClick={() => star(i)}>
        <Star size={15} aria-hidden="true" fill={i.star ? 'currentColor' : 'none'} />
      </button>
      <button type="button" className={icon} aria-label={'Edit ' + i.name} onClick={() => setEdit(i)}>
        <Pencil size={14} aria-hidden="true" />
      </button>
      {i.kind === 'call' && i.id ? (
        <Link href={`/calls?call=${encodeURIComponent(i.id)}&seg=post`} className={icon} aria-label={'Open ' + i.name + ' on Calls'}>
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  )

  const navBtn = (id: string, label: string, n: number | null, sub?: string, empty?: boolean) => (
    <button
      key={id}
      type="button"
      aria-pressed={folder === id}
      onClick={() => setFolder(id)}
      className={`flex w-full items-center justify-between gap-1.5 rounded-md px-2.5 py-1.5 text-left text-[14px] max-[860px]:w-auto ${
        folder === id ? 'bg-sunk font-semibold' : 'hover:bg-sunk/60'
      } ${empty ? 'opacity-60' : ''}`}
    >
      <span className="flex min-w-0 flex-col">
        <span className="[overflow-wrap:anywhere]">{label}</span>
        {sub ? <small className="text-[12px] font-normal text-ink-3">{sub}</small> : null}
      </span>
      {n ? <i className="rounded-full bg-sunk px-1.5 text-[12px] not-italic">{n}</i> : null}
    </button>
  )

  return (
    <section aria-labelledby="files" className="rounded-lg border border-line bg-panel shadow-card">
      <h2 id="files" className="flex items-center gap-3 px-5 pt-4 font-display text-[23px] font-semibold text-ink">
        <span>Files</span>
        <span className="font-sans text-[13.5px] font-normal text-ink-3">{files.length}</span>
      </h2>
      {data.files.error ? (
        <p className="mx-5 mt-2 rounded-sm bg-warn-soft px-3.5 py-2.5 text-[14px] text-warn">Uploads could not be read. Agent documents still show.</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <div role="tablist" aria-label="Workspace" className="flex gap-1">
          {(
            [
              ['files', 'Files', files.length],
              ['calls', 'Calls', callItems.length],
            ] as const
          ).map(([k, l, n]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={view === k}
              onClick={() => {
                setView(k)
                setType('')
              }}
              className={`rounded-md px-3 py-1.5 text-[14px] font-semibold ${view === k ? 'bg-action text-action-ink' : 'text-ink-3 hover:text-ink'}`}
            >
              {l} <i className="ml-1 text-[12px] not-italic opacity-75">{n}</i>
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <button type="button" className={btn} aria-pressed={pick} onClick={() => (pick ? stopPicking() : setPick(true))}>
          <CheckSquare size={14} aria-hidden="true" />
          Select
        </button>
        <button type="button" className={btn} onClick={() => setNewFolder(true)}>
          <Plus size={14} aria-hidden="true" />
          New folder
        </button>
        <button type="button" className={primary} onClick={() => setUpload(true)}>
          <Upload size={14} aria-hidden="true" />
          Upload file
        </button>
      </div>
      {pick ? (
        <div role="group" aria-label="Send what is picked" data-testid="ws-pick-bar" className="mx-4 mt-2.5 flex flex-wrap items-center gap-2 rounded-md bg-sunk/70 px-3 py-2">
          <b className="mr-auto text-[13.5px] font-semibold text-ink">{picked.length ? plural(picked.length, 'item') + ' picked' : 'Pick items to send'}</b>
          <button type="button" className={btn} onClick={() => setSel((x) => ({ ...x, ...Object.fromEntries(shown.map((i) => [i.key, true])) }))}>
            All shown
          </button>
          <button type="button" className={btn} onClick={() => setSel({})}>
            None
          </button>
          <button type="button" className={primary} disabled={!picked.length} onClick={() => setAsana(picked)}>
            Send to Asana
          </button>
          <button type="button" className={primary} disabled={!picked.length} onClick={() => setNotion(picked)}>
            Send to Notion
          </button>
          <button type="button" className={btn} onClick={stopPicking}>
            Done
          </button>
        </div>
      ) : null}
      <div className="grid grid-cols-[220px_minmax(0,1fr)] max-[860px]:grid-cols-[minmax(0,1fr)]">
        <nav aria-label="Client folders" className="flex min-w-0 flex-col gap-0.5 border-r border-line px-2.5 py-3 max-[860px]:flex-row max-[860px]:flex-wrap max-[860px]:border-b max-[860px]:border-r-0">
          {navBtn('all', 'All content', list.length)}
          {navBtn('star', 'Starred', list.filter((i) => i.star).length)}
          {navBtn('org', 'To organize', list.filter((i) => !i.folder).length)}
          <div className="mx-1 mb-0.5 mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.08em] text-ink-3 max-[860px]:w-full">
            <span>Client folders</span>
            <button type="button" className={icon + ' h-6 w-6'} aria-label="New folder" onClick={() => setNewFolder(true)}>
              <Plus size={14} aria-hidden="true" />
            </button>
          </div>
          {folders.map((f) => {
            const n = count(f.id)
            return navBtn(f.id, f.name, null, plural(n.f, 'file') + ' · ' + plural(n.c, 'call'), !(n.f + n.c))
          })}
        </nav>
        <div className="min-w-0 px-4 py-3">
          {orgCalls ? (
            <p className="mb-2.5 rounded-md border border-[#efdcab] bg-[#fff8e6] px-3 py-2 text-[13px]">
              <b>
                {plural(orgCalls, 'call')} {orgCalls === 1 ? 'needs' : 'need'} a folder.
              </b>{' '}
              Choose one on each call; a client stage folder files the call under that stage.
            </p>
          ) : null}
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <label className="min-w-0 flex-[1_1_220px]">
              <span className="sr-only">Search</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={view === 'calls' ? 'Search call titles, people or summaries…' : 'Search files by name or description…'}
                className={field + ' h-9'}
              />
            </label>
            {view === 'files' ? (
              <select aria-label="File type" value={type} onChange={(e) => setType(e.target.value)} className={field + ' h-9 w-auto'}>
                <option value="">All file types</option>
                <option value="pdf">PDF</option>
                <option value="gdoc">Google Doc</option>
                <option value="upload">Uploaded</option>
                <option value="transcript">Transcripts</option>
              </select>
            ) : null}
            <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} className={field + ' h-9 w-auto'}>
              <option value="new">Newest first</option>
              <option value="old">Oldest first</option>
              <option value="az">Name A–Z</option>
            </select>
            <button type="button" className={icon} aria-pressed={grid} aria-label="Grid view" onClick={() => setGrid(!grid)}>
              <LayoutGrid size={15} aria-hidden="true" />
            </button>
          </div>
          {folder === 'all' ? (
            <>
              <h3 className="mb-1.5 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Stage folders</h3>
              <div className="mb-3.5 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5" data-testid="stage-folders">
                {folders
                  .filter((f) => f.stage)
                  .map((f) => {
                    const n = count(f.id)
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFolder(f.id)}
                        className={`flex min-w-0 flex-col gap-1 rounded-lg border p-3 text-left ${f.id === cur ? 'border-[#d8b46a] bg-[#fffaf0]' : 'border-line'}`}
                      >
                        {f.id === cur ? <em className="text-[10px] not-italic uppercase tracking-[0.08em] text-[#a07a2c]">Current</em> : null}
                        <b className="text-[14px] [overflow-wrap:anywhere]">{f.name}</b>
                        <small className="text-[12px] text-ink-3">
                          {plural(n.f, 'file')} · {plural(n.c, 'call')}
                        </small>
                      </button>
                    )
                  })}
              </div>
            </>
          ) : null}
          <h3 className="mb-1 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            {view === 'calls' ? 'Conversations' : 'Documents'} <span className="font-normal normal-case tracking-normal">{plural(shown.length, 'item')}</span>
          </h3>
          {view === 'calls' && !calls ? (
            <p role="status" className="py-3 text-[13.5px] text-ink-3">
              Reading the calls from Fathom…
            </p>
          ) : null}
          {view === 'calls' && calls?.error && !calls.rows.length ? <p className="py-1 text-[13.5px] text-ink-3">Could not read the calls from Fathom: {calls.error}</p> : null}
          <div className={grid ? 'grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5' : 'flex flex-col'} data-testid="ws-list">
            {shown.length ? (
              shown.map(row)
            ) : (
              <p className="px-1 py-3.5 text-[13.5px] text-ink-3">
                {q ? 'Nothing matches that search.' : view === 'calls' ? 'No calls here yet.' : 'No files here yet. Upload one, or pick another folder.'}
              </p>
            )}
          </div>
        </div>
      </div>
      {edit ? (
        <EditItem
          leadId={lead.id}
          item={edit}
          folders={folders}
          onClose={() => setEdit(null)}
          onSaved={(ws) => {
            setMeta(ws)
            if (edit.kind === 'call') onCalls()
          }}
        />
      ) : null}
      {newFolder ? (
        <NewFolder
          leadId={lead.id}
          onClose={() => setNewFolder(false)}
          onSaved={(ws, id) => {
            setMeta(ws)
            setFolder(id)
          }}
        />
      ) : null}
      {notion ? (
        <NotionDialog
          title="Send to Notion"
          load={notionDatabases}
          intro={'Each picked item becomes an entry in the database you pick, named for it and ' + client + '.'}
          rows={notion.map((i) => {
            const t = sendTitle(i.name, client)
            return {
              id: i.key,
              title: t,
              on: true,
              label: (
                <>
                  {t} <small className="text-ink-3">· {kindWord(i)}</small>
                </>
              ),
            }
          })}
          followUp={{ title: entryTitle('Follow-up: ' + client, ''), label: 'Add a follow-up entry: “Follow-up: ' + client + '”', on: false }}
          note={<p className="text-[13px] text-ink-3">Notion gets the names only, as Tasks sends them. The links stay on the dashboard.</p>}
          nothing="Tick at least one item, or the follow-up."
          onSent={async (x) => {
            const r = await wsNotionMark(lead.id, x.ids, x.db, x.name, x.all).catch(() => fail)
            if (r.ok) setMeta(r.ws)
            else toast(r.error, 'warn')
            if (x.all) stopPicking()
          }}
          doneToast={(n, name) => plural(n, 'entry', 'entries') + ' sent to Notion · ' + name}
          onClose={() => setNotion(null)}
          listTestId="notion-items"
        />
      ) : null}
      {asana ? (
        <AsanaDialog
          title="Send to Asana"
          intro="Each picked item becomes an Asana task in the project you pick, with its link in the description."
          rows={asana.map((i) => ({
            id: i.key,
            title: sendTitle(i.name, client),
            editable: true,
            on: true,
            due: '',
            notes: asanaNotes(i, client, fname(i.folder), usDateText(i.at)),
          }))}
          nothing="Tick at least one item, with a name."
          onSent={async (x) => {
            const r = await wsAsanaMark(lead.id, x.made.map((m) => m.id), x.project, x.projectName).catch(() => fail)
            if (r.ok) setMeta(r.ws)
            else toast(r.error, 'warn')
            if (x.all) stopPicking()
          }}
          doneToast={(n, p) => plural(n, 'item') + ' sent to ' + p + '.'}
          onClose={() => setAsana(null)}
        />
      ) : null}
      {upload ? (
        <UploadItem
          leadId={lead.id}
          folders={folders}
          def={folder !== 'all' && folder !== 'star' && folder !== 'org' ? folder : cur}
          onClose={() => setUpload(false)}
        />
      ) : null}
    </section>
  )
}

function Footer({ msg, children }: { msg: Msg; children: React.ReactNode }) {
  return (
    <>
      <span role="status" aria-live="polite" className={`mr-auto text-[13.5px] ${msg?.bad ? 'text-bad' : 'text-ink-2'}`} data-testid="ws-msg">
        {msg?.text ?? ''}
      </span>
      {children}
    </>
  )
}

function FolderSelect({ folders, value, onChange, label = 'Folder' }: { folders: WsFolder[]; value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <label className="mb-3 block">
      <span className="block text-[13.5px] font-semibold text-ink">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={field + ' mt-1 h-10'}>
        <option value="">To organize</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Edit an item (v145WsEdit): its name, folder and description; an upload also whether the runs read it, and Delete. */
function EditItem({
  leadId,
  item,
  folders,
  onClose,
  onSaved,
}: {
  leadId: string
  item: WsItem
  folders: WsFolder[]
  onClose: () => void
  onSaved: (ws: WsMeta) => void
}) {
  const up = item.kind === 'upload' || item.kind === 'transcript'
  const [name, setName] = useState(item.name)
  const [folder, setFolder] = useState(item.folder)
  const [desc, setDesc] = useState(item.desc)
  const [source, setSource] = useState(!!item.source)
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!name.trim()) return setMsg({ text: 'Give it a name.', bad: true })
    setBusy(true)
    const r = await wsEdit(leadId, item.key, { name, folder, desc, ...(up ? { source } : {}) }).catch(() => fail)
    if (!r.ok) {
      setBusy(false)
      return setMsg({ text: r.error, bad: true })
    }
    onSaved(r.ws)
    onClose()
    toast(r.toast)
  }
  const remove = async () => {
    if (!window.confirm('Delete ' + item.name + '? The file is removed for the whole team.')) return
    setBusy(true)
    const r = await wsDelete(leadId, item.key).catch(() => fail)
    if (!r.ok) {
      setBusy(false)
      return setMsg({ text: r.error, bad: true })
    }
    onSaved(r.ws)
    onClose()
    toast(r.toast)
  }
  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Client workspace"
      title={item.name}
      width={560}
      footer={
        <Footer msg={msg}>
          {up ? (
            <button type="button" disabled={busy} onClick={remove} className="rounded-sm px-3 py-2 text-[14px] font-semibold text-bad hover:bg-bad-soft">
              Delete
            </button>
          ) : null}
          <button type="button" className={btn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={busy} onClick={save}>
            Save
          </button>
        </Footer>
      }
    >
      <label className="mb-3 block">
        <span className="block text-[13.5px] font-semibold text-ink">Name</span>
        <input type="text" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={field + ' mt-1 h-10'} />
      </label>
      <FolderSelect folders={folders} value={folder} onChange={setFolder} />
      <label className="mb-3 block">
        <span className="block text-[13.5px] font-semibold text-ink">Description</span>
        <textarea rows={3} maxLength={600} value={desc} onChange={(e) => setDesc(e.target.value)} className={field + ' mt-1'} />
      </label>
      {up ? (
        <label className="flex items-start gap-2 text-[13.5px]">
          <input type="checkbox" className="mt-1" checked={source} onChange={(e) => setSource(e.target.checked)} /> Use it as a source: this client’s stage runs read it
        </label>
      ) : null}
    </Dialog>
  )
}

function NewFolder({ leadId, onClose, onSaved }: { leadId: string; onClose: () => void; onSaved: (ws: WsMeta, id: string) => void }) {
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)
  const go = async () => {
    if (!name.trim()) return setMsg({ text: 'Give the folder a name.', bad: true })
    setBusy(true)
    const r = await wsNewFolder(leadId, name).catch(() => fail)
    if (!r.ok) {
      setBusy(false)
      return setMsg({ text: r.error, bad: true })
    }
    onSaved(r.ws, r.id ?? 'all')
    onClose()
    toast(r.toast)
  }
  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Client workspace"
      title="New folder"
      width={480}
      footer={
        <Footer msg={msg}>
          <button type="button" className={btn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={busy} onClick={go}>
            Add folder
          </button>
        </Footer>
      }
    >
      <label className="block">
        <span className="block text-[13.5px] font-semibold text-ink">Folder name</span>
        <input
          type="text"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go()
          }}
          placeholder="e.g. Contracts"
          className={field + ' mt-1 h-10'}
        />
      </label>
    </Dialog>
  )
}

/**
 * Add a client file (v145WsUpload, v146): a file, or a call transcript pasted in, with a name, a folder and a
 * description, and whether the stage runs read it. The file goes from the browser straight to Storage at an address
 * the server signs; a file's text is then read for the Ask bot, a pasted transcript keeps its own.
 */
function UploadItem({ leadId, folders, def, onClose }: { leadId: string; folders: WsFolder[]; def: string; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [pasted, setPasted] = useState(false)
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [folder, setFolder] = useState(folders.some((f) => f.id === def) ? def : '')
  const [desc, setDesc] = useState('')
  const [source, setSource] = useState(true)
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)
  const say = (t: string, bad?: boolean) => setMsg({ text: t, bad })

  const go = async () => {
    const file = pasted ? null : input.current?.files?.[0]
    const t = text.replace(/\r\n?/g, '\n').trim().slice(0, 120_000)
    if (pasted && t.length < 40) return say('Paste the transcript first (a few lines at least).', true)
    if (!pasted && !file) return say('Choose a file first.', true)
    if (!name.trim()) return say('Give it a name.', true)
    if (file && file.size > MAX_UPLOAD) return say('Keep uploads under 25 MB.', true)
    const fname = pasted ? (name.replace(/[^\w.\- ]+/g, '').trim() || 'transcript') + '.txt' : file!.name
    const body: Blob = pasted ? new Blob([t], { type: 'text/plain' }) : file!
    setBusy(true)
    say('Uploading…')
    try {
      const s = await startUpload({ leadId, name: fname, size: body.size })
      if (!s.ok) throw new Error(s.error)
      let res: Response | null = null
      try {
        res = await fetch(s.url, {
          method: 'PUT',
          headers: { 'content-type': pasted ? 'text/plain' : body.type || 'application/octet-stream', 'x-upsert': 'false', apikey: SUPABASE_ANON_KEY },
          body,
        })
      } catch {
        res = null
      }
      if (!res || !res.ok) throw new Error(`Storage upload failed${res ? ' (' + res.status + ')' : ''}. Try again in a minute.`)
      const f = await finishUpload({ leadId, path: s.path, name: fname, stage: 'manual', note: desc, ws: { name, folder, desc, source, ...(pasted ? { transcript: t } : {}) } })
      if (!f.ok) throw new Error(f.error)
      if (!pasted) {
        say('Reading its text…')
        await indexFile(f.id).catch(() => null)
      }
    } catch (e) {
      setBusy(false)
      return say(e instanceof Error ? e.message : 'Could not reach the dashboard. Try again in a minute.', true)
    }
    onClose()
    const fn = folders.find((x) => x.id === folder)?.name
    toast((pasted ? 'Transcript' : 'File') + ' added' + (fn ? ' to ' + fn : '') + '.')
  }

  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Client workspace"
      title="Add a client file"
      width={600}
      footer={
        <Footer msg={msg}>
          <button type="button" className={btn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={busy} onClick={go}>
            <Upload size={15} aria-hidden="true" />
            Add file
          </button>
        </Footer>
      }
    >
      <div role="radiogroup" aria-label="What are you adding?" className="mb-3 flex flex-wrap gap-4 text-[14px]">
        <label className="inline-flex items-center gap-1.5">
          <input type="radio" name="ws-kind" checked={!pasted} onChange={() => setPasted(false)} /> A file
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="radio" name="ws-kind" checked={pasted} onChange={() => setPasted(true)} /> A call transcript, pasted
        </label>
      </div>
      <label className="mb-3 block" hidden={pasted}>
        <span className="block text-[13.5px] font-semibold text-ink">File</span>
        <small className="block text-[12.5px] text-ink-3">PDF, Word, text or a picture, up to 25 MB</small>
        <input
          ref={input}
          type="file"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f && !name.trim()) setName(f.name.replace(/\.[a-z0-9]{1,5}$/i, ''))
          }}
          className="mt-1 max-w-full text-[13.5px] text-ink-2"
        />
      </label>
      <label className="mb-3 block" hidden={!pasted}>
        <span className="block text-[13.5px] font-semibold text-ink">Transcript</span>
        <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the transcript or your notes from the call" className={field + ' mt-1'} />
      </label>
      <label className="mb-3 block">
        <span className="block text-[13.5px] font-semibold text-ink">Document name</span>
        <input type="text" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="A short, recognizable name" className={field + ' mt-1 h-10'} />
      </label>
      <FolderSelect folders={folders} value={folder} onChange={setFolder} />
      <label className="mb-3 block">
        <span className="block text-[13.5px] font-semibold text-ink">Description</span>
        <textarea rows={2} maxLength={600} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What it is and why it matters" className={field + ' mt-1'} />
      </label>
      <label className="flex items-start gap-2 text-[13.5px]">
        <input type="checkbox" className="mt-1" checked={source} onChange={(e) => setSource(e.target.checked)} /> Use it as a source: this client’s stage runs read it
      </label>
    </Dialog>
  )
}
