export const DASHBOARD_WIDGETS = {
  overview: [
    { id: 'messages', title: 'Messages sent', width: 2 },
    { id: 'attention', title: 'Needs attention', width: 1 },
    { id: 'pipeline', title: 'Pipeline', width: 1 },
    { id: 'email', title: 'Email template reply rates', width: 1 },
  ],
  analytics: [
    { id: 'outreach', title: 'Outreach volume', width: 2 },
    { id: 'flow', title: 'Lead flow', width: 2 },
    { id: 'country', title: 'Leads by country', width: 1 },
    { id: 'tier', title: 'Leads by tier', width: 1 },
    { id: 'funnel', title: 'Conversion funnel', width: 2 },
    { id: 'campaigns', title: 'Campaign ROI', width: 2 },
    { id: 'team', title: 'Team performance', width: 2 },
  ],
};

export function defaultDashboardLayout(page) {
  if (!Object.hasOwn(DASHBOARD_WIDGETS, page)) throw new Error('Unknown dashboard page.');
  return { version: 1, widgets: DASHBOARD_WIDGETS[page].map(({ id, width }) => ({ id, width, visible: true })) };
}

// Strict writes prevent corrupt preferences; reads can fall back to defaults
// if a stored layout belongs to an older version of the dashboard.
export function validateDashboardLayout(page, value) {
  const defaults = defaultDashboardLayout(page);
  if (!value || value.version !== 1 || !Array.isArray(value.widgets)
    || value.widgets.length !== defaults.widgets.length) throw new Error('A complete version 1 layout is required.');
  const remaining = new Set(defaults.widgets.map((widget) => widget.id));
  const widgets = value.widgets.map((widget) => {
    if (!widget || !remaining.delete(widget.id) || typeof widget.visible !== 'boolean'
      || ![1, 2].includes(widget.width)) throw new Error('Each known widget must appear once with a visibility and width of 1 or 2.');
    return { id: widget.id, width: widget.width, visible: widget.visible };
  });
  return { version: 1, widgets };
}

export function moveDashboardWidget(layout, id, targetId) {
  const from = layout.widgets.findIndex((widget) => widget.id === id);
  const to = layout.widgets.findIndex((widget) => widget.id === targetId);
  if (from < 0 || to < 0 || from === to) return layout;
  const widgets = [...layout.widgets];
  const [widget] = widgets.splice(from, 1);
  widgets.splice(to, 0, widget);
  return { ...layout, widgets };
}
