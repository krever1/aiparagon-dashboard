'use client'

import { type ReactNode, useState } from 'react'

// The preview's form (go.html's): sending it only says that sign-ups are off here.

export function PreviewForm({ cta, privacy, children }: { cta: string; privacy: string; children: ReactNode }) {
  const [err, setErr] = useState('')
  return (
    <form
      className="lp-f"
      noValidate
      aria-label="Sign up"
      onSubmit={(e) => {
        e.preventDefault()
        setErr('This is a preview, so sign-ups are off.')
      }}
    >
      {children}
      <p className="lp-err" role="alert">
        {err}
      </p>
      <button type="submit" className="lp-btn">
        {cta}
      </button>
      <p className="lp-privacy">
        We use your details to reply and send what you asked for.{' '}
        <a href={privacy} target="_blank" rel="noopener noreferrer">
          Privacy policy
        </a>
      </p>
    </form>
  )
}
