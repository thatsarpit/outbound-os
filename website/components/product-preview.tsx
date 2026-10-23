import {
  ArrowUpRight,
  Bell,
  CheckCheck,
  CircleCheck,
  Ellipsis,
  Inbox,
  ListTodo,
  Mail,
  MessageCircle,
  Search,
  Users,
} from 'lucide-react'
import { BrandMark } from './brand-mark'

const contacts = [
  {
    initials: 'JL',
    name: 'Jordan Lee',
    text: 'Could you confirm delivery to Bristol?',
    channel: 'WhatsApp',
    time: '2m',
    active: true,
  },
  {
    initials: 'AM',
    name: 'Alex Morgan',
    text: 'Thanks, the document looks good.',
    channel: 'Email',
    time: '12m',
    active: false,
  },
  {
    initials: 'TC',
    name: 'Taylor Chen',
    text: 'Can we arrange a call tomorrow?',
    channel: 'WhatsApp',
    time: '28m',
    active: false,
  },
]

/** An HTML illustration, with fictional people, rather than a live workspace. */
export function InboxPreview({ mobile = false }: { mobile?: boolean }) {
  if (mobile)
    return (
      <div className="workspace-phone">
        <div className="workspace-phone__island" aria-hidden="true" />
        <div className="workspace-phone__header">
          <BrandMark />
          <strong>Inbox</strong>
          <Bell size={17} aria-hidden="true" />
        </div>
        <div className="workspace-phone__filters">
          <strong>Needs reply</strong>
          <span>All</span>
          <span>Done</span>
        </div>
        <div className="workspace-phone__search">
          <Search size={14} /> Search conversations
        </div>
        <div className="workspace-phone__list">
          {contacts.map((contact) => (
            <div className="workspace-contact" key={contact.initials}>
              <span className="workspace-avatar">{contact.initials}</span>
              <div>
                <strong>
                  {contact.name}
                  <small>{contact.time}</small>
                </strong>
                <p>{contact.text}</p>
                <span className="workspace-channel">
                  {contact.channel === 'Email' ? (
                    <Mail size={11} />
                  ) : (
                    <MessageCircle size={11} />
                  )}
                  {contact.channel}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="workspace-phone__notice">
          <Bell size={15} />
          <span>
            New message?
            <br />
            <strong>Pick up where you left off.</strong>
          </span>
        </div>
        <div className="workspace-phone__nav" aria-hidden="true">
          <span className="is-selected">
            <Inbox size={17} />
            Inbox
          </span>
          <span>
            <ListTodo size={17} />
            Tasks
          </span>
          <span>
            <Users size={17} />
            Leads
          </span>
          <span>
            <Ellipsis size={17} />
            More
          </span>
        </div>
        <div className="workspace-phone__home" aria-hidden="true" />
      </div>
    )
  return (
    <div className="workspace-desktop">
      <div className="workspace-desktop__bar">
        <span>
          <BrandMark />
          <strong>Outbound OS</strong>
        </span>
        <span>
          Shared workspace <span className="workspace-avatar">AB</span>
        </span>
      </div>
      <div className="workspace-desktop__body">
        <aside className="workspace-desktop__rail" aria-hidden="true">
          <Inbox size={19} />
          <Users size={19} />
          <ListTodo size={19} />
          <Ellipsis size={19} />
        </aside>
        <div className="workspace-desktop__conversations">
          <div className="workspace-desktop__heading">
            <strong>Inbox</strong>
            <Search size={16} />
          </div>
          <div className="workspace-desktop__filters">
            <strong>Needs reply</strong>
            <span>All</span>
            <span>Done</span>
          </div>
          {contacts.map((contact) => (
            <div
              className={`workspace-contact ${contact.active ? 'is-selected' : ''}`}
              key={contact.initials}
            >
              <span className="workspace-avatar">{contact.initials}</span>
              <div>
                <strong>
                  {contact.name}
                  <small>{contact.time}</small>
                </strong>
                <p>{contact.text}</p>
                <span className="workspace-channel">
                  {contact.channel === 'Email' ? (
                    <Mail size={11} />
                  ) : (
                    <MessageCircle size={11} />
                  )}
                  {contact.channel}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="workspace-desktop__thread">
          <div className="workspace-desktop__thread-head">
            <span>
              <strong>Jordan Lee</strong>
              <small>WhatsApp · Customer enquiry</small>
            </span>
            <span className="workspace-done">
              <CircleCheck size={14} /> Done
            </span>
          </div>
          <div className="workspace-desktop__messages">
            <span className="workspace-date">Today</span>
            <p className="workspace-bubble workspace-bubble--in">
              Could you confirm delivery to Bristol?<small>10:24</small>
            </p>
            <p className="workspace-bubble workspace-bubble--out">
              Of course. I’ll confirm the delivery options and send them here.
              <small>
                10:26 <CheckCheck size={13} />
              </small>
            </p>
            <span className="workspace-session">
              <CircleCheck size={12} /> Reply window open
            </span>
          </div>
          <div className="workspace-desktop__composer">
            <span>Write your reply…</span>
            <ArrowUpRight size={19} />
          </div>
        </div>
      </div>
    </div>
  )
}
