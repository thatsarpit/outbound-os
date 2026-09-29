import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BarChart3, MessageCircleMore, ReceiptText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** True in the public demo build (`vite build --mode demo`). */
export const IS_DEMO = import.meta.env.MODE === 'demo'

const INSTALL_URL = 'https://outboundos.space/docs/install?ref=demo'
const WELCOME_KEY = 'outboundos_demo_welcomed'

/** The top-bar reminder that this is sample data, with the way out to a real install. */
export function DemoBadge() {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden items-center gap-1.5 rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[11px] font-medium text-text-secondary sm:inline-flex">
        <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
        Live demo · sample data, nothing is sent
      </span>
      <a
        href={INSTALL_URL}
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-accent px-2.5 text-xs font-medium text-accent-fg transition-colors hover:bg-accent-hover"
      >
        Install free
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </a>
    </div>
  )
}

const TRY = [
  {
    to: '/inbox?leadId=1',
    Icon: MessageCircleMore,
    title: 'Reply to Rohan on WhatsApp',
    text: 'Send a message or a file. Watch the ticks turn blue, then read his answer.',
  },
  {
    to: '/pipeline',
    Icon: BarChart3,
    title: 'Walk the pipeline',
    text: 'Every lead from first message to closed, with who replied and when.',
  },
  {
    to: '/settings/whatsapp',
    Icon: ReceiptText,
    title: 'See what WhatsApp costs',
    text: 'Paid and free messages from Meta’s own pricing data, by category.',
  },
]

function alreadyWelcomed() {
  try {
    return sessionStorage.getItem(WELCOME_KEY) === '1'
  } catch {
    return false
  }
}

/** Shown once per visit: what this is, and three things worth trying. */
export function DemoWelcome() {
  const [open, setOpen] = useState(() => !alreadyWelcomed())
  const close = () => {
    setOpen(false)
    try {
      sessionStorage.setItem(WELCOME_KEY, '1')
    } catch {
      /* storage blocked: the card simply shows again next time */
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Welcome to the Outbound OS demo</DialogTitle>
          <DialogDescription>
            This is the real dashboard, running on sample data for a made-up company, Acme
            Supplies. Click anything. Nothing is saved and no message leaves your browser.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-2">
          {TRY.map(({ to, Icon, title, text }) => (
            <Link
              key={to}
              to={to}
              onClick={close}
              className="group flex items-start gap-3 rounded-md border border-border p-3 transition-colors hover:border-border-strong hover:bg-surface-raised"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium text-text-primary">{title}</span>
                <span className="text-xs text-text-muted">{text}</span>
              </span>
              <ArrowRight
                className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          ))}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" asChild>
            <a href={INSTALL_URL}>Install it on your server</a>
          </Button>
          <Button onClick={close}>Explore on my own</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
