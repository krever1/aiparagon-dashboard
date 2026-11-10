// A section of the proposal, edited in place, back to markdown (v132ToMd): paragraphs, lists, small headings, bold
// and italic; anything else keeps its text. Runs in the browser, on the edited elements.

export function toMd(el: Element | null): string {
  if (!el) return ''
  const out: string[] = []
  const inline = (n: Node): string => {
    let s = ''
    n.childNodes.forEach((c) => {
      if (c.nodeType === 3) s += c.nodeValue ?? ''
      else if (c.nodeType === 1) {
        const t = (c as Element).tagName
        if (t === 'STRONG' || t === 'B') {
          const x = inline(c).trim()
          if (x) s += '**' + x + '**'
        } else if (t === 'EM' || t === 'I') {
          const x = inline(c).trim()
          if (x) s += '*' + x + '*'
        } else if (t === 'BR') s += '\n'
        else s += inline(c)
      }
    })
    return s
  }
  const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
  el.childNodes.forEach((n) => {
    if (n.nodeType === 3) {
      const t = flat(n.nodeValue ?? '')
      if (t) out.push(t, '')
      return
    }
    if (n.nodeType !== 1) return
    const e = n as Element
    const t = e.tagName
    if (t === 'UL' || t === 'OL') {
      let k = 0
      for (const li of [...e.children].filter((c) => c.tagName === 'LI')) {
        const x = flat(inline(li))
        if (x) out.push((t === 'OL' ? ++k + '. ' : '- ') + x)
      }
      out.push('')
    } else if (/^H[1-6]$/.test(t)) {
      const x = flat(inline(e))
      if (x) out.push('### ' + x, '')
    } else {
      const x = inline(e).split('\n').map(flat).filter(Boolean).join('\n')
      if (x) out.push(x, '')
    }
  })
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** An edited heading's text, on one line. */
export function lineOf(el: Element | null): string {
  return el ? (el.textContent ?? '').replace(/\s+/g, ' ').trim() : ''
}
