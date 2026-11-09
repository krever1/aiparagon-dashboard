// The stand-in's starting rows: made-up people at example.com, never real CRM rows. Each test starts from these
// (POST /__reset), and can replace tables with its own rows (POST /__seed).

export function fixtures() {
  return {
    e1_leads: [],
    agent_outputs: [],
    ai_settings: [],
    hubspot_contacts: [],
    call_meta: [],
    agent_feedback: [],
  }
}
