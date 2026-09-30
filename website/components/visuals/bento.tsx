import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { ArrowUpRight, Lock, ShieldCheck } from 'lucide-react'
import { Logo, LogoTile, type BrandName } from '../brand-logo'
import { mcpToolCount } from '@/lib/mcp-tools'

/**
 * The feature grid. Each tile is a working miniature of the product part it
 * names, with one small loop that shows what it does. Sample data; every
 * element is visible when motion is off.
 */

const o = (n: number) => ({ '--o': n }) as CSSProperties

function Tile({
  className,
  title,
  body,
  href,
  children,
}: {
  className?: string
  title: string
  body: string
  href: string
  children: ReactNode
}) {
  return (
    <Link href={href} className={['bento__tile', className].filter(Boolean).join(' ')}>
      <div className="bento__art" aria-hidden="true">
        {children}
      </div>
      <div className="bento__copy">
        <h3>
          {title}
          <ArrowUpRight size={15} aria-hidden="true" />
        </h3>
        <p>{body}</p>
      </div>
    </Link>
  )
}

const INBOX: { brand: BrandName; name: string; line: string; time: string; unread?: boolean }[] = [
  { brand: 'whatsapp', name: 'Daniel Okafor', line: '500 units, CIF Lagos. Best price?', time: '10:51', unread: true },
  { brand: 'gmail', name: 'Sarah Whitfield', line: 'Re: Quotation for the Q3 order', time: '10:32' },
  { brand: 'telegram', name: 'Mehmet Kaya', line: 'Can you ship to Istanbul?', time: '09:58', unread: true },
  { brand: 'imessage', name: 'Emily Carter', line: 'Thanks — sending the PO today.', time: '09:14' },
]

export function Bento() {
  return (
    <div className="bento">
      <Tile
        className="bento__tile--wide bento__tile--inbox"
        title="One inbox for every channel"
        body="WhatsApp, email, Telegram and iMessage threads on the lead they belong to, with an owner and a status."
        href="/capabilities#messaging"
      >
        <ul className="b-inbox">
          {INBOX.map((row, i) => (
            <li key={row.name} className="b-in" style={o(i)} data-unread={row.unread ? 'true' : undefined}>
              <LogoTile brand={row.brand} size={30} />
              <span className="b-inbox__text">
                <strong>{row.name}</strong>
                <small>{row.line}</small>
              </span>
              <span className="b-inbox__time tabular">{row.time}</span>
            </li>
          ))}
        </ul>
      </Tile>

      <Tile
        title="Templates that fill themselves"
        body="Approved WhatsApp templates, filled with each lead’s name and country."
        href="/docs/whatsapp-cloud-api#template"
      >
        <div className="b-template">
          <span className="b-template__name">
            <Logo brand="whatsapp" size={14} /> new_enquiry · approved
          </span>
          <p>
            Hi{' '}
            <span className="b-var">
              <span className="b-var__a">{'{{1}}'}</span>
              <span className="b-var__b">Daniel</span>
            </span>
            , thanks for your enquiry. We ship to{' '}
            <span className="b-var">
              <span className="b-var__a">{'{{2}}'}</span>
              <span className="b-var__b">Nigeria</span>
            </span>{' '}
            — how many units do you need?
          </p>
        </div>
      </Tile>

      <Tile title="A pipeline that moves itself" body="Leads move from new to contacted to replied as the conversation does." href="/capabilities#qualification">
        <div className="b-kanban">
          {[
            { col: 'New', leads: ['Amara D.', 'Lucas F.'] },
            { col: 'Contacted', leads: ['Mei Lin T.', 'Arjun K.'] },
            { col: 'Replied', leads: ['Kwame M.', 'Sofia R.'] },
          ].map(({ col, leads }) => (
            <div key={col} className="b-kanban__col">
              <span>{col}</span>
              {leads.map((lead) => (
                <i key={lead}>{lead}</i>
              ))}
            </div>
          ))}
          <div className="b-kanban__card">
            <LogoTile brand="indiamart" size={16} />
            Daniel O.
          </div>
        </div>
      </Tile>

      <Tile title="Reports you can read" body="Reply rate, pipeline and campaign results, per number and per template." href="/capabilities#reporting">
        <div className="b-chart">
          <div className="b-chart__head">
            <span>Reply rate</span>
            <b className="tabular">22.8%</b>
          </div>
          <svg viewBox="0 0 220 70" preserveAspectRatio="none">
            <defs>
              <linearGradient id="b-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#22c55e" stopOpacity="0.28" />
                <stop offset="1" stopColor="#22c55e" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0 58 L22 52 L44 55 L66 44 L88 46 L110 34 L132 38 L154 26 L176 29 L198 16 L220 12 L220 70 L0 70 Z" fill="url(#b-fill)" className="b-chart__area" />
            <path d="M0 58 L22 52 L44 55 L66 44 L88 46 L110 34 L132 38 L154 26 L176 29 L198 16 L220 12" pathLength={100} className="b-chart__line" />
          </svg>
        </div>
      </Tile>

      <Tile title="Your server, your data" body="One Docker command. SQLite in a volume, credentials encrypted, backups included." href="/self-hosted-crm">
        <div className="b-server">
          <LogoTile brand="docker" size={46} />
          <span className="b-server__link" />
          <span className="b-server__box">
            <ShieldCheck size={20} />
          </span>
          <span className="b-server__lock">
            <Lock size={12} /> AES-256-GCM
          </span>
        </div>
      </Tile>
      <Tile
        className="bento__tile--wide bento__tile--night"
        title="An AI agent can run the desk"
        body={`The MCP server gives Claude and other agents ${mcpToolCount} tools on your live CRM — with your approval on anything that sends.`}
        href="/mcp"
      >
        <div className="b-term">
          <div className="b-term__bar">
            <LogoTile brand="claude" size={18} />
            <span>Claude · connected to Outbound OS</span>
          </div>
          <p className="b-term__line b-in" style={o(0)}>
            <span className="b-term__you">you</span> Who from the trade show hasn&rsquo;t replied?
          </p>
          <p className="b-term__line b-term__tool b-in" style={o(1)}>
            ⏺ list_leads<span>(tags: &quot;expo_2026&quot;, status: &quot;contacted&quot;)</span>
          </p>
          <p className="b-term__line b-term__tool b-in" style={o(2)}>
            ⏺ create_campaign<span>(name: &quot;Expo follow-up&quot;, channel: &quot;whatsapp&quot;)</span>
          </p>
          <p className="b-term__line b-in" style={o(3)}>
            <span className="b-term__ok">✓</span> 14 leads. Draft campaign ready for your review.
            <span className="b-caret" />
          </p>
        </div>
      </Tile>

      <Tile title="Orders, invoices, shipments" body="A won lead becomes an order on the same record — invoiced, shipped and updated on WhatsApp." href="/capabilities#orders">
        <div className="b-invoice">
          <div className="b-invoice__head">
            <strong>INV-1042</strong>
            <small>Lagos Medical Supply</small>
          </div>
          <ul>
            <li>
              <span>500 units</span>
              <span className="tabular">$9,000</span>
            </li>
            <li>
              <span>Freight, CIF Lagos</span>
              <span className="tabular">$400</span>
            </li>
          </ul>
          <div className="b-invoice__total">
            <span>Total</span>
            <b className="tabular">$9,400</b>
          </div>
          <span className="b-stamp">Paid</span>
        </div>
      </Tile>
    </div>
  )
}
