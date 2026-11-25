'use client'

import { useState } from 'react'
import { Folder, Plus, X } from 'lucide-react'
import { saveFoldersTypes } from '@/app/(app)/calls/actions'
import { Dialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { CATS, MT, autoFolder, catName, typeLabel } from '@/lib/catalyst/calls'
import { useTypeNames } from './names'

// Folders and call types (v144Manage, v144Save): for the whole team, on Tasks and Calls. Renaming a folder or one of the
// team's own types renames it on every call in it; deleting a folder takes it off the calls it was set on (they go back
// to being filed by their people); the built-in types and the buttons keep their keys and take the team's names.

const input = 'h-9 w-full min-w-0 rounded-sm border border-line bg-panel px-2.5 text-[14px] text-ink focus:border-accent focus:outline-none disabled:bg-sunk'
const ghost = 'inline-flex items-center gap-1.5 rounded-sm border border-line px-3.5 py-2 text-[14px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const primary = 'rounded-sm bg-action px-4 py-2 text-[14px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60'
const iconBtn = 'grid h-8 w-8 shrink-0 place-items-center rounded-sm text-ink-3 hover:bg-sunk hover:text-bad'
const h3 = 'mb-2 mt-4 text-[14px] font-semibold text-ink'

const cleanName = (t: string, max = 80) => t.replace(/\s+/g, ' ').trim().slice(0, max)
const bad = (t: string) => /[<>{}[\]\\]/.test(t)

type FRow = { was: string; value: string; del: boolean; isNew: boolean; n: number; auto: boolean }
type TRow = { key: string; value: string; del: boolean; isNew: boolean; own: boolean }

export function FoldersTypes({
  folders,
  folderCalls,
  custom,
  kept,
  onClose,
}: {
  /** the folder list (the filter's choices) */
  folders: string[]
  /** every call the page knows, by the folder it is filed in */
  folderCalls: Record<string, string[]>
  /** the team's own types */
  custom: string[]
  /** how many calls stay under deleted folders, filed by their people */
  kept: (deleted: string[]) => number
  onClose: () => void
}) {
  const names = useTypeNames()
  const [fRows, setFRows] = useState<FRow[]>(() =>
    folders.map((f) => ({ was: f, value: f, del: false, isNew: false, n: folderCalls[f]?.length ?? 0, auto: autoFolder(f) })),
  )
  const [tRows, setTRows] = useState<TRow[]>(() => [
    ...CATS.flatMap((c) => c[2].map((k) => ({ key: k, value: typeLabel(k, names), del: false, isNew: false, own: false }))),
    ...custom.map((k) => ({ key: k, value: k, del: false, isNew: false, own: true })),
  ])
  const [btns, setBtns] = useState<Record<string, string>>(() => Object.fromEntries(CATS.map((c) => [c[0], catName(c[0], names)])))
  const [newF, setNewF] = useState('')
  const [newT, setNewT] = useState('')
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const say = (text: string, isBad = false) => setMsg({ text, bad: isBad })

  const setF = (i: number, p: Partial<FRow>) => setFRows((L) => L.map((r, j) => (j === i ? { ...r, ...p } : r)))
  const setT = (key: string, own: boolean, p: Partial<TRow>) => setTRows((L) => L.map((r) => (r.key === key && r.own === own ? { ...r, ...p } : r)))

  const delFolder = (i: number) => {
    const r = fRows[i]
    if (r.isNew) return setFRows((L) => L.filter((_, j) => j !== i))
    setF(i, { del: !r.del })
    say(!r.del ? 'The folder goes when you save. Its calls are filed by the people on them again.' : '')
  }
  const delType = (r: TRow) => {
    if (r.isNew) return setTRows((L) => L.filter((x) => x !== r))
    setT(r.key, true, { del: !r.del })
    say(!r.del ? 'The type goes when you save. Its calls show the AI’s pick again.' : '')
  }

  const addFolder = () => {
    const v = cleanName(newF, 80)
    if (v.length < 2) return say('Give the folder a name, two letters or more.', true)
    if (bad(v)) return say('Use letters, numbers and spaces in a folder name.', true)
    if (fRows.filter((r) => !r.del).some((r) => cleanName(r.value).toLowerCase() === v.toLowerCase())) return say('There is a folder with that name already.', true)
    setFRows((L) => [...L, { was: v, value: v, del: false, isNew: true, n: 0, auto: false }])
    setNewF('')
    say('Added. It is saved with the rest.')
  }
  const addType = () => {
    const v = cleanName(newT, 30)
    const lo = v.toLowerCase()
    if (v.length < 2) return say('Give the type a name, two letters or more.', true)
    if (bad(v)) return say('Use letters, numbers and spaces in a type name.', true)
    if (
      tRows.filter((r) => !r.del).some((r) => cleanName(r.value, 30).toLowerCase() === lo) ||
      CATS.some((c) => catName(c[0], names).toLowerCase() === lo) ||
      lo === 'no type yet'
    ) {
      return say('That type is already in the list.', true)
    }
    setTRows((L) => [...L, { key: v, value: v, del: false, isNew: true, own: true }])
    setNewT('')
    say('Added. It is saved with the rest.')
  }
  const reset = () => {
    setTRows((L) => L.map((r) => (r.own ? r : { ...r, value: MT[r.key].label })))
    setBtns(Object.fromEntries(CATS.map((c) => [c[0], c[1]])))
    say('The built-in types and buttons have their usual names again. Save to keep it.')
  }

  const save = async () => {
    const fRen: { from: string; to: string; ids: string[] }[] = []
    const fDel: string[] = []
    const fNew: string[] = []
    const tRen: [string, string][] = []
    const tDel: string[] = []
    const tNew: string[] = []
    const next: Record<string, string> = {}
    const seenF = new Set<string>()
    const seenT = new Set<string>()
    let problem = ''
    for (const r of fRows) {
      if (r.auto) continue
      if (r.del) {
        if (!r.isNew) fDel.push(r.was)
        continue
      }
      const v = cleanName(r.value, 80)
      if (v.length < 2 || bad(v)) {
        problem ||= 'Each folder needs a name of two letters or more, in letters, numbers and spaces.'
        continue
      }
      if (seenF.has(v.toLowerCase()) || autoFolder(v)) {
        problem ||= 'Two folders cannot share a name (' + v + ').'
        continue
      }
      seenF.add(v.toLowerCase())
      if (r.isNew) fNew.push(v)
      else if (v !== r.was) fRen.push({ from: r.was, to: v, ids: folderCalls[r.was] ?? [] })
    }
    for (const r of tRows) {
      if (r.del) {
        if (r.own && !r.isNew) tDel.push(r.key)
        continue
      }
      const v = cleanName(r.value, 30)
      if (r.own && (v.length < 2 || bad(v))) {
        problem ||= 'Each of your types needs a name of two letters or more.'
        continue
      }
      if (v && bad(v)) {
        problem ||= 'Use letters, numbers and spaces in a type name.'
        continue
      }
      const shown = v || (r.own ? r.key : MT[r.key].label)
      if (seenT.has(shown.toLowerCase())) {
        problem ||= 'Two types cannot share a name (' + shown + ').'
        continue
      }
      seenT.add(shown.toLowerCase())
      if (r.own) {
        if (r.isNew) tNew.push(v)
        else if (v !== r.key) tRen.push([r.key, v])
      } else next[r.key] = v && v !== MT[r.key].label ? v : ''
    }
    for (const c of CATS) {
      const v = cleanName(btns[c[0]] ?? '', 30)
      if (v && bad(v)) {
        problem ||= 'Use letters, numbers and spaces in a button name.'
        continue
      }
      next['cat:' + c[0]] = v && v !== c[1] ? v : ''
    }
    if (problem) return say(problem, true)
    const namesChanged = Object.keys(next).some((k) => (names[k] ?? '') !== next[k])
    if (!fRen.length && !fDel.length && !fNew.length && !tRen.length && !tDel.length && !tNew.length && !namesChanged) return onClose()
    const stay = kept(fDel)
    setBusy(true)
    say('Saving…')
    const r = await saveFoldersTypes({ fRen, fDel, fNew, tRen, tDel, tNew, names: namesChanged ? next : null }).catch(() => ({
      ok: false as const,
      error: 'Could not save everything: the dashboard could not be reached. What saved before it stays. Try again in a minute.',
    }))
    setBusy(false)
    if (!r.ok) return say(r.error, true)
    onClose()
    const one = stay === 1
    toast(
      'Saved for the whole team.' +
        (stay
          ? ` ${stay} call${one ? ' is' : 's are'} still filed under a deleted folder by the people on ${one ? 'it' : 'them'}; set a folder on ${one ? 'it' : 'them'} to move ${one ? 'it' : 'them'}.`
          : ''),
    )
  }

  const typeRow = (r: TRow) => (
    <div key={(r.own ? 'own:' : '') + r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pl-4" data-testid="ft-type">
      <input
        className={input + (r.del ? ' line-through opacity-55' : '') + (r.isNew ? ' border-art-gold' : '')}
        aria-label={'Call type name: ' + r.value}
        value={r.value}
        maxLength={30}
        disabled={r.del}
        placeholder={r.own ? undefined : MT[r.key].label}
        onChange={(e) => setT(r.key, r.own, { value: e.target.value })}
      />
      {r.own ? (
        <button type="button" className={iconBtn} aria-label={(r.del ? 'Keep ' : 'Delete ') + 'the type ' + r.key} title={r.del ? 'Keep it' : 'Delete the type'} onClick={() => delType(r)}>
          <X size={16} aria-hidden="true" />
        </button>
      ) : (
        <span className="text-[12px] text-ink-3">Built in</span>
      )}
    </div>
  )

  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Touchpoint · Tasks and Calls"
      title="Folders and call types"
      width={640}
      footer={
        <>
          <button type="button" className={ghost} onClick={reset}>
            Use the usual names
          </button>
          <span className="flex-1" />
          <button type="button" className={ghost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={busy} onClick={save}>
            Save changes
          </button>
        </>
      }
    >
      <p className="text-[13.5px] text-ink-3">For the whole team, on Tasks and Calls. Renaming a folder or one of your types renames it on every call in it.</p>
      <h3 className={h3}>Client folders</h3>
      <div className="grid gap-1.5" data-testid="ft-folders">
        {fRows.map((r, i) => (
          <div key={r.was + (r.isNew ? ':new' : '')} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2" data-testid="ft-folder">
            <Folder size={16} aria-hidden="true" className="text-ink-3" />
            {r.auto ? (
              <span className="flex flex-col text-[14px] text-ink">
                {r.was}
                <small className="text-[12px] text-ink-3">Set on its own</small>
              </span>
            ) : (
              <input
                className={input + (r.del ? ' line-through opacity-55' : '') + (r.isNew ? ' border-art-gold' : '')}
                aria-label={'Folder name: ' + r.was}
                value={r.value}
                maxLength={80}
                disabled={r.del}
                onChange={(e) => setF(i, { value: e.target.value })}
              />
            )}
            <span className="hidden text-[12px] text-ink-3 sm:inline">{r.isNew ? 'New' : r.n + ' call' + (r.n === 1 ? '' : 's')}</span>
            {r.auto ? (
              <span />
            ) : (
              <button
                type="button"
                className={iconBtn}
                aria-label={(r.del ? 'Keep ' : 'Delete ') + 'the folder ' + r.was}
                title={r.del ? 'Keep it' : 'Delete the folder'}
                onClick={() => delFolder(i)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className={input + ' flex-1'}
          maxLength={80}
          value={newF}
          onChange={(e) => setNewF(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addFolder()
          }}
          placeholder="New folder, e.g. Northwind Advisors"
          aria-label="New folder name"
        />
        <button type="button" className={ghost} onClick={addFolder}>
          <Plus size={15} aria-hidden="true" />
          Add folder
        </button>
      </div>

      <h3 className={h3}>Call types</h3>
      {CATS.map((c) => (
        <div key={c[0]} className="grid gap-1.5 border-t border-line py-2.5" data-testid="ft-group">
          <label className="flex items-center gap-2 text-[12px] text-ink-3">
            <span className="min-w-[52px]">Button</span>
            <input
              className={input + ' font-semibold'}
              aria-label={'Button name: ' + catName(c[0], names)}
              value={btns[c[0]] ?? ''}
              maxLength={30}
              placeholder={c[1]}
              onChange={(e) => setBtns((b) => ({ ...b, [c[0]]: e.target.value }))}
            />
          </label>
          {tRows.filter((r) => !r.own && c[2].includes(r.key)).map(typeRow)}
        </div>
      ))}
      <div className="grid gap-1.5 border-t border-line py-2.5" data-testid="ft-own">
        <div className="text-[12px] text-ink-3">Your types</div>
        {tRows.filter((r) => r.own).map(typeRow)}
        <div className="mt-1 flex gap-2">
          <input
            className={input + ' flex-1'}
            maxLength={30}
            value={newT}
            onChange={(e) => setNewT(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addType()
            }}
            placeholder="New type, e.g. Partner call"
            aria-label="New call type name"
          />
          <button type="button" className={ghost} onClick={addType}>
            <Plus size={15} aria-hidden="true" />
            Add type
          </button>
        </div>
      </div>
      <p role="status" aria-live="polite" data-testid="ft-msg" className={`mt-2 min-h-[1.2em] text-[13.5px] ${msg?.bad ? 'text-bad' : 'text-ink-2'}`}>
        {msg?.text ?? ''}
      </p>
    </Dialog>
  )
}
