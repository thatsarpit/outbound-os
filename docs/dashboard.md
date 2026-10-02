# Dashboard layouts and reporting periods

Overview and Analytics have layouts saved to your account in this server's database. Each page has its own layout. Signing into the same account on another device restores it. Clerk layouts are also scoped to the active organization. The public demo saves its sample layouts in the current browser only.

Choose **Customize layout** below the headline metrics. Drag a widget's handle onto another widget body to reorder it, or use its up/down buttons with a keyboard or on a touch screen. Choose **Half width** or **Full width** for each widget; mobile screens always use one column. Use the visibility checkboxes to hide or show widgets.

Choose **Save layout** to apply the changes to your account, **Cancel** to discard edits, or **Restore default layout** followed by Save to return to the default arrangement. Hiding all widgets leaves the customization controls available. If another session saved a newer layout, the page retains your unsaved edits and offers **Reload saved layout**. Reloading discards those edits and loads the newer saved layout.

Analytics offers 7-, 14- and 30-day reporting periods, including today. The date boundaries follow the browser's reporting time-zone offset, with the configured workspace zone as the API fallback. Changing periods refreshes the activity totals, daily charts, lead distributions, funnel, campaign cohort and team cohort.

- Lead activity uses the original source timestamp when supplied. Undated historical imports do not count as new leads just because they were ingested recently.
- Country and tier distributions, the funnel and team figures show current attributes/outcomes for leads received in the selected period. They are not a historical snapshot of earlier lead statuses.
- Campaign ROI shows closed revenue and conversion for campaigns created in that period, rather than a ledger of sales booked during it.
- Overview's pipeline remains the current pipeline across all time; its activity charts have their own selected period.

Widget options include table view, CSV download and expansion. Layout backups are part of the normal SQLite database backup. This release adds a migration; normal Docker startup applies it, and source installs should run `npx prisma migrate deploy` before starting the API.
