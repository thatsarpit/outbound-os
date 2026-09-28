import { Check, CheckCheck, Clock3, Mail } from 'lucide-react'
import { LogoTile } from '../brand-logo'

/**
 * The product's promise as one conversation, played once on load.
 *
 * A lead arrives from a marketplace, the first WhatsApp message goes out two
 * seconds later, an email follows, a follow-up is booked for the lead's
 * morning — and the moment they reply, the chase is called off. Each step is
 * something the software actually does; the names and times are sample data.
 *
 * Every element has a visible resting state. The entrance animation only
 * runs when motion is allowed, and the illustration is complete without it.
 */
export function FirstTouch({ className }: { className?: string }) {
  return (
    <figure className={['ft', className].filter(Boolean).join(' ')} aria-label="Sample conversation: a new lead is messaged on WhatsApp two seconds after enquiring, and their reply cancels the scheduled follow-ups.">
      <div className="ft__glow" aria-hidden="true" />

      <div className="ft__phone" aria-hidden="true">
        <div className="ft__head">
          <span className="ft__avatar">DO</span>
          <span className="ft__who">
            <strong>Daniel Okafor</strong>
            <small>Lagos Medical Supply</small>
          </span>
          <LogoTile brand="whatsapp" size={26} />
        </div>

        <div className="ft__chat">
          <p className="ft__system ft__step" style={{ '--d': '0.2s' } as React.CSSProperties}>
            <LogoTile brand="indiamart" size={16} />
            New enquiry via IndiaMART · 10:42:03
          </p>

          <div className="ft__bubble ft__bubble--out ft__step" style={{ '--d': '0.9s' } as React.CSSProperties}>
            Hi Daniel, thanks for your enquiry. We ship to Nigeria — could you share the quantity you need so we can send pricing?
            <span className="ft__meta">
              10:42:05 <CheckCheck size={14} className="ft__ticks" />
            </span>
          </div>

          <div className="ft__bubble ft__bubble--in ft__step" style={{ '--d': '2.1s' } as React.CSSProperties}>
            500 units, CIF Lagos. What&rsquo;s your best price?
            <span className="ft__meta">10:51</span>
          </div>

          <p className="ft__system ft__system--win ft__step" style={{ '--d': '2.7s' } as React.CSSProperties}>
            <Check size={13} strokeWidth={3} />
            Replied — 3 scheduled follow-ups cancelled
          </p>
        </div>
      </div>

      {/* Side notes: what happened off-screen, pinned to the conversation. */}
      <div className="ft__notes" aria-hidden="true">
        <div className="ft__note ft__note--speed ft__step" style={{ '--d': '1.3s' } as React.CSSProperties}>
          <span className="ft__note-big tabular">2 s</span>
          <span>from enquiry to WhatsApp</span>
        </div>

        <div className="ft__note ft__note--mail ft__step" style={{ '--d': '1.6s' } as React.CSSProperties}>
          <Mail size={14} />
          <span>Email sent · 10:42:06</span>
        </div>

        <div className="ft__note ft__note--clock ft__step" style={{ '--d': '1.9s' } as React.CSSProperties}>
          <Clock3 size={14} />
          <span>
            <s>Follow-up · 09:30 Lagos time</s>
          </span>
        </div>
      </div>

      <figcaption className="ft__caption">Sample conversation</figcaption>
    </figure>
  )
}
