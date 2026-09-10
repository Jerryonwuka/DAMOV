import * as React from 'react'
import { motion } from 'framer-motion'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download, Search } from 'lucide-react'
import { cn, downloadCsv, sortBy } from '@/lib/utils'
import { lagosFullDateTime } from '@/lib/format'
import { Button } from './button'
import { Input } from './input'
import { EmptyState } from './patterns'
import { SkeletonTable } from './skeleton'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger,
} from './dropdown'

export interface Column<T> {
  key: string
  header: string
  /** Rendered cell. Defaults to the sort value. */
  cell?: (row: T) => React.ReactNode
  /** Value used for sorting, searching and CSV export. */
  value?: (row: T) => string | number
  sortable?: boolean
  align?: 'left' | 'right' | 'center'
  width?: string
  /** Dense operational tables let users hide columns they don't need. */
  hideable?: boolean
  defaultHidden?: boolean
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  searchPlaceholder?: string
  searchable?: boolean
  pageSize?: number
  loading?: boolean
  empty?: React.ReactNode
  toolbar?: React.ReactNode
  /** Export filename without extension. Adds a provenance footer to every file. */
  exportName?: string
  exportContext?: Record<string, string>
  stickyHeader?: boolean
  className?: string
  dense?: boolean
}

export function DataTable<T>({
  data, columns, rowKey, onRowClick, searchPlaceholder = 'Search…', searchable = true,
  pageSize = 12, loading, empty, toolbar, exportName, exportContext, stickyHeader = true,
  className, dense,
}: DataTableProps<T>) {
  const [query, setQuery] = React.useState('')
  const [sort, setSort] = React.useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const [page, setPage] = React.useState(0)
  const [hidden, setHidden] = React.useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)),
  )

  const visibleColumns = columns.filter((c) => !hidden.has(c.key))
  const valueOf = React.useCallback(
    (row: T, column: Column<T>) => (column.value ? column.value(row) : ''),
    [],
  )

  const filtered = React.useMemo(() => {
    if (!query.trim()) return data
    const needle = query.trim().toLowerCase()
    return data.filter((row) =>
      columns.some((column) => String(valueOf(row, column)).toLowerCase().includes(needle)),
    )
  }, [data, query, columns, valueOf])

  const sorted = React.useMemo(() => {
    if (!sort) return filtered
    const column = columns.find((c) => c.key === sort.key)
    if (!column) return filtered
    return sortBy(filtered, (row) => valueOf(row, column), sort.dir)
  }, [filtered, sort, columns, valueOf])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = Math.min(page, pageCount - 1)
  const rows = sorted.slice(current * pageSize, current * pageSize + pageSize)

  React.useEffect(() => setPage(0), [query, data.length])

  function toggleSort(key: string) {
    setSort((prev) =>
      prev?.key !== key ? { key, dir: 'asc' } : prev.dir === 'asc' ? { key, dir: 'desc' } : null,
    )
  }

  function exportCsv() {
    const header = visibleColumns.map((c) => c.header)
    const body = sorted.map((row) => visibleColumns.map((column) => valueOf(row, column)))
    // Every export carries its own provenance so a spreadsheet can be trusted later.
    const provenance: (string | number | null)[][] = [
      [],
      ['Report', exportName ?? 'Damov export'],
      ['Generated', lagosFullDateTime(new Date().toISOString())],
      ['Rows', sorted.length],
      ...Object.entries(exportContext ?? {}).map(([k, v]) => [k, v]),
    ]
    downloadCsv(`${exportName ?? 'damov-export'}-${new Date().toISOString().slice(0, 10)}.csv`, [
      header,
      ...body,
      ...provenance,
    ])
  }

  const hideableColumns = columns.filter((c) => c.hideable)

  return (
    <div className={cn('space-y-3', className)}>
      {(searchable || toolbar || exportName || hideableColumns.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchable && (
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9"
                aria-label={searchPlaceholder}
              />
            </div>
          )}
          {toolbar}
          {hideableColumns.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Columns3 className="size-4" /> Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                {hideableColumns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.key}
                    checked={!hidden.has(column.key)}
                    onCheckedChange={(checked) =>
                      setHidden((prev) => {
                        const next = new Set(prev)
                        if (checked) next.delete(column.key)
                        else next.add(column.key)
                        return next
                      })
                    }
                  >
                    {column.header}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {exportName && (
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
              <Download className="size-4" /> Export
            </Button>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
              <tr className="border-b border-border bg-muted/70 backdrop-blur">
                {visibleColumns.map((column) => (
                  <th
                    key={column.key}
                    style={{ width: column.width }}
                    className={cn(
                      'whitespace-nowrap px-3 py-2.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground',
                      column.align === 'right' && 'text-right',
                      column.align === 'center' && 'text-center',
                      !column.align && 'text-left',
                    )}
                  >
                    {column.sortable !== false && column.value ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded transition-colors hover:text-foreground',
                          column.align === 'right' && 'flex-row-reverse',
                        )}
                      >
                        {column.header}
                        {sort?.key === column.key ? (
                          sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                        ) : (
                          <span className="size-3" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="p-4">
                    <SkeletonTable columns={visibleColumns.length} />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="p-6">
                    {empty ?? <EmptyState title="Nothing to show" description="No records match the current filters." />}
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <motion.tr
                    key={rowKey(row)}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, delay: Math.min(index * 0.018, 0.2) }}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={
                      onRowClick ? (e) => (e.key === 'Enter' ? onRowClick(row) : undefined) : undefined
                    }
                    className={cn(
                      'border-b border-border/70 transition-colors last:border-0',
                      onRowClick && 'cursor-pointer hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none',
                    )}
                  >
                    {visibleColumns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          'px-3 align-middle',
                          dense ? 'py-1.5' : 'py-2.5',
                          column.align === 'right' && 'text-right tnum',
                          column.align === 'center' && 'text-center',
                        )}
                      >
                        {column.cell ? column.cell(row) : valueOf(row, column)}
                      </td>
                    ))}
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {sorted.length > pageSize && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="tnum">
            {current * pageSize + 1}–{Math.min(sorted.length, (current + 1) * pageSize)} of {sorted.length.toLocaleString('en-NG')}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2 tnum">
              {current + 1} / {pageCount}
            </span>
            <Button variant="outline" size="icon-sm" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)} aria-label="Next page">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
