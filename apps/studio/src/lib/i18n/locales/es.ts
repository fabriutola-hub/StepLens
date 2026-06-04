/**
 * Spanish UI strings — mirror of `en.ts`. Any key missing here falls back to
 * English at runtime, so partial coverage is safe.
 */
export const es: Record<string, string> = {
  // Nav
  "nav.traces": "Trazas",
  "nav.settings": "Ajustes",
  "nav.compare": "Comparar",
  "nav.github": "GitHub",

  // Workbench
  "workbench.title": "Workbench",
  "workbench.live": "En vivo",
  "workbench.search-placeholder": "Buscar nombre o id…",
  "workbench.no-results": "Ninguna traza coincide con los filtros",
  "workbench.no-results-hint": "Prueba a ajustar la búsqueda, el estado o las facetas.",
  "workbench.clear-filters": "Limpiar filtros",
  "workbench.compare-cta": "Comparar",
  "workbench.export-csv": "CSV",
  "workbench.bulk-selected": "{count} seleccionadas",
  "workbench.bulk-delete": "Eliminar",
  "workbench.bulk-tag": "Etiquetar",
  "workbench.bulk-export": "Exportar",
  "workbench.bulk-clear": "Limpiar",

  // Filters
  "filters.all-status": "Todos los estados",
  "filters.all-models": "Todos los modelos",
  "filters.all-tools": "Todas las herramientas",
  "filters.errors-only": "Errores",
  "filters.favorites-only": "Favoritas",

  // Trace detail
  "detail.back": "Volver",
  "detail.tab.summary": "Resumen",
  "detail.tab.timeline": "Línea de tiempo",
  "detail.tab.graph": "Grafo",
  "detail.tab.events": "Eventos",
  "detail.tab.data": "Datos",
  "detail.export": "Exportar",
  "detail.not-found": "Traza no encontrada",
  "detail.retry": "Reintentar",
  "detail.recently-viewed": "Vistas recientemente",

  // Settings
  "settings.title": "Ajustes",
  "settings.section.appearance": "Apariencia",
  "settings.section.workbench": "Workbench",
  "settings.section.budgets": "Presupuestos de coste",
  "settings.section.advanced": "Avanzado",
  "settings.theme": "Tema",
  "settings.locale": "Idioma",
  "settings.locale.system": "Sistema",
  "settings.compact-mode": "Filas compactas",
  "settings.live-updates": "Actualizaciones en vivo (Server-Sent Events)",
  "settings.poll-interval": "Intervalo de sondeo (ms)",
  "settings.default-page-size": "Tamaño de página por defecto",
  "settings.default-sort": "Orden por defecto",
  "settings.budget.daily": "Presupuesto diario (USD)",
  "settings.budget.monthly": "Presupuesto mensual (USD)",
  "settings.reset": "Restablecer valores",
  "settings.saved": "Guardado",

  // Budget banner
  "budget.banner.daily": "El coste filtrado de hoy ({spent}) supera tu presupuesto diario de {budget}.",
  "budget.banner.monthly": "El coste filtrado de este mes ({spent}) supera tu presupuesto mensual de {budget}.",
  "budget.banner.dismiss": "Descartar",

  // Confirms / toasts
  "confirm.delete.title": "¿Eliminar \"{name}\"?",
  "confirm.delete.description": "Esto elimina permanentemente la traza y todos sus eventos, spans, llamadas a modelo y herramientas de la base de datos local.",
  "confirm.delete.confirm": "Eliminar",
  "confirm.delete.cancel": "Cancelar",
  "confirm.bulk-delete.title": "¿Eliminar {count} trazas?",
  "confirm.bulk-delete.description": "Esto elimina permanentemente las trazas seleccionadas y todos sus eventos hijos. No se puede deshacer.",
  "toast.deleted": "Traza eliminada",
  "toast.bulk-deleted": "{count} trazas eliminadas",
  "toast.exported": "Exportado como CSV",
  "toast.nothing-to-export": "Nada que exportar",
  "toast.delete-failed": "No se pudo eliminar la traza",
  "toast.export-failed": "Error al exportar",

  // Heat map
  "heatmap.title": "Actividad",
  "heatmap.legend.less": "Menos",
  "heatmap.legend.more": "Más",
  "heatmap.tooltip.zero": "Sin trazas el {date}",
  "heatmap.tooltip.one": "1 traza el {date}",
  "heatmap.tooltip.many": "{count} trazas el {date}",

  // Empty
  "empty.title": "Aún no hay trazas grabadas",
  "empty.subtitle": "Studio está escuchando trazas en {url}",

  // Errors
  "error.boundary.title": "Algo ha fallado",
  "error.boundary.subtitle": "Ha ocurrido un error inesperado en la UI de Studio. Recarga la página para recuperar.",
  "error.boundary.reload": "Recargar página",
  "error.boundary.copy": "Copiar detalles",

  // Shortcuts
  "shortcuts.title": "Atajos de teclado",
  "shortcuts.empty": "No hay atajos registrados en esta página.",
  "shortcuts.help.show": "Mostrar atajos de teclado",
};
