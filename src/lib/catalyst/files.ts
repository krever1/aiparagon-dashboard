// A lead's files, as the current dashboard files them (e1FilesSection, e1UploadFile): the stage an upload belongs to,
// what each group is called, and the largest upload. Plain data, for the server and the browser.

export const MAX_UPLOAD = 25 * 1024 * 1024

/** The stages an upload can be filed under (the agent's key; manual is General), in the upload form's order. */
export const FILE_STAGES: { key: string; label: string }[] = [
  { key: 'lead_research', label: 'Prospect brief' },
  { key: 'interview_script', label: 'Consultation guide' },
  { key: 'anonymizer', label: 'Assessment' },
  { key: 'discovery_call', label: 'Follow-up guide' },
  { key: 'growth_plan', label: 'Proposal' },
  { key: 'manual', label: 'General / manual' },
]

/** A group's heading in the list. */
export const FILE_GROUP: Record<string, string> = {
  lead_research: 'Prospect brief',
  interview_script: 'Consultation guide',
  anonymizer: 'Assessment',
  discovery_call: 'Follow-up guide',
  growth_plan: 'Proposal',
  manual: 'General',
}
