import { Link } from 'react-router-dom'
import { ArrowLeft, Share } from 'lucide-react'

export default function MobileInstallPage() {
  return (
    <div className="space-y-5">
      <Link
        to="/m/inbox"
        className="inline-flex min-h-11 items-center gap-2 text-sm text-text-secondary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to inbox
      </Link>
      <div className="rounded-xl border border-border bg-surface p-5">
        <img
          src="/apple-touch-icon.png?v=2"
          width="64"
          height="64"
          alt="Outbound OS app icon"
          className="mb-4 rounded-2xl"
        />
        <h2 className="text-lg font-semibold">Outbound OS on your iPhone</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Keep your sales workspace on the Home Screen. It runs as a web app and stays connected to
          your CRM server.
        </p>
        <ol className="mt-5 space-y-4 text-sm leading-6">
          <li>
            <span className="font-semibold">1. Open this site in Safari.</span>
          </li>
          <li>
            <span className="font-semibold">2. Tap Share</span>{' '}
            <Share className="inline h-4 w-4 text-accent" aria-hidden="true" /> and choose Add to
            Home Screen.
          </li>
          <li>
            <span className="font-semibold">3. Keep Open as Web App enabled</span> if Safari shows
            that option, then tap Add.
          </li>
          <li>
            <span className="font-semibold">4. Open the new icon and sign in.</span>
          </li>
        </ol>
        <p className="mt-5 rounded-lg border border-border bg-surface-raised p-3 text-sm leading-6 text-text-secondary">
          Already have a generic letter icon? Remove the old Home Screen shortcut, reload this site
          in Safari, and add it again. Safari keeps the icon chosen when a shortcut was installed.
        </p>
        <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-text-muted">
          An internet connection is required to load conversations and send. Drafts stay on this
          device. After installation, open Account → Device notifications to enable alerts for new
          customer messages.
        </p>
      </div>
    </div>
  )
}
