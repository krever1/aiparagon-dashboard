'use client'

import { useRef, useState } from 'react'
import { deleteFile, finishUpload, indexFile, startUpload } from '@/app/(app)/lead-pipeline/file-actions'
import { Dialog } from '@/components/ui/dialog'
import { LocalDate } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { SUPABASE_ANON_KEY } from '@/lib/config'
import { FILE_GROUP, FILE_STAGES, MAX_UPLOAD } from '@/lib/catalyst/files'
import type { FileRow } from '@/lib/catalyst/lead-page'
import { safeUrl } from '@/lib/catalyst/view'

const btn = 'inline-flex items-center gap-1.5 rounded-sm border border-line bg-panel px-3 py-1.5 text-[13.5px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const small = 'rounded-sm border border-line bg-panel px-2 py-0.5 text-[12.5px] font-semibold text-ink-2 hover:border-line-2 hover:text-ink disabled:opacity-60'
const chip = 'inline-flex items-center gap-1 rounded-full bg-sunk px-2.5 py-1 text-[12.5px] text-ink-2'
const field = 'h-10 rounded-sm border border-line bg-panel px-3 text-[14px] text-ink focus:border-accent focus:outline-none'

function fileIcon(name: string): string {
  const x = name.toLowerCase()
  if (x.includes('.pdf') || x.includes('pdf')) return '📄'
  if (/\.(doc|docx)/.test(x) || x.includes('google doc')) return '📝'
  if (/\.(xls|xlsx|csv)/.test(x)) return '📊'
  if (/\.(png|jpe?g|gif|webp)/.test(x)) return '🖼️'
  if (/\.(ppt|pptx)/.test(x) || x.includes('slide')) return '📽️'
  return '📁'
}

/**
 * A lead's Files tab (e1FilesSection): the agents' documents, then what the team uploaded, grouped by stage, with
 * search. An upload can be made readable for the Ask bot (Index, Re-index) or deleted; new files are uploaded at the
 * bottom (e1UploadFile).
 */
export function FilesPanel({ leadId, rows, error }: { leadId: string; rows: FileRow[]; error: boolean }) {
  const [q, setQ] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [gone, setGone] = useState<FileRow | null>(null)
  const t = q.trim().toLowerCase()
  const shown = rows.filter((f) => !t || [f.name, FILE_GROUP[f.stage] ?? f.stage, f.note, f.by].join(' ').toLowerCase().includes(t))
  const groups: { stage: string; rows: FileRow[] }[] = []
  for (const f of shown) {
    let g = groups.find((x) => x.stage === f.stage)
    if (!g) groups.push((g = { stage: f.stage, rows: [] }))
    g.rows.push(f)
  }

  const index = async (f: FileRow) => {
    setBusyId(f.id)
    let r: Awaited<ReturnType<typeof indexFile>>
    try {
      r = await indexFile(f.id)
    } catch {
      r = { ok: false, error: 'Could not reach the dashboard. Try again in a minute.' }
    }
    setBusyId(null)
    if (r.ok) toast(r.toast)
    else toast('Indexing failed: ' + r.error, 'warn')
  }

  return (
    <section aria-labelledby="files" className="rounded-lg border border-line bg-panel p-5 shadow-card sm:p-6">
      <h2 id="files" className="flex flex-wrap items-center gap-x-3 gap-y-1 font-display text-[23px] font-semibold text-ink">
        <span>Files</span>
        <span className="font-sans text-[13.5px] font-normal text-ink-3">{rows.length}</span>
      </h2>
      <div className="mt-3">
        {error ? (
          <p className="mb-3 rounded-sm bg-warn-soft px-3.5 py-2.5 text-[14px] text-warn">
            <b>Couldn’t read the uploads.</b> The agents’ documents still show below.
          </p>
        ) : null}
        {rows.length ? (
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search files by name or category…"
            aria-label="Search files"
            className="mb-3 h-10 w-full max-w-[340px] rounded-sm border border-line bg-panel px-3 text-[14px] focus:border-accent focus:outline-none"
          />
        ) : null}
        {rows.length === 0 ? <p className="py-2 text-[14.5px] text-ink-2">No files yet for this lead.</p> : null}
        {rows.length > 0 && shown.length === 0 ? <p className="py-2 text-[14.5px] text-ink-2">No files match that search.</p> : null}
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.stage}>
              <p className="mb-1.5 flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
                <span aria-hidden="true">📁</span> {FILE_GROUP[g.stage] ?? g.stage} <span className="font-semibold opacity-70">{g.rows.length}</span>
              </p>
              <ul className="divide-y divide-line rounded-md border border-line">
                {g.rows.map((f) => {
                  const href = safeUrl(f.url)
                  const busy = busyId === f.id
                  return (
                    <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 text-[14px]" data-testid="file">
                      <span aria-hidden="true">{fileIcon(f.name)}</span>
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="min-w-0 break-words font-semibold text-action hover:underline">
                          {f.name}
                        </a>
                      ) : (
                        <span className="min-w-0 break-words font-semibold text-ink">{f.name}</span>
                      )}
                      {f.note ? (
                        <span className="max-w-[220px] truncate text-[13px] text-ink-3" title={f.note}>
                          {f.note}
                        </span>
                      ) : null}
                      <span className={chip}>{f.source === 'agent' ? 'agent' : 'upload' + (f.by ? ' · ' + f.by : '')}</span>
                      {f.source === 'upload' && f.indexed ? (
                        <span className="rounded-full bg-good-soft px-2.5 py-1 text-[12.5px] text-good" title="Text extracted: the Ask bot can read this">
                          ✦ searchable
                        </span>
                      ) : null}
                      {f.source === 'upload' ? (
                        <button
                          type="button"
                          className={small}
                          disabled={busy}
                          onClick={() => index(f)}
                          title={
                            f.indexed
                              ? 'Read the text again (use it if the Ask bot says the content is empty)'
                              : 'Read the text so the Ask bot can read this document'
                          }
                        >
                          {busy ? 'Indexing…' : f.indexed ? 'Re-index' : 'Index'}
                        </button>
                      ) : null}
                      {f.at ? (
                        <span className="ml-auto text-[12.5px] text-ink-3">
                          {f.source === 'agent' ? 'generated' : 'uploaded'} <LocalDate iso={f.at} />
                        </span>
                      ) : null}
                      {f.source === 'upload' ? (
                        <button
                          type="button"
                          aria-label={'Delete ' + f.name}
                          title="Delete file"
                          disabled={busy}
                          onClick={() => setGone(f)}
                          className={(f.at ? '' : 'ml-auto ') + 'grid h-7 w-7 place-items-center rounded-sm text-[15px] text-ink-3 hover:bg-bad-soft hover:text-bad'}
                        >
                          ✕
                        </button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
        <UploadForm leadId={leadId} />
      </div>
      {gone ? <DeleteFile file={gone} onClose={() => setGone(null)} /> : null}
    </section>
  )
}

/** Delete a file: asked first, since it cannot be undone (the Files page asks the same). */
function DeleteFile({ file, onClose }: { file: FileRow; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const go = async () => {
    setBusy(true)
    setMsg('')
    let r: Awaited<ReturnType<typeof deleteFile>>
    try {
      r = await deleteFile(file.id)
    } catch {
      r = { ok: false, error: 'Could not reach the dashboard. Try again in a minute.' }
    }
    if (!r.ok) {
      setBusy(false)
      setMsg(r.error)
      return
    }
    onClose()
    toast(r.toast)
  }
  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Files"
      title={`Delete “${file.name}”?`}
      width={520}
      footer={
        <>
          <span role="status" aria-live="polite" className="mr-auto text-[13.5px] text-bad">
            {msg}
          </span>
          <button type="button" onClick={onClose} className="rounded-sm border border-line px-3.5 py-2 text-[14px] font-semibold text-ink hover:border-line-2">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={go}
            className="rounded-sm bg-bad px-4 py-2 text-[14px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            Delete
          </button>
        </>
      }
    >
      <p className="text-[14.5px] text-ink">This cannot be undone. The file goes from the dashboard; a copy already in HubSpot stays there.</p>
    </Dialog>
  )
}

/**
 * Upload a file: the browser sends it straight to Storage at an address the server signs (a Vercel request takes at
 * most 4.5 MB, a file up to 25 MB), then the server saves its row and reads its text for the Ask bot.
 */
function UploadForm({ leadId }: { leadId: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState('manual')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const upload = async () => {
    const file = input.current?.files?.[0]
    setMsg('')
    if (!file) return setMsg('Choose a file first.')
    if (file.size > MAX_UPLOAD) return setMsg('Keep uploads under 25 MB.')
    setBusy('Uploading…')
    try {
      const s = await startUpload({ leadId, name: file.name, size: file.size })
      if (!s.ok) return setMsg(s.error)
      let res: Response | null = null
      try {
        res = await fetch(s.url, {
          method: 'PUT',
          // only the headers supabase-js sends from a browser, which Supabase's CORS check allows
          headers: { 'content-type': file.type || 'application/octet-stream', 'x-upsert': 'false', apikey: SUPABASE_ANON_KEY },
          body: file,
        })
      } catch {
        res = null
      }
      if (!res || !res.ok) return setMsg(`Storage upload failed${res ? ' (' + res.status + ')' : ''}. Try again in a minute.`)
      const f = await finishUpload({ leadId, path: s.path, name: file.name, stage, note })
      if (!f.ok) return setMsg(f.error)
      setBusy('Indexing…')
      const ix = await indexFile(f.id)
      if (input.current) input.current.value = ''
      setNote('')
      setStage('manual')
      if (ix.ok) toast('Uploaded ' + file.name + '. ' + ix.toast)
      else toast('Uploaded ' + file.name + ', but it could not be read for the Ask bot: ' + ix.error + ' Press Index to try again.', 'warn')
    } catch {
      setMsg('Could not reach the dashboard. Try again in a minute.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-4" data-testid="upload">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" aria-label="File to upload" className="max-w-full text-[13.5px] text-ink-2 file:mr-2 file:rounded-sm file:border file:border-line file:bg-panel file:px-3 file:py-1.5 file:text-[13.5px] file:font-semibold file:text-ink" />
        <select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)} className={field}>
          {FILE_STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" maxLength={500} className={field + ' min-w-[180px] flex-1'} />
        <button type="button" disabled={!!busy} onClick={upload} className={btn}>
          {busy ?? 'Upload'}
        </button>
      </div>
      {msg ? (
        <p role="alert" className="mt-2 text-[13.5px] text-bad">
          {msg}
        </p>
      ) : null}
      <p className="mt-3 text-[13px] text-ink-3">
        Agent rows come straight from the pipeline output. Uploads stay with this lead: use them for anything you’d otherwise chase across email or Drive,
        including documents for skipped stages. Each upload is read so the Ask bot can use it; PDFs, Word (.docx) and plain-text files work, and a copy goes
        to the lead’s HubSpot contact when there is one. If the Ask bot says a document is empty, press Re-index on that file.
      </p>
    </div>
  )
}
