import { MovingPage, pageMetadata } from '@/components/moving-page'

export const metadata = pageMetadata('tasks')

export default function Page() {
  return <MovingPage slug="tasks" />
}
