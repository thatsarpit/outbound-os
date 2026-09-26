/**
 * /dev/ui — Design-system showcase route.
 *
 * Only rendered in development (gated by App.tsx). Every primitive in
 * components/ui/ should appear here in every variant so we can visually
 * regression-check the design system in isolation from real data.
 */
import { useState } from 'react'
import { z } from 'zod'
import {
  Mail,
  MoreHorizontal,
  Trash2,
  Edit3,
  Search,
  Users,
  MessageSquare,
  Clock,
} from 'lucide-react'
import {
  Button,
  Input,
  Textarea,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogTrigger,
  DialogClose,
  ConfirmDialog,
  SelectField,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Tooltip,
  TooltipProvider,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Switch,
  SwitchField,
  Checkbox,
  CheckboxField,
  Form,
  useZodForm,
} from '@/components/ui'
import { MetricCard } from '@/components/ui/metric-card'
import { DataTable } from '@/components/ui/data-table'
import { useReactTable, getCoreRowModel, type ColumnDef } from '@tanstack/react-table'
import { SectionCard } from '@/components/ui/section-card'
import { LoadingState } from '@/components/ui/loading-state'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { toast } from '@/stores/toast-store'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Min 8 characters'),
})
type FormData = z.infer<typeof schema>

export default function DevUiPage() {
  const [openDialog, setOpenDialog] = useState(false)
  const [openConfirm, setOpenConfirm] = useState(false)
  const [switchOn, setSwitchOn] = useState(true)
  const [checked, setChecked] = useState(true)
  const [tab, setTab] = useState('preview')

  const form = useZodForm<FormData>(schema, {
    defaultValues: { email: '', password: '' },
  })

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-5xl space-y-10 p-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Design System</h1>
          <p className="text-sm text-text-muted">
            Every UI primitive in <code>components/ui/</code>. Visual regression playground.
          </p>
        </div>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button isLoading>Loading</Button>
            <Button disabled>Disabled</Button>
            <Button leftIcon={<Mail className="h-4 w-4" />}>With icon</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
          </div>
        </Section>

        <Section title="Inputs">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Email" placeholder="you@example.com" required />
            <Input
              label="Search"
              placeholder="Search leads…"
              leftAddon={<Search className="h-4 w-4" />}
            />
            <Input label="With error" error="This field is required" />
            <Input
              label="With description"
              description="We'll never share this."
              placeholder="0–100"
            />
            <Textarea label="Notes" placeholder="Anything to remember…" showCount maxLength={140} />
          </div>
        </Section>

        <Section title="Data table">
          <DataTableDemo />
        </Section>

        <Section title="Metrics">
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={Users}
              label="New leads"
              value="1,392"
              delta={{ value: 12.4, label: 'vs last week' }}
              trend={[8, 12, 9, 14, 18, 16, 22]}
            />
            <MetricCard
              icon={MessageSquare}
              label="Replies"
              value="318"
              delta={{ value: -4.2, label: 'vs last week' }}
              trend={[24, 22, 25, 19, 17, 18, 15]}
            />
            <MetricCard
              icon={Clock}
              label="Median first reply"
              value="1h 12m"
              delta={{ value: -18.6, label: 'vs last week', inverted: true }}
              trend={[95, 88, 84, 79, 74, 70, 72]}
            />
            <MetricCard label="Reply rate" value="22.8%" hint="Across all channels" />
          </div>
        </Section>

        <Section title="Section card">
          <SectionCard
            title="Channel health"
            description="Connection state for every outbound route in this workspace."
            action={
              <Button size="sm" variant="secondary">
                Manage
              </Button>
            }
          >
            <p className="text-sm text-text-secondary">Section body content sits here.</p>
          </SectionCard>
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>neutral</Badge>
            <Badge variant="accent">accent</Badge>
            <Badge variant="success">success</Badge>
            <Badge variant="warning">warning</Badge>
            <Badge variant="danger">danger</Badge>
            <Badge variant="info">info</Badge>
            <Badge variant="hot">hot</Badge>
            <Badge variant="warm">warm</Badge>
            <Badge variant="cold">cold</Badge>
            <Badge variant="outline">outline</Badge>
            <Badge size="md" variant="accent">
              size md
            </Badge>
          </div>
        </Section>

        <Section title="Select">
          <SelectField
            label="Role"
            placeholder="Pick a role"
            options={[
              { label: 'Admin', value: 'admin', description: 'Full access' },
              { label: 'Manager', value: 'manager' },
              { label: 'Agent', value: 'agent' },
              { label: 'Viewer', value: 'viewer' },
            ]}
            className="max-w-xs"
            containerClassName="max-w-xs"
          />
        </Section>

        <Section title="Dialog & Confirm">
          <div className="flex flex-wrap gap-3">
            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
              <DialogTrigger asChild>
                <Button>Open dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit profile</DialogTitle>
                  <DialogDescription>Changes save when you click Save.</DialogDescription>
                </DialogHeader>
                <DialogBody>
                  <Input label="Name" defaultValue="Priya" />
                </DialogBody>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="secondary">Cancel</Button>
                  </DialogClose>
                  <Button onClick={() => setOpenDialog(false)}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button variant="danger" onClick={() => setOpenConfirm(true)}>
              Delete (confirm)
            </Button>
            <ConfirmDialog
              open={openConfirm}
              onOpenChange={setOpenConfirm}
              title="Delete this lead?"
              description="This permanently removes the lead and its message history."
              confirmLabel="Delete"
              destructive
              onConfirm={() => {
                toast.success('Deleted')
                setOpenConfirm(false)
              }}
            />
          </div>
        </Section>

        <Section title="Tabs">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
            </TabsList>
            <TabsContent value="preview">
              <p className="text-sm text-text-muted">Preview tab content.</p>
            </TabsContent>
            <TabsContent value="settings">
              <p className="text-sm text-text-muted">Settings tab content.</p>
            </TabsContent>
            <TabsContent value="logs">
              <p className="text-sm text-text-muted">Logs tab content.</p>
            </TabsContent>
          </Tabs>
        </Section>

        <Section title="Tooltip">
          <div className="flex items-center gap-4">
            <Tooltip content="Edit lead">
              <Button variant="ghost" size="sm" aria-label="Edit">
                <Edit3 className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip content="Delete forever" side="bottom">
              <Button variant="ghost" size="sm" aria-label="Delete">
                <Trash2 className="h-4 w-4" />
              </Button>
            </Tooltip>
          </div>
        </Section>

        <Section title="Dropdown menu">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" leftIcon={<MoreHorizontal className="h-4 w-4" />}>
                Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Lead actions</DropdownMenuLabel>
              <DropdownMenuItem>Edit</DropdownMenuItem>
              <DropdownMenuItem>Add to campaign</DropdownMenuItem>
              <DropdownMenuItem>Mark closed</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Section>

        <Section title="Switch & Checkbox">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SwitchField
              label="Send follow-ups"
              description="Nudge leads who have not replied after 3 days"
              checked={switchOn}
              onCheckedChange={setSwitchOn}
            />
            <CheckboxField
              label="Send me a weekly digest"
              description="Sent at 9am every Monday"
              checked={checked}
              onCheckedChange={(v) => setChecked(v === true)}
            />
            <div className="flex items-center gap-3">
              <Switch defaultChecked />
              <span className="text-sm">Bare switch</span>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox defaultChecked />
              <span className="text-sm">Bare checkbox</span>
            </div>
          </div>
        </Section>

        <Section title="Form (react-hook-form + zod)">
          <Form
            form={form}
            onSubmit={(data) => toast.success(`Submitted: ${data.email}`)}
            className="max-w-md"
          >
            <Input
              label="Email"
              type="email"
              required
              error={form.formState.errors.email?.message}
              {...form.register('email')}
            />
            <Input
              label="Password"
              type="password"
              required
              error={form.formState.errors.password?.message}
              {...form.register('password')}
            />
            <div className="flex justify-end">
              <Button type="submit" isLoading={form.formState.isSubmitting}>
                Sign in
              </Button>
            </div>
          </Form>
        </Section>

        <Section title="State Primitives (loading / empty / error)">
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-xs text-text-muted">LoadingState — variants</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-md border border-border p-3">
                  <LoadingState variant="inline" label="Loading…" />
                </div>
                <div className="rounded-md border border-border p-3">
                  <LoadingState variant="card" />
                </div>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs text-text-muted">EmptyState — tones</p>
              <div className="grid gap-4 md:grid-cols-3">
                <EmptyState
                  icon={Mail}
                  title="No messages yet"
                  description="Waiting for replies to arrive."
                  tone="waiting"
                />
                <EmptyState
                  icon={Search}
                  title="No matches"
                  description="Try widening your filters."
                  tone="filtered"
                />
                <EmptyState
                  icon={Mail}
                  title="Email not configured"
                  description="Add a sender to start."
                  tone="unconfigured"
                  action={<Button size="sm">Add sender</Button>}
                />
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs text-text-muted">ErrorState — with retry</p>
              <ErrorState
                title="Couldn't load leads"
                description="Network request failed."
                onRetry={() => toast.info('Retry clicked')}
              />
            </div>
          </div>
        </Section>
      </div>
    </TooltipProvider>
  )
}

type DemoRow = { id: number; name: string; company: string; status: string; score: number }

const DEMO_ROWS: DemoRow[] = [
  { id: 1, name: 'Rohan Mehta', company: 'Meridian Distributors', status: 'Replied', score: 82 },
  { id: 2, name: 'Sarah Whitfield', company: 'Northwind Retail', status: 'Engaged', score: 76 },
  { id: 3, name: 'Daniel Okafor', company: 'Lagos Building Supply', status: 'Contacted', score: 54 },
]

const DEMO_COLUMNS: ColumnDef<DemoRow>[] = [
  { accessorKey: 'name', header: 'Lead', size: 200 },
  { accessorKey: 'company', header: 'Company', size: 240 },
  { accessorKey: 'status', header: 'Status', size: 120 },
  {
    accessorKey: 'score',
    header: 'Score',
    size: 80,
    cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
  },
]

function DataTableDemo() {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const table = useReactTable({
    data: DEMO_ROWS,
    columns: DEMO_COLUMNS,
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <div className="w-full space-y-2">
      <DataTable
        table={table}
        minWidth={560}
        onRowClick={() => {}}
        isRowSelected={(r) => selected.has(r.id)}
        onToggleSelect={(r) =>
          setSelected((cur) => {
            const next = new Set(cur)
            if (next.has(r.id)) next.delete(r.id)
            else next.add(r.id)
            return next
          })
        }
      />
      <p className="text-[11px] text-text-muted">
        Click the table, then j / k to move, x to select, Enter to open.
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">{title}</h2>
      <div className="rounded-md border border-border bg-surface p-5">{children}</div>
    </section>
  )
}
