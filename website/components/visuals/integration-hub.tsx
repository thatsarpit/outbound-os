import Link from 'next/link'
import { brandTitle, LogoTile, type BrandName } from '../brand-logo'

/**
 * Where leads come from, where messages go, and what else hears about it —
 * drawn as the flow it is. Connectors carry a slow moving dash towards the
 * core on the way in and away from it on the way out.
 */

type Node = { brand: BrandName; href: string; label?: string }

const SOURCES: Node[] = [
  { brand: 'forms', href: '/form-backend' },
  { brand: 'facebook', href: '/integrations/facebook-lead-ads', label: 'Facebook Lead Ads' },
  { brand: 'indiamart', href: '/integrations/indiamart' },
  { brand: 'zapier', href: '/integrations/zapier', label: 'Zapier · Make · n8n' },
  { brand: 'engyne', href: '/integrations/engyne-cloud' },
  { brand: 'csv', href: '/integrations/csv-import', label: 'CSV import' },
]

const CHANNELS: Node[] = [
  { brand: 'whatsapp', href: '/integrations/whatsapp-cloud-api', label: 'WhatsApp Cloud API' },
  { brand: 'aisensy', href: '/integrations/aisensy' },
  { brand: 'email', href: '/integrations/email', label: 'Email (SMTP/IMAP)' },
  { brand: 'brevo', href: '/integrations/brevo' },
  { brand: 'telegram', href: '/integrations/telegram' },
  { brand: 'imessage', href: '/integrations/imessage' },
]

const OUTPUTS: Node[] = [
  { brand: 'sheets', href: '/integrations/google-sheets' },
  { brand: 'webhooks', href: '/integrations/webhooks', label: 'Signed webhooks' },
  { brand: 'claude', href: '/mcp', label: 'AI agents (MCP)' },
]

function NodeLink({ node }: { node: Node }) {
  return (
    <Link href={node.href} className="hub__node">
      <LogoTile brand={node.brand} size={32} />
      <span>{node.label ?? brandTitle(node.brand)}</span>
    </Link>
  )
}

export function IntegrationHub() {
  return (
    <div className="hub">
      <div className="hub__side hub__side--in">
        <p className="hub__label">Leads come in from</p>
        <ul>
          {SOURCES.map((node) => (
            <li key={node.href}>
              <NodeLink node={node} />
            </li>
          ))}
        </ul>
      </div>

      <div className="hub__center">
        <div className="hub__core">
          <LogoTile brand="outboundos" size={56} className="hub__core-logo" />
          <strong>Outbound OS</strong>
          <ol className="hub__verbs">
            <li>Captures and de-duplicates</li>
            <li>Replies in seconds</li>
            <li>Follows up on schedule</li>
            <li>Stops when they answer</li>
          </ol>
        </div>
        <div className="hub__outputs">
          <p className="hub__label">And tells</p>
          <ul>
            {OUTPUTS.map((node) => (
              <li key={node.href}>
                <NodeLink node={node} />
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="hub__side hub__side--out">
        <p className="hub__label">Messages go out on</p>
        <ul>
          {CHANNELS.map((node) => (
            <li key={node.href}>
              <NodeLink node={node} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
