import { useMemo, useRef, useState } from 'react'
import { ChevronDown, LayoutGrid, Plus, Redo2, Search, Undo2 } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { SEARCH_INPUT_ID } from '@/lib/menu-bridge'
import {
  createProjectAndSwitch,
  refreshProjects,
  switchProject,
} from '@/lib/project-session'
import { useStore } from '@/state/store'

/**
 * One control for both concerns: click opens a searchable project dropdown;
 * double-click switches to an inline rename input; blur/Enter commits and
 * flips back to the dropdown trigger.
 */
function ProjectSwitcher() {
  const title = useStore((s) => s.model.title)
  const setTitle = useStore((s) => s.setTitle)
  const projectId = useStore((s) => s.projectId)
  const projects = useStore((s) => s.projects)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(filter.trim().toLowerCase()),
  )

  const commitRename = () => {
    setEditing(false)
    if (draft.trim() && draft !== title) setTitle(draft.trim())
  }

  if (editing) {
    return (
      <Input
        autoFocus
        aria-label="Rename project"
        className="h-8 w-44 font-medium"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitRename()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <button
        type="button"
        aria-label="Project"
        aria-expanded={open}
        title="Click to switch projects · double-click to rename"
        disabled={projectId === null}
        onClick={() => {
          refreshProjects()
          setFilter('')
          setOpen((o) => !o)
        }}
        onDoubleClick={() => {
          setOpen(false)
          setDraft(title)
          setEditing(true)
        }}
        className="flex h-8 max-w-44 items-center gap-1.5 rounded-md border bg-transparent px-2.5 text-sm font-medium hover:bg-accent/50 disabled:opacity-50"
      >
        <span className="truncate">{projectId === null ? 'Loading…' : title}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-64 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          <Input
            autoFocus
            aria-label="Filter projects"
            className="mb-1 h-7 text-xs"
            placeholder="Filter projects…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
              if (e.key === 'Enter' && filtered[0]) {
                setOpen(false)
                if (filtered[0].id !== projectId) void switchProject(filtered[0].id)
              }
            }}
          />
          <ul role="listbox" className="max-h-72 overflow-y-auto">
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={p.id === projectId}
                  className={cn(
                    'w-full truncate rounded-sm px-2 py-1.5 text-left text-sm',
                    p.id === projectId ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    setOpen(false)
                    if (p.id !== projectId) void switchProject(p.id)
                  }}
                >
                  {p.name}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-2 py-1.5 text-xs text-muted-foreground italic">No matches.</li>
            )}
          </ul>
          <button
            type="button"
            className="mt-1 w-full rounded-sm border-t px-2 pt-1.5 pb-1 text-left text-xs text-muted-foreground hover:bg-accent/50"
            onMouseDown={(e) => {
              e.preventDefault()
              setOpen(false)
              void createProjectAndSwitch('Untitled')
            }}
          >
            + New project
          </button>
        </div>
      )}
    </div>
  )
}

function ViewSwitch({
  view,
  setView,
}: {
  view: 'model' | 'data'
  setView: (v: 'model' | 'data') => void
}) {
  const isData = view === 'data'
  return (
    <div
      role="tablist"
      aria-label="View"
      className="relative ml-auto grid h-8 w-44 grid-cols-2 rounded-lg border bg-muted p-0.5"
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md border bg-background shadow-sm transition-transform duration-200 ease-out',
          isData && 'translate-x-full',
        )}
      />
      {(['model', 'data'] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={view === v}
          onClick={() => setView(v)}
          className={cn(
            'relative z-10 rounded-md text-xs font-medium capitalize transition-colors',
            view === v ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

export function Toolbar() {
  const addObject = useStore((s) => s.addObject)
  const applyAutoLayout = useStore((s) => s.applyAutoLayout)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)

  return (
    <header className="relative flex h-12 items-center border-b bg-card px-3">
      <ProjectSwitcher />
      {view === 'model' && (
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-4">
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Undo"
              title="Undo (⌘Z)"
              disabled={!canUndo}
              onClick={undo}
            >
              <Undo2 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Redo"
              title="Redo (⇧⌘Z)"
              disabled={!canRedo}
              onClick={redo}
            >
              <Redo2 className="size-4" />
            </Button>
          </div>
          <SearchBox />
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Add resource"
              title="Add Resource (⇧⌘N)"
              onClick={() => addObject()}
            >
              <Plus className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Auto layout"
              title="Auto Layout (⇧⌘L)"
              onClick={applyAutoLayout}
            >
              <LayoutGrid className="size-4" />
            </Button>
          </div>
        </div>
      )}
      <ViewSwitch view={view} setView={setView} />
    </header>
  )
}

function SearchBox() {
  const model = useStore((s) => s.model)
  const searchQuery = useStore((s) => s.searchQuery)
  const setSearch = useStore((s) => s.setSearch)
  const select = useStore((s) => s.select)
  const { fitView } = useReactFlow()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const listRef = useRef<HTMLUListElement>(null)

  const matches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return model.objects
      .map((o) => ({
        id: o.id,
        name: o.name,
        fields: o.properties.filter((p) => p.name.toLowerCase().includes(q)).map((p) => p.name),
      }))
      .filter((m) => m.name.toLowerCase().includes(q) || m.fields.length > 0)
  }, [model, searchQuery])

  const jumpTo = (id: string) => {
    select(id)
    setOpen(false)
    void fitView({ nodes: [{ id }], duration: 250, maxZoom: 1.2 })
  }

  const fitAllMatches = () => {
    if (matches.length === 0) return
    setOpen(false)
    void fitView({ nodes: matches.map((m) => ({ id: m.id })), duration: 250, maxZoom: 1 })
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={SEARCH_INPUT_ID}
        aria-label="Search resources and fields"
        autoComplete="off"
        className="h-8 w-80 pl-8 text-sm"
        placeholder="Search"
        value={searchQuery}
        onChange={(e) => {
          setSearch(e.target.value)
          setOpen(e.target.value.trim() !== '')
          setActiveIndex(-1)
        }}
        onFocus={() => searchQuery.trim() !== '' && setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActiveIndex((i) => Math.min(i + 1, matches.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIndex((i) => Math.max(i - 1, -1))
          } else if (e.key === 'Enter') {
            const active = matches[activeIndex]
            if (open && active) jumpTo(active.id)
            else fitAllMatches()
          } else if (e.key === 'Escape') {
            setSearch('')
            setOpen(false)
            setActiveIndex(-1)
          }
        }}
      />
      {open && matches.length > 0 && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute top-full left-0 z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {matches.map((m, i) => (
            <li
              key={m.id}
              role="option"
              aria-selected={i === activeIndex}
              className={cn(
                'flex cursor-pointer items-baseline justify-between gap-2 rounded-sm px-2 py-1.5 text-sm',
                i === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                jumpTo(m.id)
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="truncate font-mono">{m.name}</span>
              {m.fields.length > 0 && (
                <span className="truncate text-xs text-muted-foreground">
                  {m.fields.join(', ')}
                </span>
              )}
            </li>
          ))}
          <li
            className="mt-1 cursor-pointer rounded-sm border-t px-2 pt-1.5 pb-1 text-xs text-muted-foreground hover:bg-accent/50"
            onMouseDown={(e) => {
              e.preventDefault()
              fitAllMatches()
            }}
          >
            Show all {matches.length} {matches.length === 1 ? 'match' : 'matches'} ↵
          </li>
        </ul>
      )}
    </div>
  )
}
