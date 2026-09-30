import { useMemo, useState } from 'react'
import { getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { Download, Expand, MoreHorizontal, Table2, Inbox } from 'lucide-react'
import { SectionCard } from './section-card'
import { DataTable } from './data-table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu'
import { EmptyState } from './empty-state'
import { ErrorState } from './error-state'
import { LoadingState } from './loading-state'

export type WidgetRow = Record<string, string | number>

function WidgetTable({ rows }: { rows: WidgetRow[] }) {
  const columns = useMemo<ColumnDef<WidgetRow>[]>(
    () =>
      Object.keys(rows[0] ?? {}).map((key) => ({
        accessorKey: key,
        header: key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
      })),
    [rows],
  )
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })
  return <DataTable table={table} minWidth={0} className="max-h-80" />
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`
}

export function WidgetCard({
  title,
  description,
  action,
  rows,
  loading,
  error,
  onRetry,
  children,
  className,
}: {
  title: string
  description: string
  action?: React.ReactNode
  rows: WidgetRow[]
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  children: React.ReactNode
  className?: string
}) {
  const [tableView, setTableView] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const content = loading ? (
    <LoadingState variant="card" />
  ) : error ? (
    <ErrorState onRetry={onRetry} />
  ) : rows.length === 0 ? (
    <EmptyState
      icon={Inbox}
      tone="waiting"
      title="No data yet"
      description="Activity will appear here when it is recorded."
    />
  ) : tableView ? (
    <WidgetTable rows={rows} />
  ) : (
    children
  )
  const download = () => {
    const keys = Object.keys(rows[0] ?? {})
    const csv = [
      keys.map(csvCell).join(','),
      ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(',')),
    ].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }
  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-md p-2 text-text-secondary hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-focus"
          aria-label={`${title} options`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setTableView((v) => !v)}>
          <Table2 className="mr-2 h-4 w-4" />
          {tableView ? 'View chart' : 'View as table'}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={rows.length === 0} onSelect={download}>
          <Download className="mr-2 h-4 w-4" />
          Download CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setExpanded(true)}>
          <Expand className="mr-2 h-4 w-4" />
          Expand
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
  return (
    <>
      <SectionCard
        title={title}
        description={description}
        className={className}
        action={
          <div className="flex items-center gap-2">
            {action}
            {menu}
          </div>
        }
      >
        {content}
      </SectionCard>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">{description}</p>
          <div className="mt-4">{content}</div>
        </DialogContent>
      </Dialog>
    </>
  )
}
