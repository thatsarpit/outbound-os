export type DashboardPage = 'overview' | 'analytics'
export interface DashboardWidget { id: string; width: 1 | 2; visible: boolean }
export interface DashboardLayout { version: 1; widgets: DashboardWidget[] }
export const DASHBOARD_WIDGETS: Record<DashboardPage, { id: string; title: string; width: 1 | 2 }[]>
export function defaultDashboardLayout(page: DashboardPage): DashboardLayout
export function validateDashboardLayout(page: DashboardPage, value: unknown): DashboardLayout
export function moveDashboardWidget(layout: DashboardLayout, id: string, targetId: string): DashboardLayout
