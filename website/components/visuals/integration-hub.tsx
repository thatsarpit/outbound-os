import Link from 'next/link'
import { Logo, LogoTile, type BrandName } from '../brand-logo'
import { ConnectionExplorer } from '../connection-explorer'

const sources = [
  { brand: 'forms', label: 'Website forms', href: '/form-backend', kind: 'Form or webhook', detail: 'Capture the enquiry and consent collected by your form. Keep the source key in a server-side handler where possible.' },
  { brand: 'facebook', label: 'Facebook Lead Ads', href: '/integrations/facebook-lead-ads', kind: 'Via your automation tool', detail: 'Map your Meta instant-form fields through Zapier, Make or n8n into a dedicated Outbound OS lead source.' },
  { brand: 'webhooks', label: 'Webhooks', href: '/integrations/webhooks', kind: 'Your own applications', detail: 'Post structured lead data to a source-specific endpoint. Configure the field map and test intake before enabling outreach.' },
  { brand: 'csv', label: 'CSV import', href: '/integrations/csv-import', kind: 'Your existing contact list', detail: 'Map spreadsheet columns, review the import and merge repeat contacts. Importing records is separate from launching a campaign.' },
] as const
const channels: { brand: BrandName; label: string; detail: string; href: string }[] = [
  { brand: 'whatsapp', label: 'WhatsApp', detail: 'Direct Meta Cloud API', href: '/integrations/whatsapp-cloud-api' },
  { brand: 'gmail', label: 'Email', detail: 'SMTP / IMAP or Brevo', href: '/integrations/email' },
  { brand: 'telegram', label: 'Telegram', detail: 'Your connected account', href: '/integrations/telegram' },
  { brand: 'imessage', label: 'iMessage', detail: 'Through a Mac relay', href: '/integrations/imessage' },
]

/** Logos stay server-rendered; the client only controls the selected source. */
export function IntegrationHub() {
  return <ConnectionExplorer sources={sources.map(({brand,...source}) => ({...source,icon:<LogoTile brand={brand} size={34} />}))}
    channels={<ul className="connection-channels">{channels.map(item => <li key={item.label}><Link href={item.href}><Logo brand={item.brand} size={23} /><span>{item.label}<small>{item.detail}</small></span></Link></li>)}</ul>}
    outputs={<>{([{brand:'sheets',label:'Google Sheets',href:'/integrations/google-sheets'},{brand:'webhooks',label:'Signed events',href:'/integrations/webhooks'},{brand:'mcp',label:'AI agents & MCP',href:'/mcp'}] as const).map(item => <Link href={item.href} key={item.href}><Logo brand={item.brand} size={18} />{item.label}</Link>)}</>} />
}
