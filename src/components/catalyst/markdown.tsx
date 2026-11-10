import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// The agents' markdown, drawn safely: raw HTML is left out (the current dashboard passed it through), a link whose
// address is not safe is plain text, and every link opens in a new tab.

const link: Components['a'] = ({ node, href, children, ...p }) => {
  void node
  if (!href) return <span>{children}</span>
  return (
    <a {...p} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

const BLOCK: Components = { a: link }
const INLINE: Components = { a: link, p: ({ children }) => <>{children}</> }

export function Md({ children, inline = false, className = '' }: { children: string; inline?: boolean; className?: string }) {
  if (inline) {
    return (
      <Markdown remarkPlugins={[remarkGfm]} components={INLINE} skipHtml>
        {children}
      </Markdown>
    )
  }
  return (
    <div className={'md ' + className}>
      <Markdown remarkPlugins={[remarkGfm]} components={BLOCK} skipHtml>
        {children}
      </Markdown>
    </div>
  )
}
