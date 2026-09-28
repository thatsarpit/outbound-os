import type { CSSProperties } from 'react'
import { Bell, Check, CheckCheck, Clock3, FileText, Moon, Package, Sun, Truck } from 'lucide-react'
import { Logo, LogoTile, type BrandName } from '../brand-logo'

/**
 * The pictures for "how it works". Each is a small composition of product
 * parts; inside the sticky panel, `.sv-in` elements enter in order (--o) when
 * their step becomes active. Everything is visible at rest. Sample data.
 */

const o = (n: number) => ({ '--o': n }) as CSSProperties

export function CaptureVisual() {
  const sources: { brand: BrandName; label: string; meta: string }[] = [
    { brand: 'indiamart', label: 'IndiaMART', meta: 'Push API' },
    { brand: 'facebook', label: 'Facebook Lead Ads', meta: 'via Zapier' },
    { brand: 'forms', label: 'Website form', meta: 'yoursite.com/contact' },
    { brand: 'zapier', label: 'Zapier · Make · n8n', meta: 'webhook' },
  ]
  return (
    <div className="sv sv-capture">
      <ul className="sv-sources">
        {sources.map((s, i) => (
          <li key={s.label} className="sv-in" style={o(i)}>
            <LogoTile brand={s.brand} size={30} />
            <span>
              <strong>{s.label}</strong>
              <small>{s.meta}</small>
            </span>
          </li>
        ))}
      </ul>
      <div className="sv-arrow sv-in" style={o(4)} />
      <div className="sv-lead sv-in" style={o(5)}>
        <div className="sv-lead__top">
          <span className="sv-avatar">DO</span>
          <span>
            <strong>Daniel Okafor</strong>
            <small>Lagos Medical Supply · Nigeria</small>
          </span>
          <span className="sv-pill sv-pill--hot">HOT</span>
        </div>
        <dl className="sv-fields">
          <div><dt>Wants</dt><dd>500 units, CIF Lagos</dd></div>
          <div><dt>Phone</dt><dd>+234 ••• ••• 4471</dd></div>
          <div><dt>Source</dt><dd>IndiaMART</dd></div>
        </dl>
        <span className="sv-pill sv-pill--merge sv-in" style={o(7)}>
          <Check size={12} strokeWidth={3} /> Duplicate merged
        </span>
      </div>
    </div>
  )
}

export function ContactVisual() {
  return (
    <div className="sv sv-contact">
      <div className="sv-timer sv-in" style={o(0)}>
        <span className="sv-timer__ring" />
        <span className="sv-timer__value tabular">2.1s</span>
        <small>enquiry → first message</small>
      </div>
      <ul className="sv-log">
        <li className="sv-in" style={o(1)}>
          <span className="sv-log__time tabular">10:42:03</span>
          <LogoTile brand="indiamart" size={26} />
          <span>Enquiry received</span>
        </li>
        <li className="sv-in" style={o(2)}>
          <span className="sv-log__time tabular">10:42:05</span>
          <LogoTile brand="whatsapp" size={26} />
          <span>
            Template <code>new_enquiry</code> sent
          </span>
          <CheckCheck size={16} className="sv-read" />
        </li>
        <li className="sv-in" style={o(3)}>
          <span className="sv-log__time tabular">10:42:06</span>
          <LogoTile brand="gmail" size={26} />
          <span>Email sent from sales@</span>
          <Check size={16} className="sv-ok" />
        </li>
        <li className="sv-in" style={o(4)}>
          <span className="sv-log__time tabular">10:42:06</span>
          <LogoTile brand="sheets" size={26} />
          <span>Row added to your sheet</span>
          <Check size={16} className="sv-ok" />
        </li>
      </ul>
    </div>
  )
}

export function FollowVisual() {
  const plan = [
    { day: 'Day 0', when: '10:42', label: 'First contact', done: true },
    { day: 'Day 1', when: '09:30', label: 'Follow-up' },
    { day: 'Day 2', when: '09:30', label: 'Follow-up' },
    { day: 'Day 3', when: '09:30', label: 'Last nudge' },
  ]
  return (
    <div className="sv sv-follow">
      <div className="sv-clocks sv-in" style={o(0)}>
        <span>
          <Sun size={15} /> Lagos <b className="tabular">09:30</b>
        </span>
        <span>
          <Moon size={15} /> You <b className="tabular">14:00</b>
        </span>
      </div>
      <ol className="sv-plan">
        {plan.map((step, i) => (
          <li key={step.day} className={['sv-in', step.done ? 'is-done' : ''].join(' ')} style={o(i + 1)}>
            <span className="sv-plan__dot">{step.done ? <Check size={12} strokeWidth={3} /> : <Clock3 size={12} />}</span>
            <span className="sv-plan__day">{step.day}</span>
            <span className="sv-plan__label">{step.label}</span>
            <span className="sv-plan__when tabular">{step.when} their time</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function ReplyVisual() {
  return (
    <div className="sv sv-reply">
      <div className="sv-bubble sv-in" style={o(0)}>
        <Logo brand="whatsapp" size={16} />
        <span>500 units, CIF Lagos. What&rsquo;s your best price?</span>
      </div>
      <ul className="sv-cancel">
        {['Day 1 · follow-up', 'Day 2 · follow-up', 'Day 3 · last nudge'].map((label, i) => (
          <li key={label} className="sv-in" style={o(i + 1)}>
            <s>{label}</s>
            <span className="sv-pill sv-pill--stop">Cancelled</span>
          </li>
        ))}
      </ul>
      <div className="sv-stage sv-in" style={o(4)}>
        <span className="sv-stage__from">Contacted</span>
        <span className="sv-stage__arrow" />
        <span className="sv-stage__to">Replied</span>
      </div>
      <div className="sv-notify sv-in" style={o(5)}>
        <Bell size={15} /> In the inbox and the notification bell
      </div>
    </div>
  )
}

export function CloseVisual() {
  return (
    <div className="sv sv-close">
      <div className="sv-order sv-in" style={o(0)}>
        <div className="sv-order__head">
          <strong>Order #1042</strong>
          <span className="sv-pill sv-pill--ok">Confirmed</span>
        </div>
        <p>Lagos Medical Supply · 500 units</p>
        <div className="sv-order__total">
          <span>Total</span>
          <b className="tabular">$9,400</b>
        </div>
      </div>
      <ol className="sv-track">
        <li className="sv-in is-done" style={o(1)}>
          <FileText size={15} /> Invoice INV-1042 sent
        </li>
        <li className="sv-in is-done" style={o(2)}>
          <Package size={15} /> Packed
        </li>
        <li className="sv-in is-now" style={o(3)}>
          <Truck size={15} /> Shipped · update sent on WhatsApp
        </li>
      </ol>
    </div>
  )
}
