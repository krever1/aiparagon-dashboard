import { AlertTriangle, FileText, Megaphone, MessageSquare, PenLine, Users } from 'lucide-react'
import type { Icon } from '@/lib/touchpoint/approvals'

const ICONS: Record<Icon, typeof FileText> = { file: FileText, megaphone: Megaphone, pen: PenLine, message: MessageSquare, users: Users, alert: AlertTriangle }

/** The icon of a thing waiting on Approvals (a brief, an ad, a draft, a reply…), on Approvals and Today. */
export function ItemIcon({ icon, size = 19 }: { icon: Icon; size?: number }) {
  const I = ICONS[icon]
  return <I size={size} aria-hidden="true" />
}
