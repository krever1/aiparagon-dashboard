import { createHash } from 'node:crypto'
import { type Lead, leadEmails } from './leads'

// A lead's address word, worked out on the server (node:crypto keeps it out of the browser's code).

const hash = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 10)

/**
 * A lead's address word: its name, then a short code from its email ("pat-qa-1f2e3d4c5b"), so emails stay out of
 * addresses. Any of the lead's emails finds it, so the address holds when another row of the same person is added.
 */
export function leadId(lead: Pick<Lead, 'prospect_name' | 'email'>): string {
  const name = String(lead.prospect_name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return (name || 'lead') + '-' + hash(lead.email)
}

/** The lead an address word names, or null. */
export function findLead(leads: Lead[], id: string): Lead | null {
  const code = /-([0-9a-f]{10})$/.exec(String(id))?.[1]
  if (!code) return null
  return leads.find((l) => leadEmails(l).some((e) => hash(e) === code)) ?? null
}
