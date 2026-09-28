'use client'

import { useState } from 'react'

import { site } from '@/lib/site-content'

/**
 * Demo request form.
 *
 * The previous site had three differently-worded calls to action — "Request
 * Access", "Request Access for Walkthrough", "Check workflow fit" — all
 * landing on one form that captured no intent, so every lead arrived
 * identical and unqualified.
 *
 * This asks the four things that decide whether a demo is worth booking and
 * what to show in it: role, team size, where enquiries come from now, and
 * monthly volume. Only work email and company are required — the API rejects
 * a submission without them, and a form that demands everything gets
 * abandoned.
 *
 * Submissions post to the CRM's own public intake, so a demo request becomes
 * a lead in the product it is asking about. mailto survives as the fallback:
 * the site is a static export on a different origin to the API, so a DNS
 * change, a CORS miss or the API simply being down would otherwise lose the
 * lead silently. Falling back is worse UX than a clean success and far better
 * than a form that swallows enquiries.
 */

const SOURCES = ['WhatsApp', 'Email', 'Website form', 'IndiaMART', 'Other marketplaces', 'Referrals / manual', 'Other'] as const

type Status =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'sent' }
  | { state: 'error'; message: string }

export function DemoForm({ toEmail }: { toEmail: string }) {
  const [sources, setSources] = useState<string[]>([])
  const [status, setStatus] = useState<Status>({ state: 'idle' })

  const toggleSource = (s: string) =>
    setSources((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const get = (k: string) => String(data.get(k) ?? '').trim()

    const summary = [
      `Name: ${get('name')}`,
      `Work email: ${get('email')}`,
      `Company: ${get('company')}`,
      `Role: ${get('role') || '—'}`,
      `Team size: ${get('teamSize') || '—'}`,
      `Interested in: ${get('plan') || '—'}`,
      `Enquiry sources: ${sources.length ? sources.join(', ') : '—'}`,
      `Enquiries per month: ${get('volume') || '—'}`,
      '',
      'What they want to solve:',
      get('context') || '—',
    ].join('\n')

    const openMailto = () => {
      window.location.href = `mailto:${toEmail}?subject=${encodeURIComponent(
        `Outbound OS enquiry — ${get('company') || get('name')}`,
      )}&body=${encodeURIComponent(summary)}`
    }

    setStatus({ state: 'sending' })
    try {
      const response = await fetch(`${site.apiUrl}/api/public/request-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: get('name'),
          workEmail: get('email'),
          company: get('company'),
          role: get('role'),
          teamSize: get('teamSize'),
          monthlyLeadVolume: get('volume'),
          primaryChannel: sources.join(', '),
          notes: [get('plan') && `Interested in: ${get('plan')}`, get('context')]
            .filter(Boolean)
            .join('\n\n'),
          source: 'website',
        }),
      })

      if (response.ok) {
        setStatus({ state: 'sent' })
        return
      }

      // 422 and 429 are the API telling us something actionable, so show it
      // rather than bouncing the visitor into a mail client they may not have.
      if (response.status === 422 || response.status === 429) {
        const payload = await response.json().catch(() => null)
        setStatus({
          state: 'error',
          message: payload?.error || 'That submission was rejected. Please check the form and try again.',
        })
        return
      }
      openMailto()
    } catch {
      // Network failure, CORS rejection, API down. Never drop the enquiry.
      openMailto()
    }
  }

  if (status.state === 'sent') {
    return (
      <div className="form" role="status" aria-live="polite">
        <p className="form__note">
          <strong>Request received.</strong> We will come back to you at the address you
          gave, usually within one working day.
        </p>
      </div>
    )
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form__row">
        <label className="field">
          <span className="field__label">Name</span>
          <input className="field__input" name="name" required autoComplete="name" />
        </label>
        <label className="field">
          <span className="field__label">Work email</span>
          <input
            className="field__input"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
        </label>
      </div>

      <div className="form__row">
        <label className="field">
          <span className="field__label">Company</span>
          <input className="field__input" name="company" required autoComplete="organization" />
        </label>
        <label className="field">
          <span className="field__label">Your role</span>
          <select className="field__input" name="role" defaultValue="">
            <option value="">Select</option>
            <option>Founder / owner</option>
            <option>Sales leader</option>
            <option>Sales representative</option>
            <option>Customer operations</option>
            <option>Operations</option>
            <option>Other</option>
          </select>
        </label>
      </div>

      <div className="form__row">
        <label className="field">
          <span className="field__label">Sales team size</span>
          <select className="field__input" name="teamSize" defaultValue="">
            <option value="">Select</option>
            <option>Just me</option>
            <option>2–5</option>
            <option>6–15</option>
            <option>16+</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">Customer conversations per month</span>
          <select className="field__input" name="volume" defaultValue="">
            <option value="">Select</option>
            <option>Under 100</option>
            <option>100–500</option>
            <option>500–2,000</option>
            <option>Over 2,000</option>
          </select>
        </label>
      </div>

      <label className="field">
        <span className="field__label">
          What would help <span className="field__optional">Optional</span>
        </span>
        <select className="field__input" name="plan" defaultValue="">
          <option value="">Not sure yet</option>
          <option>Managed hosting</option>
          <option>Help setting up my own install</option>
          <option>A walkthrough of the product</option>
        </select>
      </label>

      {/* Multi-select rather than a dropdown: most teams use several at once,
          and which combination they use changes what the demo should show. */}
      <fieldset className="field">
        <legend className="field__label">Where do customer conversations reach you today?</legend>
        <div className="chips">
          {SOURCES.map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              aria-pressed={sources.includes(s)}
              onClick={() => toggleSource(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span className="field__label">
          What would you want it to fix first? <span className="field__optional">Optional</span>
        </span>
        <textarea className="field__input" name="context" rows={4} />
      </label>

      <div className="form__footer">
        <button type="submit" className="btn btn--primary btn--lg" disabled={status.state === 'sending'}>
          {status.state === 'sending' ? 'Sending…' : 'Send'}
        </button>
        {status.state === 'error' ? (
          <p className="form__note form__note--error" role="alert">
            {status.message}
          </p>
        ) : (
          <p className="form__note">
            Goes straight to our team. We reply from a person, usually within one working day.
          </p>
        )}
      </div>
    </form>
  )
}
