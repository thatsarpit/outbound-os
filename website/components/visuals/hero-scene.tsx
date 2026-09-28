import type { CSSProperties } from 'react'
import { Camera, Check, CheckCheck, ChevronLeft, Clock3, Mic, Phone, Plus, Video } from 'lucide-react'
import { Logo, LogoTile, type BrandName } from '../brand-logo'

/**
 * The hero: a phone playing the product's promise on a loop.
 *
 * Leads arrive from the sources on the left (light travels along the beams
 * into the phone), the first WhatsApp message goes out, is delivered and
 * read, an email follows, the lead types and replies — and the scheduled
 * follow-ups are cancelled. Then it plays again.
 *
 * Pure CSS: every step is a keyframe on one 16-second cycle, so nothing
 * waits for JavaScript. Under reduced motion the loop does not run and the
 * finished conversation is shown still. Names and times are sample data.
 */

const SOURCES: { brand: BrandName; label: string; x: number; y: number }[] = [
  { brand: 'indiamart', label: 'IndiaMART', x: 7, y: 22 },
  { brand: 'forms', label: 'Website form', x: 3, y: 42 },
  { brand: 'facebook', label: 'Lead Ads', x: 7, y: 62 },
  { brand: 'zapier', label: 'Zapier', x: 3, y: 81 },
]

/* Beam paths in the scene's 640 × 640 coordinate space: from each source
   tile into the phone's left edge. */
const BEAMS = [
  'M 92 150 C 150 150, 160 300, 211 318',
  'M 66 278 C 140 278, 160 318, 211 326',
  'M 92 406 C 150 406, 160 340, 211 334',
  'M 66 528 C 140 528, 170 350, 211 342',
]

export function HeroScene() {
  return (
    <figure
      className="scene"
      aria-label="Sample: a lead from IndiaMART gets a WhatsApp message two seconds after enquiring; when they reply, the scheduled follow-ups are cancelled."
    >
      <svg className="scene__beams" viewBox="0 0 640 640" aria-hidden="true">
        <defs>
          <linearGradient id="beam-grad" x1="0" x2="1">
            <stop offset="0" stopColor="#22c55e" stopOpacity="0" />
            <stop offset="0.5" stopColor="#4ade80" />
            <stop offset="1" stopColor="#a7f3d0" />
          </linearGradient>
        </defs>
        {BEAMS.map((d, i) => (
          <g key={d}>
            <path d={d} className="scene__beam-rail" />
            <path d={d} pathLength={100} className="scene__beam-pulse" style={{ '--i': i } as CSSProperties} />
          </g>
        ))}
      </svg>

      {SOURCES.map((s, i) => (
        <div
          key={s.brand}
          className="scene__source"
          style={{ left: `${s.x}%`, top: `${s.y}%`, '--i': i } as CSSProperties}
          aria-hidden="true"
        >
          <LogoTile brand={s.brand} size={52} />
          <span>{s.label}</span>
        </div>
      ))}

      <div className="phone" aria-hidden="true">
        <div className="phone__screen">
          <div className="phone__status">
            <span className="phone__time">9:41</span>
            <span className="phone__island" />
            <span className="phone__icons">
              <svg viewBox="0 0 18 12" width="17" height="11"><path fill="currentColor" d="M1 9h2v3H1zM5 7h2v5H5zM9 4h2v8H9zM13 1h2v11h-2z" /></svg>
              <svg viewBox="0 0 16 12" width="15" height="11"><path fill="currentColor" d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.4 10.4 0 0 0 8 .4 10.4 10.4 0 0 0 .8 3.3L2 4.6a8.6 8.6 0 0 1 6-2.4Zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.2-1.3A6.7 6.7 0 0 0 8 4 6.7 6.7 0 0 0 3.4 5.8l1.2 1.3c.9-.8 2.1-1.3 3.4-1.3Zm0 3.6c-.6 0-1.1.2-1.5.6L8 11.6l1.5-1.6c-.4-.4-.9-.6-1.5-.6Z" /></svg>
              <svg viewBox="0 0 27 12" width="25" height="11"><rect x=".5" y=".5" width="22" height="11" rx="3.5" fill="none" stroke="currentColor" opacity=".4" /><rect x="2" y="2" width="17" height="8" rx="2" fill="currentColor" /><path d="M24.5 4v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="currentColor" opacity=".45" /></svg>
            </span>
          </div>

          <div className="wa__head">
            <ChevronLeft size={22} className="wa__back" />
            <span className="wa__avatar">DO</span>
            <span className="wa__who">
              <strong>Daniel Okafor</strong>
              <small>
                <span className="wa__online">online</span>
                <span className="wa__typing-label">typing…</span>
              </small>
            </span>
            <Video size={19} />
            <Phone size={17} />
          </div>

          <div className="wa__chat">
            <span className="wa__date">Today</span>

            <p className="wa__sys hs hs--sys">
              <LogoTile brand="indiamart" size={15} />
              New enquiry via IndiaMART · 10:42:03
            </p>

            <div className="wa__msg wa__msg--out hs hs--out">
              Hi Daniel, thanks for your enquiry. We ship to Nigeria — could you share the quantity you need so we can send pricing?
              <span className="wa__meta">
                10:42
                <Check size={14} className="wa__tick wa__tick--one" />
                <CheckCheck size={14} className="wa__tick wa__tick--two" />
              </span>
            </div>

            <div className="wa__slot">
              <div className="wa__msg wa__msg--in wa__typing hs--typing">
                <i />
                <i />
                <i />
              </div>
              <div className="wa__msg wa__msg--in hs hs--in">
                500 units, CIF Lagos. What&rsquo;s your best price?
                <span className="wa__meta">10:51</span>
              </div>
            </div>

            <p className="wa__sys wa__sys--win hs hs--win">
              <Check size={12} strokeWidth={3} />
              Replied · 3 follow-ups cancelled
            </p>
          </div>

          <div className="wa__input">
            <Plus size={20} />
            <span className="wa__field">Message</span>
            <Camera size={19} />
            <Mic size={19} />
          </div>
        </div>
      </div>

      <div className="scene__card scene__card--mail hs hs--mail" aria-hidden="true">
        <LogoTile brand="gmail" size={34} />
        <span>
          <strong>Email sent</strong>
          <small>10:42:06 · from your mailbox</small>
        </span>
      </div>

      <div className="scene__card scene__card--speed hs hs--speed" aria-hidden="true">
        <span className="scene__big">2s</span>
        <small>enquiry → WhatsApp</small>
      </div>

      <div className="scene__card scene__card--follow" aria-hidden="true">
        <span className="scene__clock">
          <Clock3 size={16} />
        </span>
        <span>
          <strong className="hs--strike">Follow-up · Day 1, 09:30</strong>
          <small>in the lead&rsquo;s time zone</small>
        </span>
        <span className="scene__cancel hs hs--cancel">Cancelled</span>
      </div>

      <figcaption className="scene__caption">
        <Logo brand="whatsapp" size={14} /> Sample conversation
      </figcaption>
    </figure>
  )
}
