import Link from 'next/link'
import { BrandMark } from '@/components/brand-mark'
import { PUBLIC_SITE } from '@/lib/config'
import { type Page, FIELDS } from '@/lib/pipeline/landing'
import { PreviewForm } from './landing-preview-form'

// A landing page drawn as go.html draws it, for Preview on a page that is not live (the public page shows only live
// pages, and reads a draft only with the current dashboard's own sign-in). The same parts in the same order: the
// preview line, the brand, the top of the page, the form, the sections, the proof, the questions and the footer.

const LABELS: Record<string, string> = Object.fromEntries(FIELDS)
const TYPES: Record<string, string> = { name: 'text', email: 'email', company: 'text', job_title: 'text', phone: 'tel' }
const AUTO: Record<string, string> = { name: 'name', email: 'email', company: 'organization', job_title: 'organization-title', phone: 'tel' }
const KICKER: Record<string, string> = { webinar: 'Webinar', download: 'Download', newsletter_signup: 'Newsletter' }
const PRIVACY = PUBLIC_SITE + '/privacy-policy.html'

function Top({ brand }: { brand: string }) {
  return (
    <header className="lp-top">
      <div className="lp-wrap">
        {/paragon/i.test(brand) ? <BrandMark /> : <span className="lp-mark">{brand.charAt(0) || 'P'}</span>}
        <span className="lp-brand">{brand}</span>
      </div>
    </header>
  )
}

function Foot({ brand }: { brand: string }) {
  return (
    <footer className="lp-foot">
      <div className="lp-wrap">
        <span>
          © {new Date().getFullYear()} {brand}
        </span>
        <a href={PRIVACY} target="_blank" rel="noopener noreferrer">
          Privacy policy
        </a>
      </div>
    </footer>
  )
}

const paras = (t: string) =>
  String(t || '')
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)

export function LandingPreview({ page: p, brand }: { page: Page; brand: string }) {
  const c = p.content
  const meta = (
    [
      ['When', c.when],
      ['With', c.presenter],
      ['For', c.who],
      ['How often', c.how_often],
    ] as const
  ).filter(([, v]) => !!v)
  const keys = (c.fields?.length ? c.fields : ['name', 'email']).filter((k) => LABELS[k])
  if (!keys.includes('email')) keys.push('email')
  const questions = (c.questions ?? []).filter((q) => q && q.key && q.label && !q.off)
  return (
    <div className="lp" data-testid="lp-preview">
      <div className="lp-preview">Preview{p.status !== 'live' ? ', not live yet' : ''}. Sign-ups are off here.</div>
      <Top brand={brand} />
      <main className="lp-main lp-wrap">
        <section className="lp-hero">
          {KICKER[p.kind] ? <span className="lp-kicker">{KICKER[p.kind]}</span> : null}
          <h1>{c.headline || p.title || ''}</h1>
          {c.subheadline ? <p className="lp-sub">{c.subheadline}</p> : null}
          {meta.length ? (
            <div className="lp-meta">
              {meta.map(([k, v]) => (
                <span key={k}>
                  <b>{k} </b>
                  {v}
                </span>
              ))}
            </div>
          ) : null}
          {c.bullets?.length ? (
            <ul className="lp-bullets">
              {c.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : null}
        </section>
        <aside className="lp-side">
          <div className="lp-card" id="lp-form">
            <PreviewForm cta={c.cta || 'Sign up'} privacy={PRIVACY}>
              {keys.map((k) => (
                <div className="lp-field" key={k}>
                  <label htmlFor={'lp-' + k}>
                    {LABELS[k]}
                    {k === 'phone' ? <small>optional</small> : null}
                  </label>
                  <input id={'lp-' + k} name={k} type={TYPES[k] || 'text'} autoComplete={AUTO[k] || 'on'} maxLength={k === 'email' ? 254 : 160} required={k !== 'phone'} />
                </div>
              ))}
              {questions.map((q) => (
                <div className="lp-field" key={q.key}>
                  <label htmlFor={'lp-' + q.key}>
                    {q.label}
                    <small>optional</small>
                  </label>
                  {q.options?.length ? (
                    <select id={'lp-' + q.key} name={q.key} defaultValue="">
                      <option value="">Choose one</option>
                      {q.options.map((o, i) => (
                        <option key={i} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input id={'lp-' + q.key} name={q.key} type="text" maxLength={500} />
                  )}
                </div>
              ))}
            </PreviewForm>
          </div>
        </aside>
        <div className="lp-rest">
          {(c.sections ?? [])
            .filter((s) => s && s.body)
            .map((s, i) => (
              <section className="lp-sec" key={i}>
                {s.title ? <h2>{s.title}</h2> : null}
                {paras(s.body).map((t, j) => (
                  <p key={j}>{t}</p>
                ))}
              </section>
            ))}
          {c.proof?.length ? (
            <section className="lp-proof">
              <ul>
                {c.proof.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {c.faq?.length ? (
            <section className="lp-faq">
              <h2>Questions</h2>
              {c.faq.map((x, i) => (
                <details key={i}>
                  <summary>{x.q}</summary>
                  <p>{x.a}</p>
                </details>
              ))}
            </section>
          ) : null}
        </div>
      </main>
      <Foot brand={brand} />
    </div>
  )
}

/** A page that is not there (deleted, or a link cut short), as go.html says it. */
export function PreviewGone({ brand, error }: { brand: string; error: string | null }) {
  return (
    <div className="lp" data-testid="lp-gone">
      <Top brand={brand} />
      <div className="lp-gone">
        <h1>This page is not available</h1>
        <p>{error ? 'Could not load it: ' + error : 'It may have been deleted, or the link is not complete.'}</p>
        <Link href="/landing-pages">Open Landing pages</Link>
      </div>
      <Foot brand={brand} />
    </div>
  )
}
