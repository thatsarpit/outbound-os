import { useEffect, useRef, useState } from 'react'
import { flexRender, type Table as TanstackTable, type Row } from '@tanstack/react-table'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The shared data table.
 *
 * Pages keep their own column definitions and their own sorting/filtering
 * state; this owns everything about *rendering* a dense table — sticky header,
 * row rhythm, selection affordance, and keyboard navigation — so those behave
 * identically wherever a table appears.
 *
 * Keyboard: j / k or arrow keys move, Enter opens, x toggles selection, Escape
 * clears focus. Discoverable because the focused row is visibly marked; the
 * previous Leads table opened a record on double-click only, which nothing
 * signalled.
 */

export type DataTableProps<T> = {
  table: TanstackTable<T>
  /** Below this the table scrolls horizontally rather than crushing columns. */
  minWidth?: number
  onRowClick?: (row: T) => void
  isRowSelected?: (row: T) => boolean
  onToggleSelect?: (row: T) => void
  /** Maps a column id to the sort field the page understands. */
  sortFieldFor?: (columnId: string) => string | undefined
  activeSort?: { by?: string; dir?: 'asc' | 'desc' }
  onSort?: (field: string) => void
  /** Rendered in place of the body when there are no rows. */
  emptyState?: React.ReactNode
  className?: string
}

export function DataTable<T>({
  table,
  minWidth = 980,
  onRowClick,
  isRowSelected,
  onToggleSelect,
  sortFieldFor,
  activeSort,
  onSort,
  emptyState,
  className,
}: DataTableProps<T>) {
  const rows = table.getRowModel().rows
  const containerRef = useRef<HTMLDivElement>(null)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)

  // Keep the focused row inside the viewport as it moves.
  useEffect(() => {
    if (focusIndex === null) return
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-row-index="${focusIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [focusIndex])

  useEffect(() => {
    if (focusIndex !== null && focusIndex > rows.length - 1) setFocusIndex(null)
  }, [rows.length, focusIndex])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return
    const target = event.target as HTMLElement
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable)
      return

    const move = (delta: number) => {
      event.preventDefault()
      setFocusIndex((current) => {
        if (current === null) return delta > 0 ? 0 : rows.length - 1
        return Math.min(rows.length - 1, Math.max(0, current + delta))
      })
    }

    switch (event.key) {
      case 'j':
      case 'ArrowDown':
        move(1)
        break
      case 'k':
      case 'ArrowUp':
        move(-1)
        break
      case 'Enter':
        if (focusIndex !== null && onRowClick) {
          event.preventDefault()
          onRowClick(rows[focusIndex].original)
        }
        break
      case 'x':
        if (focusIndex !== null && onToggleSelect) {
          event.preventDefault()
          onToggleSelect(rows[focusIndex].original)
        }
        break
      case 'Escape':
        setFocusIndex(null)
        break
      default:
        break
    }
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Results"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative max-h-[calc(100vh-19rem)] overflow-auto rounded-lg border border-border bg-surface',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus',
        className,
      )}
    >
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead className="sticky top-0 z-10 bg-surface-raised">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id} className="border-b border-border">
              {group.headers.map((header) => {
                const field = sortFieldFor?.(header.column.id)
                const isActive = Boolean(field && activeSort?.by === field)
                const content = header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())

                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={
                      isActive
                        ? activeSort?.dir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                    style={{ width: header.getSize() }}
                    className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted"
                  >
                    {field && onSort ? (
                      <button
                        type="button"
                        onClick={() => onSort(field)}
                        className={cn(
                          'group inline-flex items-center gap-1 transition-colors hover:text-text-primary',
                          isActive && 'text-text-primary',
                        )}
                      >
                        {content}
                        {isActive ? (
                          activeSort?.dir === 'asc' ? (
                            <ChevronUp aria-hidden="true" className="h-3 w-3" />
                          ) : (
                            <ChevronDown aria-hidden="true" className="h-3 w-3" />
                          )
                        ) : (
                          <ChevronsUpDown
                            aria-hidden="true"
                            className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-40"
                          />
                        )}
                      </button>
                    ) : (
                      content
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>

        <tbody>
          {rows.length === 0 && emptyState ? (
            <tr>
              <td colSpan={table.getAllLeafColumns().length} className="p-0">
                {emptyState}
              </td>
            </tr>
          ) : (
            rows.map((row: Row<T>, index) => {
              const selected = isRowSelected?.(row.original) ?? false
              const focused = focusIndex === index

              return (
                <tr
                  key={row.id}
                  data-row-index={index}
                  aria-selected={selected}
                  onClick={() => {
                    setFocusIndex(index)
                    onRowClick?.(row.original)
                  }}
                  className={cn(
                    'border-b border-border-subtle transition-colors',
                    onRowClick && 'cursor-pointer',
                    selected ? 'bg-focus-muted' : 'hover:bg-surface-raised',
                    // Focus is a left rule rather than a fill, so it stays
                    // readable on top of a selected row.
                    focused && 'relative',
                  )}
                >
                  {row.getVisibleCells().map((cell, cellIndex) => (
                    <td key={cell.id} className="relative px-3 py-2 align-middle">
                      {focused && cellIndex === 0 && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 left-0 w-0.5 bg-accent"
                        />
                      )}
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
