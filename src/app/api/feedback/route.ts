import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { readFeedback } from '@/lib/touchpoint/feedback-load'

// GET /api/feedback: the feedback notes for the top bar's Feedback (v144), as the signed-in teammate.
export async function GET() {
  if (!(await getCurrentUser())) return NextResponse.json({ ok: false, error: 'You are signed out. Sign in again.' }, { status: 401 })
  return NextResponse.json(await readFeedback(), { headers: { 'cache-control': 'no-store' } })
}
