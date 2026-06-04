/**
 * English UI strings. Use kebab-namespaced keys: "<surface>.<thing>".
 * Keep them short and copy-edited; this is the source of truth for `en` and
 * the fallback for every other locale.
 */
export const en = {
  // Nav
  "nav.traces": "Traces",
  "nav.settings": "Settings",
  "nav.compare": "Compare",
  "nav.github": "GitHub",

  // Workbench
  "workbench.title": "Workbench",
  "workbench.live": "Live",
  "workbench.search-placeholder": "Search name or id…",
  "workbench.no-results": "No traces match your filters",
  "workbench.no-results-hint": "Try adjusting your search, status, or facet filters.",
  "workbench.clear-filters": "Clear filters",
  "workbench.compare-cta": "Compare",
  "workbench.export-csv": "CSV",
  "workbench.bulk-selected": "{count} selected",
  "workbench.bulk-delete": "Delete",
  "workbench.bulk-tag": "Tag",
  "workbench.bulk-export": "Export",
  "workbench.bulk-clear": "Clear",

  // Filters
  "filters.all-status": "All statuses",
  "filters.all-models": "All models",
  "filters.all-tools": "All tools",
  "filters.errors-only": "Errors",
  "filters.favorites-only": "Favorites",

  // Trace detail
  "detail.back": "Back",
  "detail.tab.summary": "Summary",
  "detail.tab.timeline": "Timeline",
  "detail.tab.graph": "Graph",
  "detail.tab.events": "Events",
  "detail.tab.data": "Data",
  "detail.export": "Export",
  "detail.not-found": "Trace not found",
  "detail.retry": "Retry",
  "detail.recently-viewed": "Recently viewed",

  // Settings
  "settings.title": "Settings",
  "settings.section.appearance": "Appearance",
  "settings.section.workbench": "Workbench",
  "settings.section.budgets": "Cost budgets",
  "settings.section.advanced": "Advanced",
  "settings.theme": "Theme",
  "settings.locale": "Language",
  "settings.locale.system": "System",
  "settings.compact-mode": "Compact rows",
  "settings.live-updates": "Live updates (Server-Sent Events)",
  "settings.poll-interval": "Poll interval (ms)",
  "settings.default-page-size": "Default page size",
  "settings.default-sort": "Default sort",
  "settings.budget.daily": "Daily budget (USD)",
  "settings.budget.monthly": "Monthly budget (USD)",
  "settings.reset": "Reset to defaults",
  "settings.saved": "Saved",

  // Budget banner
  "budget.banner.daily": "Today's filtered cost ({spent}) is over your daily budget of {budget}.",
  "budget.banner.monthly": "This month's filtered cost ({spent}) is over your monthly budget of {budget}.",
  "budget.banner.dismiss": "Dismiss",

  // Confirms / toasts
  "confirm.delete.title": "Delete \"{name}\"?",
  "confirm.delete.description": "This permanently removes the trace and all its events, spans, model calls, and tool calls from your local database.",
  "confirm.delete.confirm": "Delete",
  "confirm.delete.cancel": "Cancel",
  "confirm.bulk-delete.title": "Delete {count} traces?",
  "confirm.bulk-delete.description": "This permanently removes the selected traces and all their child events. There is no undo.",
  "toast.deleted": "Trace deleted",
  "toast.bulk-deleted": "{count} traces deleted",
  "toast.exported": "Exported as CSV",
  "toast.nothing-to-export": "Nothing to export",
  "toast.delete-failed": "Could not delete trace",
  "toast.export-failed": "Export failed",

  // Heat map
  "heatmap.title": "Activity",
  "heatmap.legend.less": "Less",
  "heatmap.legend.more": "More",
  "heatmap.tooltip.zero": "No traces on {date}",
  "heatmap.tooltip.one": "1 trace on {date}",
  "heatmap.tooltip.many": "{count} traces on {date}",

  // Empty
  "empty.title": "No traces recorded yet",
  "empty.subtitle": "Studio is listening for traces at {url}",

  // Errors
  "error.boundary.title": "Something went wrong",
  "error.boundary.subtitle": "An unexpected error happened in the Studio UI. Reload the page to recover.",
  "error.boundary.reload": "Reload page",
  "error.boundary.copy": "Copy error details",

  // Shortcuts overlay
  "shortcuts.title": "Keyboard shortcuts",
  "shortcuts.empty": "No shortcuts registered on this page.",
  "shortcuts.help.show": "Show keyboard shortcuts",
} as const;
