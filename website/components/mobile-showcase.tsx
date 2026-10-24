import { ArrowUpRight, Bell, CheckCheck, Inbox, Smartphone } from 'lucide-react'
import { site } from '@/lib/site-content'

/** Unmodified screenshots from the sample app, with room to read a message. */
export function MobileShowcase() {
  return (
    <div className="mobile-proof">
      <div className="mobile-proof__copy" data-reveal>
        <p className="eyebrow"><Smartphone size={14} aria-hidden="true" /> The same workspace. In your pocket.</p>
        <h2>Step away from your desk.<br /><span>Stay in the conversation.</span></h2>
        <p>A focused sales workspace for the work that can&rsquo;t wait. Read a reply, check the customer&rsquo;s context and move the conversation forward.</p>
        <ul>
          <li><Inbox size={18} /><span><strong>Start with what needs you.</strong> WhatsApp and email replies in one queue.</span></li>
          <li><CheckCheck size={18} /><span><strong>Reply with the full picture.</strong> Message history, delivery status and the WhatsApp reply window.</span></li>
          <li><Bell size={18} /><span><strong>Keep the next step close.</strong> Follow-ups, leads and device notification settings.</span></li>
        </ul>
        <a href={site.mobileDemoUrl} className="btn btn--primary">Try the mobile workspace <ArrowUpRight size={15} /></a>
        <small>Runs in your browser. Add to your Home Screen on iPhone. Notifications require device permission and supported browser settings.</small>
      </div>
      <div className="mobile-proof__screens" data-reveal>
        <figure className="device device--queue"><img src={`/screenshots/mobile-inbox.webp?v=${site.screenshotVersion}`} width={390} height={844} loading="lazy" decoding="async" alt="Dark Outbound OS mobile inbox with Needs reply, Waiting and Done filters and Inbox, Tasks, Leads and More navigation" /><figcaption>Find the next reply.</figcaption></figure>
        <figure className="device device--thread"><img src={`/screenshots/mobile-conversation.webp?v=${site.screenshotVersion}`} width={390} height={844} loading="lazy" decoding="async" alt="Dark Outbound OS mobile conversation showing the reply window, file attachments, delivery receipts and reply composer" /><figcaption>Keep the context.</figcaption></figure>
      </div>
    </div>
  )
}
