import { NavLink, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

export function ChannelWorkspace({ channel }: { channel: 'email' | 'whatsapp' }) {
  const canConfigure = useAuthStore((state) => state.hasCapability('page.settings'))
  const base = `/integrations/${channel}`
  const configuration = channel === 'email' ? 'defaults' : 'configure'
  return (
    <div className="space-y-5">
      <nav aria-label={`${channel} sections`} className="flex gap-5 border-b border-border">
        <NavLink
          end
          to={base}
          className={({ isActive }) =>
            cn(
              'border-b-2 pb-2 text-[13px]',
              isActive
                ? 'border-accent font-medium text-text-primary'
                : 'border-transparent text-text-secondary',
            )
          }
        >
          {channel === 'email' ? 'Accounts & inbox' : 'Accounts & health'}
        </NavLink>
        {canConfigure && (
          <NavLink
            to={`${base}/${configuration}`}
            className={({ isActive }) =>
              cn(
                'border-b-2 pb-2 text-[13px]',
                isActive
                  ? 'border-accent font-medium text-text-primary'
                  : 'border-transparent text-text-secondary',
              )
            }
          >
            {channel === 'email' ? 'Sender defaults' : 'Delivery & credentials'}
          </NavLink>
        )}
      </nav>
      <Outlet />
    </div>
  )
}
