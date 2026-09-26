import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Compass } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { getFirstAccessibleRoute } from '@/lib/role-shell'
import { Button } from '@/components/ui/button'

/**
 * Not found.
 *
 * Unknown URLs used to bounce silently to whichever page the role lands on, so
 * a mistyped or dead link looked like it had worked and the person never
 * learned the address was wrong. This says what happened, shows the path, and
 * offers a way on.
 */
export default function NotFoundPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { hasCapability, user } = useAuthStore()
  const home = getFirstAccessibleRoute(user?.role, hasCapability)

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-text-muted">
          <Compass aria-hidden="true" className="h-5 w-5" />
        </span>

        <h1 className="mt-4 text-xl font-semibold tracking-tight">This page does not exist</h1>
        <p className="mt-2 text-[13px] leading-5 text-text-secondary">
          Nothing is served at this address. It may have been renamed, or the link that brought you
          here may be out of date.
        </p>

        <p className="mt-3 truncate rounded-md border border-border bg-surface-raised px-3 py-2 font-mono text-xs text-text-muted">
          {location.pathname}
        </p>

        <div className="mt-5 flex items-center justify-center gap-2">
          <Button
            variant="secondary"
            leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}
            onClick={() => navigate(-1)}
          >
            Go back
          </Button>
          <Button asChild>
            <Link to={home}>Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
