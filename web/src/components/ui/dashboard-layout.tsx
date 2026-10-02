import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import { api, ApiClientError } from '@/api/client'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from './button'
import {
  DASHBOARD_WIDGETS,
  defaultDashboardLayout,
  moveDashboardWidget,
  validateDashboardLayout,
  type DashboardLayout as Layout,
  type DashboardPage,
} from '../../../../shared/dashboardLayout'

interface SavedLayout {
  layout: Layout
  revision: number
}

export function DashboardLayout({
  page,
  widgets,
}: {
  page: DashboardPage
  widgets: Record<string, ReactNode>
}) {
  const scope = useAuthStore((state) => state.dashboardScope)
  // Organization switches discard drafts and use a separate query cache.
  return (
    <AccountDashboardLayout key={`${scope}:${page}`} page={page} widgets={widgets} scope={scope} />
  )
}

function AccountDashboardLayout({
  page,
  widgets,
  scope,
}: {
  page: DashboardPage
  widgets: Record<string, ReactNode>
  scope: string
}) {
  const client = useQueryClient()
  const queryKey = ['dashboard-layout', scope, page]
  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<SavedLayout> => {
      const response = await api.get<SavedLayout>(`/dashboard/preferences/${page}`)
      if (!response || !Number.isSafeInteger(response.revision) || response.revision < 0)
        throw new Error('Could not load your saved layout.')
      return { layout: validateDashboardLayout(page, response.layout), revision: response.revision }
    },
  })
  const [draft, setDraft] = useState<Layout | null>(null)
  const [dragged, setDragged] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [baseRevision, setBaseRevision] = useState(0)
  const save = useMutation({
    mutationFn: async (layout: Layout) => {
      const response = await api.put<SavedLayout>(`/dashboard/preferences/${page}`, {
        layout,
        revision: baseRevision,
      })
      if (!response) throw new Error('Could not confirm your saved layout.')
      return { layout: validateDashboardLayout(page, response.layout), revision: response.revision }
    },
    onSuccess: (response) => {
      client.setQueryData(queryKey, response)
      setDraft(null)
      setAnnouncement('Layout saved to your account.')
    },
  })
  const layout = draft ?? query.data?.layout ?? defaultDashboardLayout(page)
  const editing = draft !== null
  const titles = Object.fromEntries(
    DASHBOARD_WIDGETS[page].map((widget) => [widget.id, widget.title]),
  )
  const change = (id: string, patch: Partial<Layout['widgets'][number]>) => {
    if (save.isPending) return
    setDraft({
      ...layout,
      widgets: layout.widgets.map((widget) =>
        widget.id === id ? { ...widget, ...patch } : widget,
      ),
    })
  }
  const move = (id: string, targetId: string) => {
    if (save.isPending) return
    const next = moveDashboardWidget(layout, id, targetId)
    setDraft(next)
    setAnnouncement(
      `${titles[id]} moved to position ${next.widgets.findIndex((widget) => widget.id === id) + 1}.`,
    )
  }
  const conflict = save.error instanceof ApiClientError && save.error.status === 409
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {!editing ? (
          <Button
            variant="secondary"
            disabled={query.isPending || query.isError}
            onClick={() => {
              save.reset()
              setBaseRevision(query.data?.revision ?? 0)
              setDraft(layout)
            }}
          >
            Customize layout
          </Button>
        ) : (
          <>
            <Button
              pending={save.isPending}
              pendingLabel="Saving…"
              onClick={() => save.mutate(layout)}
            >
              Save layout
            </Button>
            <Button
              variant="secondary"
              disabled={save.isPending}
              onClick={() => {
                setDraft(null)
                save.reset()
              }}
            >
              Cancel
            </Button>
            <Button
              variant="ghost"
              disabled={save.isPending}
              onClick={() => setDraft(defaultDashboardLayout(page))}
            >
              Restore default layout
            </Button>
          </>
        )}
        <span className="text-xs text-text-muted">
          {editing
            ? 'Drag to reorder, or use the arrow buttons. Widths adapt on mobile.'
            : scope === 'demo'
              ? 'Demo layouts are saved in this browser.'
              : 'Your layout follows your account across devices.'}
        </span>
      </div>
      {query.isError && (
        <div role="alert" className="text-sm text-danger">
          Could not load your layout.{' '}
          <button className="underline" onClick={() => query.refetch()}>
            Retry
          </button>
        </div>
      )}
      {save.isError && (
        <div role="alert" className="text-sm text-danger">
          {save.error.message}{' '}
          {conflict && (
            <button
              className="underline"
              onClick={async () => {
                const result = await query.refetch()
                if (result.data && !result.isError) {
                  setDraft(null)
                  save.reset()
                }
              }}
            >
              Reload saved layout
            </button>
          )}
        </div>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {editing && (
        <fieldset
          disabled={save.isPending}
          className="rounded-lg border border-border bg-surface p-4"
        >
          <legend className="px-1 text-sm font-medium">Visible widgets</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            {layout.widgets.map((widget) => (
              <label
                key={widget.id}
                className="flex items-center gap-2 text-sm text-text-secondary"
              >
                <input
                  type="checkbox"
                  checked={widget.visible}
                  onChange={(event) => change(widget.id, { visible: event.target.checked })}
                />
                {titles[widget.id]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {layout.widgets.every((widget) => !widget.visible) && (
        <p className="rounded-lg border border-border p-6 text-sm text-text-secondary">
          All widgets are hidden. Use Customize layout to show them again.
        </p>
      )}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {layout.widgets
          .filter((widget) => widget.visible)
          .map((widget) => {
            const index = layout.widgets.findIndex((item) => item.id === widget.id)
            return (
              <div
                key={widget.id}
                data-widget-id={widget.id}
                className={`min-w-0 ${widget.width === 2 ? 'lg:col-span-2' : ''}`}
                onDragOver={(event) => {
                  if (editing && dragged) {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (dragged && editing) move(dragged, widget.id)
                  setDragged(null)
                }}
              >
                {editing && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-2 py-2">
                    <button
                      type="button"
                      draggable={!save.isPending}
                      disabled={save.isPending}
                      onDragStart={(event) => {
                        setDragged(widget.id)
                        event.dataTransfer.setData('text/plain', widget.id)
                        event.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => setDragged(null)}
                      aria-label={`Drag ${titles[widget.id]} to reorder`}
                      className="cursor-grab rounded p-1 text-text-secondary focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <span className="mr-auto text-xs font-medium">{titles[widget.id]}</span>
                    <button
                      type="button"
                      disabled={index === 0 || save.isPending}
                      aria-label={`Move ${titles[widget.id]} up`}
                      onClick={() => move(widget.id, layout.widgets[index - 1].id)}
                      className="rounded p-1 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === layout.widgets.length - 1 || save.isPending}
                      aria-label={`Move ${titles[widget.id]} down`}
                      onClick={() => move(widget.id, layout.widgets[index + 1].id)}
                      className="rounded p-1 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <select
                      aria-label={`${titles[widget.id]} width`}
                      disabled={save.isPending}
                      value={widget.width}
                      onChange={(event) =>
                        change(widget.id, { width: Number(event.target.value) as 1 | 2 })
                      }
                      className="rounded border border-border bg-surface px-2 py-1 text-xs"
                    >
                      <option value={1}>Half width</option>
                      <option value={2}>Full width</option>
                    </select>
                  </div>
                )}
                {widgets[widget.id]}
              </div>
            )
          })}
      </div>
    </div>
  )
}
