import {
  BookOpen, Building, CircleCheck, CircleUser, Copy, FileText, FlaskConical, Folder, Funnel, Globe, History, House,
  Inbox, Layers, LayoutDashboard, Lightbulb, type LucideProps, Megaphone, MessageCircle, PanelsTopLeft, Pen, Plug,
  Radar, Repeat, Rocket, ScrollText, SlidersHorizontal, Sparkles, Sun, User, Users,
} from 'lucide-react'
import type { IconName } from '@/lib/nav'

const ICONS: Record<IconName, React.ComponentType<LucideProps>> = {
  house: House, lightbulb: Lightbulb, pen: Pen, funnel: Funnel, globe: Globe, sliders: SlidersHorizontal,
  'user-circle': CircleUser, sun: Sun, inbox: Inbox, 'circle-check': CircleCheck, overview: LayoutDashboard,
  users: Users, user: User, message: MessageCircle, layers: Layers, radar: Radar, megaphone: Megaphone,
  'file-text': FileText, repeat: Repeat, rocket: Rocket, panels: PanelsTopLeft, flask: FlaskConical, history: History,
  book: BookOpen, folder: Folder, building: Building, copy: Copy, plug: Plug, sparkles: Sparkles, scroll: ScrollText,
}

/** The sidebar's icons (Lucide, the same family the current dashboard draws by hand). */
export function Icon({ name, size = 19, ...rest }: { name: IconName; size?: number } & LucideProps) {
  const C = ICONS[name]
  return <C size={size} strokeWidth={1.75} aria-hidden="true" {...rest} />
}
