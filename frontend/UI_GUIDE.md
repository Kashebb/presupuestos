# Guia UI - Sistema de Presupuestos

Esta guia define las reglas minimas para que la app mantenga una interfaz consistente. La prioridad es que sea clara, compacta y operativa.

## Principios

- Usar primero los componentes comunes de `src/components/ui.jsx`.
- Evitar estilos `style={{ ... }}` en pantallas nuevas, salvo valores dinamicos inevitables.
- No crear una variante visual nueva si existe un componente equivalente.
- Las pantallas deben ser densas, legibles y con jerarquia clara.
- Las acciones principales van arriba; los filtros van antes de la tabla; el detalle va dentro de la tabla o panel correspondiente.

## Tokens Base

Los tokens viven en `src/index.css` dentro de `:root`.

| Uso | Token |
| --- | --- |
| Primario | `--color-primary`, `--color-primary-dark`, `--color-primary-soft` |
| Fondo | `--color-bg` |
| Superficie | `--color-surface`, `--color-surface-muted` |
| Bordes | `--color-border`, `--color-border-strong` |
| Texto | `--color-text`, `--color-muted` |
| Estados | `--color-success`, `--color-warning`, `--color-danger`, `--color-info` |
| Radio | `--radius-sm`, `--radius-md` |
| Sombra | `--shadow-sm` |

No usar colores nuevos directamente si pueden expresarse con estos tokens.

## Tipografia

| Elemento | Tamano | Peso | Uso |
| --- | --- | --- | --- |
| Titulo de pagina | `20px` | `800` | `PageHeader` |
| Subtitulo | `12px` | normal | Ayuda breve bajo titulo |
| Titulo de seccion | `13px` | `800` | `SectionHeader` |
| Texto de tabla | `12px` | normal | Celdas y contenido operativo |
| Encabezado de tabla | `11px` | `800` | Columnas |
| Badges/chips | `10px` a `11px` | `700-800` | Estados y filtros |
| Botones | `12px` | `700` | Acciones principales/secundarias |

Regla: si un bloque nuevo necesita texto mayor a `20px`, probablemente no corresponde a esta app operativa.

## Espaciado

| Caso | Regla |
| --- | --- |
| Margen de pantalla | `.page-wrap`: `18px 22px 28px` |
| Separacion del encabezado | `PageHeader` usa `16px` abajo |
| Separacion entre bloques | `12px` a `16px` |
| Gaps internos | `6px`, `8px`, `10px`, `12px` |
| Padding de panel | `10px` a `16px` |
| Padding de tabla | `10px 11px` |

Evitar bloques pegados sin margen. Si dos controles tienen funciones distintas, debe existir separacion visual.

## Componentes Disponibles

| Componente | Uso |
| --- | --- |
| `PageHeader` | Titulo, subtitulo, acciones principales |
| `ScreenBlock` | Separacion vertical consistente entre bloques de pantalla |
| `BlockHeader` | Titulo de bloque con hint o acciones |
| `SectionHeader` | Encabezado de tabla, grupo o bloque operativo |
| `ActionButton` | Cualquier boton de accion |
| `MetricStrip` | Tarjetas con numero, detalle y filtro operativo |
| `CategoryStrip` | Filtros compactos por categoria o clasificacion |
| `ToolbarFilter` | Filtros tipo chip dentro de barras o headers |
| `DataTable` | Tablas principales |
| `StatusBadge` | Estados y controles visuales |
| `Panel` | Contenedor simple |
| `EmptyState` | Estado sin registros |
| `LoadingState` | Estado de carga |
| `ErrorBanner` | Errores visibles |
| `ModalShell` | Modales centrados |
| `ModalCodeHeader` | Encabezado de modal con titulo y codigo automatico |
| `ModalFormGrid` | Grilla formal de dos columnas para formularios de modal |
| `ModalFormFull` | Campo que ocupa todo el ancho dentro de `ModalFormGrid` |
| `BottomSheet` | Panel inferior temporal |

## Reglas Por Patron

### Metricas

Usar `MetricStrip` cuando el usuario necesita ver cantidad, estado o alerta.

Debe incluir:

- `label`
- `value`
- `detail` si aporta contexto
- `tone`
- `active` si filtra
- `onClick` si es interactivo

No usar `MetricStrip` para listas largas de categorias.

Las metricas deben vivir dentro de `ScreenBlock` para mantener separacion uniforme con filtros, encabezados y tablas.

### Categorias

Usar `CategoryStrip` para filtros compactos por categoria.

Debe mostrar:

- etiqueta de grupo, por ejemplo `Categorias`
- chips con nombre corto
- estado activo claro

No debe mostrar contadores, subtitulos ni costos si esa informacion ya esta en `MetricStrip`.

Cuando `CategoryStrip` acompana a `MetricStrip`, ambos deben estar dentro del mismo `ScreenBlock`.

### Bloques De Pantalla

Usar `ScreenBlock` para separar bloques principales:

- metricas
- filtros de categoria
- tablas
- secciones del tablero

Usar `BlockHeader` para titulos como `Pendiente de atencion`, `Resumen general` o `Presupuestos en trabajo`.

No usar margenes sueltos `mb-*` como regla principal si el bloque puede usar `ScreenBlock`.

### Tablas

Usar `DataTable` para listados principales. Las tablas deben:

- tener encabezados claros
- alinear valores monetarios y numericos a la derecha
- usar `StatusBadge` para estados
- evitar acciones de texto sueltas si existe `ActionButton`

### Formularios

Usar:

- `fieldClass` para inputs, selects y textareas
- `labelClass` para etiquetas
- `.form-stack` para formularios verticales
- `ModalShell size="form"` para modales de captura con varios campos
- `ModalFormGrid` para formularios de dos columnas dentro de modales
- `ModalFormFull` para campos que deben ocupar todo el ancho

Los errores deben ir en `ErrorBanner` o texto corto debajo del campo si aplica solo a una fila.

Regla de alineacion para modales de formulario:

- Todas las filas de dos campos deben usar la misma grilla.
- Las dos columnas deben tener el mismo ancho salvo que haya una razon funcional fuerte.
- El gap entre columnas debe ser unico y consistente.
- Los bordes izquierdo y derecho de los campos deben quedar alineados.
- No mezclar `grid-cols-*`, clases puntuales y estilos inline dentro del mismo formulario.

### Modales

Usar `ModalShell`.

Tamanos:

- `sm`: formularios pequenos
- `md`: formulario normal
- `form`: formularios de captura con codigo automatico o varias filas
- `lg`: previews, importaciones o contenido ancho

No escribir manualmente `modal-overlay` y `modal-shell` dentro de una pagina.

Todo modal debe pasar `onClose` cuando pueda cerrarse. `Escape` debe cancelar la accion activa sin guardar.

## Patrones Operativos De Presupuestos

La pantalla `Presupuestos` concentra trabajo operativo con presupuestos grandes. Estos patrones deben reutilizarse antes de crear variantes nuevas en `Recursos`, `APUs` u otras pantallas.

### Barra Contextual Por Seleccion

- Sin seleccion, mostrar solo contexto, busqueda, filtros y selectores de vista.
- Con un rubro seleccionado, mostrar acciones individuales que aplican a ese rubro.
- Con varios rubros seleccionados, mostrar acciones masivas seguras y mover acciones destructivas o secundarias a `Mas acciones`.
- Reservar `Mas acciones` para opciones futuras como editar rubro, agregar rubro debajo o marcar obsoleto; no saturar la barra principal.

Pendiente de extraccion: `SelectionActionBar`.

### Selector Compacto De Vista

- Cuando existan mas de 4 vistas de columnas, usar un selector compacto con etiqueta clara, por ejemplo `Vista: Presupuesto`.
- No eliminar vistas existentes para ganar espacio.
- La vista activa debe ser visible sin obligar a abrir el selector.

Pendiente de extraccion: `ColumnViewSelector`.

### KPI Economico Priorizado

- En presupuestos, la diferencia comparable y su porcentaje deben leerse primero.
- Los valores de referencia y meta comparables quedan visibles como soporte.
- No cambiar la semantica de color sin validar la logica de negocio.

Pendiente de extraccion: `BudgetKpiBar`.

### Acciones Masivas Con Validacion

- Antes de una accion masiva que vincule rubros con APUs, validar unidades normalizadas.
- Equivalencias iniciales: `u`, `und`, `unidad` -> `u`; `m`, `ml` -> `m`; `m2`, `m²` -> `m2`; `m3`, `m³` -> `m3`; `kg` -> `kg`.
- Bloquear acciones masivas con unidades mezcladas o incompatibles.

Pendiente de extraccion: `normalizeUnit` y `validateBulkApuLink`.

## Anti-Patrones

- Crear botones con `style={{ ... }}` en cada pantalla.
- Mezclar tarjetas grandes con chips sin separacion ni titulo.
- Usar colores hex nuevos sin justificar.
- Repetir estados de carga o vacio con divs manuales.
- Crear una tabla manual cuando `DataTable` puede resolverlo.
- Poner filtros sin indicar que filtran.
- Agregar mucho texto explicativo dentro de pantallas operativas.

## Checklist Antes De Cerrar Un Cambio UI

- El cambio usa componentes comunes cuando existen.
- No introduce una segunda variante visual sin necesidad.
- El espaciado entre bloques se ve intencional.
- La jerarquia es clara: pagina, metricas/filtros, seccion, tabla.
- `npm run lint` pasa.
- `npm run build` pasa.
- Si el cambio es visual, revisar la pantalla en navegador antes de darlo por cerrado.
