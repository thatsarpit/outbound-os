import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth, useOrganizationList } from '@clerk/react'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { workspaceBase, workspaceHome, workspaceId } from '@/lib/workspace-path'

interface Workspace {
  id: string
  name: string
  organizationId: string
}

const WorkspaceContext = createContext<{
  active: Workspace
  workspaces: Workspace[]
  switchTo: (workspace: Workspace) => void
} | null>(null)

function DirectoryScreen({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6 text-text-primary">
      <section className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-6">
        {children}
      </section>
    </main>
  )
}

export function UnavailableWorkspace() {
  return (
    <DirectoryScreen>
      <h1 className="text-lg font-semibold">Workspace unavailable</h1>
      <p className="text-sm text-text-secondary">Check the link or open your main dashboard.</p>
      <Button asChild><a href="/">Open dashboard</a></Button>
    </DirectoryScreen>
  )
}

export function ClerkWorkspaceBoundary({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, orgId, userId, getToken, signOut } = useAuth()
  const { setActive } = useOrganizationList()
  const [directory, setDirectory] = useState<{ userId: string; workspaces?: Workspace[] }>()
  const [refresh, setRefresh] = useState(0)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!userId || !isSignedIn) return
    const controller = new AbortController()
    void (async () => {
      try {
        const token = await getToken()
        if (controller.signal.aborted) return
        if (!token) throw new Error('Workspace session unavailable')
        const response = await fetch('/api/workspaces', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Workspace lookup failed')
        const data = await response.json() as { workspaces: Workspace[] }
        if (!controller.signal.aborted) setDirectory({ userId, workspaces: data.workspaces })
      } catch {
        if (!controller.signal.aborted) setDirectory({ userId })
      }
    })()
    return () => controller.abort()
  }, [getToken, isSignedIn, refresh, userId])

  if (isLoaded && !isSignedIn) return children

  const workspaces = directory?.userId === userId ? directory?.workspaces : undefined
  const active = workspaces?.find(workspace => workspace.id === workspaceId && workspace.organizationId === orgId)

  function switchTo(workspace: Workspace) {
    if (!setActive || switching) return
    const currentPath = window.location.pathname.slice(workspaceBase.length)
    const mobile = currentPath.startsWith('/m/') || window.matchMedia('(max-width: 767px)').matches
    const destination = workspaceHome(workspace.id, mobile, currentPath)
    setSwitching(true)
    setError(false)
    void setActive({
      organization: workspace.organizationId,
      navigate: async ({ decorateUrl }) => { window.location.assign(decorateUrl(destination)) },
    }).catch(() => {
      setSwitching(false)
      setError(true)
    })
  }

  if (!isLoaded || switching || directory?.userId !== userId) {
    return <DirectoryScreen><p role="status" className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Opening workspace…</p></DirectoryScreen>
  }
  if (active && workspaces && !error) {
    return <WorkspaceContext.Provider value={{ active, workspaces, switchTo }}>{children}</WorkspaceContext.Provider>
  }
  return (
    <DirectoryScreen>
      <h1 className="text-lg font-semibold">{workspaces?.length ? 'Choose a workspace' : 'Workspace access'}</h1>
      {error && <p role="alert" className="text-sm text-danger">Could not open the workspace. Try again.</p>}
      {!workspaces && (
        <>
          <p role="alert" className="text-sm text-text-secondary">Could not load your workspaces.</p>
          <Button onClick={() => { setDirectory(undefined); setRefresh(value => value + 1) }}>Try again</Button>
        </>
      )}
      {workspaces?.length === 0 && (
        <p className="text-sm text-text-secondary">This account has no workspaces on this installation.</p>
      )}
      {workspaces?.map(workspace => (
        <Button key={workspace.id} variant="secondary" className="w-full justify-start"
          disabled={!setActive} onClick={() => switchTo(workspace)}>
          {workspace.name}
        </Button>
      ))}
      <Button variant="ghost" onClick={() => void signOut({ redirectUrl: '/' })}>Sign out</Button>
    </DirectoryScreen>
  )
}

function MobileWorkspacePicker({ active, workspaces, switchTo, className }: {
  active: Workspace
  workspaces: Workspace[]
  switchTo: (workspace: Workspace) => void
  className?: string
}) {
  const title = useRef<HTMLHeadingElement>(null)
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button"
          aria-label={`Switch workspace, current workspace ${active.name}`}
          className={cn('flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-lg text-left text-xs font-medium text-text-secondary focus-visible:outline-2 focus-visible:outline-focus active:bg-surface-raised', className)}>
          <span className="min-w-0 truncate">{active.name}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent className="mobile-sales mobile-sheet flex flex-col overflow-hidden" aria-describedby={undefined}
        onOpenAutoFocus={event => { event.preventDefault(); title.current?.focus() }}>
        <DialogHeader>
          <DialogTitle ref={title} tabIndex={-1} className="focus:outline-none">Switch workspace</DialogTitle>
        </DialogHeader>
        <ul role="list" className="min-h-0 divide-y divide-border-subtle overflow-y-auto p-2">
          {workspaces.map(workspace => (
            <li key={workspace.id}>
              {workspace.id === active.id ? (
                <div aria-current="true" className="flex min-h-14 items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 text-sm font-semibold">{workspace.name}</span>
                  <span className="shrink-0 text-xs text-text-secondary">Current</span>
                  <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />
                </div>
              ) : (
                <button type="button" onClick={() => switchTo(workspace)}
                  className="min-h-14 w-full rounded-lg px-3 py-2 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-focus active:bg-surface-raised">
                  {workspace.name}
                </button>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

export function WorkspaceSwitcher({ className, mobile = false }: { className?: string; mobile?: boolean }) {
  const directory = useContext(WorkspaceContext)
  if (!directory) return null
  const { active, workspaces, switchTo } = directory
  if (workspaces.length < 2) {
    return <span className={cn('block truncate font-medium text-text-secondary', mobile ? 'text-xs' : 'text-sm', className)}>{active.name}</span>
  }
  if (mobile) return <MobileWorkspacePicker {...directory} className={className} />
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className={className} aria-label={`Switch workspace, current workspace ${active.name}`}>
          <span className="truncate">{active.name}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-text-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {workspaces.map(workspace => (
          <DropdownMenuItem key={workspace.id} disabled={workspace.id === active.id} onSelect={() => switchTo(workspace)}>
            {workspace.id === active.id && <Check className="size-4" />}
            <span>{workspace.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
