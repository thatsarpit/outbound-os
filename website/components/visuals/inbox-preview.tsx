import { getChannelMeta } from '@/lib/channel-meta'

/**
 * The unified inbox, rendered as real markup.
 *
 * Not a screenshot and not a stock mockup — the product's own interface built
 * from the same tokens the dashboard uses, so what a visitor sees is what they
 * get. The site this replaced used a stock image of a fictional CRM, which is
 * a lie; drawing your own UI accurately is not.
 *
 * Schematic on purpose: enough to recognise the shape of the product — three
 * channels in one queue, ownership, reply state — without claiming to be a
 * pixel-accurate capture of a build that keeps changing.
 */

type Row = {
  name: string
  company: string
  channel: 'whatsapp' | 'email' | 'indiamart'
  preview: string
  time: string
  unread?: boolean
  owner: string
  state: 'replied' | 'awaiting' | 'new'
}

const ROWS: Row[] = [
  { name: 'Daniel Okafor', company: 'Lagos Medical Supply', channel: 'whatsapp',
    preview: 'Can you share pricing for 500 units?', time: '2m', unread: true, owner: 'PS', state: 'new' },
  { name: 'Sarah Whitfield', company: 'Northwind Pharma', channel: 'email',
    preview: 'Re: Quotation for Q3 supply agreement', time: '18m', owner: 'AR', state: 'awaiting' },
  { name: 'Rohan Mehta', company: 'Meridian Distributors', channel: 'indiamart',
    preview: 'Enquiry: Paracetamol IP 500mg — 10,000 units', time: '1h', unread: true, owner: 'PS', state: 'new' },
  { name: 'Elena Fischer', company: 'Adler Handel GmbH', channel: 'email',
    preview: 'Thanks — sending the PO across today.', time: '3h', owner: 'AR', state: 'replied' },
]

const STATE_LABEL: Record<Row['state'], string> = {
  replied: 'Replied',
  awaiting: 'Awaiting reply',
  new: 'Needs first reply',
}

export function InboxPreview({ className }: { className?: string }) {
  return (
    <div className={['ui', className].filter(Boolean).join(' ')} aria-hidden="true">
      {/* A window frame reads as "this is software" faster than any caption,
          and costs three elements. */}
      <div className="ui__bar">
        <span className="ui__dots"><i /><i /><i /></span>
        <span className="ui__title">Inbox — all channels</span>
        <span className="ui__count tabular">4</span>
      </div>

      <ul className="ui__rows">
        {ROWS.map((row, i) => {
          const ch = getChannelMeta(row.channel)
          return (
            <li
              key={row.name}
              className="ui__row"
              data-unread={row.unread || undefined}
              style={{ '--i': i } as React.CSSProperties}
            >
              <span className="ui__unread" data-on={row.unread || undefined} />
              <span className="ui__channel" style={{ color: `var(${ch.token})` }}>{ch.glyph}</span>
              <span className="ui__body">
                <span className="ui__line">
                  <strong className="ui__name">{row.name}</strong>
                  <span className="ui__company">{row.company}</span>
                  <span className="ui__time tabular">{row.time}</span>
                </span>
                <span className="ui__preview">{row.preview}</span>
                <span className="ui__state" data-state={row.state}>{STATE_LABEL[row.state]}</span>
              </span>
              <span className="ui__owner">{row.owner}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
