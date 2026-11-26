import { useQuery } from '@tanstack/react-query'
import { Copy } from 'lucide-react'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/ui/section-card'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'

type BuildInfo = typeof __OUTBOUNDOS_BUILD__
const dashboard = __OUTBOUNDOS_BUILD__
const CHANNEL_LABELS = { release: 'Release', development: 'Development build', local: 'Local build' }

function buildLabel(build: BuildInfo) {
  return `v${build.version} · ${CHANNEL_LABELS[build.channel]}`
}

function BuildDetails({ build }: { build: BuildInfo }) {
  return (
    <>
      <span className="font-medium">{buildLabel(build)}</span>
      {build.revision && (
        <code className="mt-0.5 block text-xs text-text-secondary" title={build.revision}>
          {build.revision.slice(0, 12)}
        </code>
      )}
    </>
  )
}

export function AboutOutboundOS() {
  const scope = useAuthStore((state) => state.dashboardScope)
  const preview = scope === 'demo'
  const server = useQuery({
    queryKey: ['system-version', scope],
    queryFn: async () => (await api.get<BuildInfo>('/system/version')) ?? null,
    enabled: !preview,
    staleTime: 0,
    retry: false,
    meta: { silent: true },
  })
  const apiBuild = server.isError ? null : server.data
  const serverStatus = preview ? 'Sample workspace' : server.isPending ? 'Checking…' : 'Unavailable'
  const differentBuild = apiBuild && (
    dashboard.version !== apiBuild.version ||
    (dashboard.revision && apiBuild.revision && dashboard.revision !== apiBuild.revision)
  )

  async function copyVersionDetails() {
    const describe = (build: BuildInfo) =>
      [buildLabel(build), build.revision].filter(Boolean).join(' · ')
    try {
      await navigator.clipboard.writeText([
        'Outbound OS',
        `Dashboard: ${describe(dashboard)}`,
        `Server: ${apiBuild ? describe(apiBuild) : serverStatus}`,
      ].join('\n'))
      toast.success('Version details copied')
    } catch {
      toast.error('Could not copy version details')
    }
  }

  return (
    <SectionCard
      title="About Outbound OS"
      action={navigator.clipboard && (
        <Button
          variant="secondary"
          size="sm"
          disabled={!preview && server.isPending}
          onClick={() => void copyVersionDetails()}
          leftIcon={<Copy className="size-3.5" aria-hidden="true" />}
        >
          Copy version details
        </Button>
      )}
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-[13px]">
        <dt className="text-text-muted">Dashboard</dt>
        <dd><BuildDetails build={dashboard} /></dd>
        <dt className="text-text-muted">Server</dt>
        <dd>{apiBuild ? <BuildDetails build={apiBuild} /> : serverStatus}</dd>
      </dl>
      {differentBuild && (
        <p className="mt-3 text-xs text-text-secondary">
          The dashboard and server are running different builds.
        </p>
      )}
    </SectionCard>
  )
}
