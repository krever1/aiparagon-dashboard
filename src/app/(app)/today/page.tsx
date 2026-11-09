import { MovingPage, pageMetadata } from '@/components/moving-page'

export const metadata = pageMetadata('today')

export default function Page() {
  return <MovingPage slug="today" />
}
