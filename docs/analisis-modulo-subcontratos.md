# Análisis técnico previo al módulo Subcontratos

**Fecha de revisión:** 2026-07-13  
**Alcance:** análisis estático del repositorio y comprobación de la base activa en modo lectura.  
**Estado:** no se implementó ni modificó funcionalidad. El único artefacto generado por esta revisión es este informe.

## Resumen ejecutivo

La aplicación es un sistema local de una sola página: React mantiene la navegación mediante estado interno y consume directamente una API FastAPI en `http://127.0.0.1:8000`. FastAPI usa SQLAlchemy sobre la base SQLite `presupuestos.db`; Alembic controla el esquema. No existe autenticación ni autorización.

El módulo visible como **Presupuestos** ya corresponde a la implementación `PresupuestosV2`. Un proyecto funciona, en la práctica, como contenedor de un único presupuesto jerárquico: no hay tabla `presupuestos` ni una entidad formal de versiones. Su estructura está en `nodos_presupuesto`, mediante una lista de adyacencia (`padre_id`) y un orden explícito. Un rubro operativo no se identifica solo por `tipo`: debe cumplir `activo_como_rubro = true` y no tener hijos.

La aplicación ya reconoce rubros **Subcontratados** dentro de Vinculación, Análisis y exportación. Los representa en el mismo nodo mediante `observaciones = "SIN_APU"`, `tipo_rubro = "SIN_APU"`, `apu_id = NULL` y el precio opcional `precio_unitario_subcontratado`. Esto ofrece un punto de partida para la pantalla solicitada, pero no constituye todavía un modelo normalizado de subcontratos, proveedores, ofertas, adjudicaciones o historial de precios.

## 1. Arquitectura general

| Capa | Tecnología y comportamiento actual |
|---|---|
| Frontend | React 19.2.6, React DOM 19.2.6, Vite 8.0.12 y Tailwind CSS 4.3.0. Componentes funcionales y hooks; no usa una librería externa de estado. |
| Navegación | Estado local en `App.jsx`; no hay React Router. Las “rutas” de pantalla son valores como `dashboard`, `recursos`, `apus`, `apu_detalle` y `presupuestos`. |
| Backend | FastAPI 0.136.3 con Uvicorn. Routers para recursos, APUs, presupuestos y tablero. |
| Base de datos | SQLite. La base activa y única es `presupuestos.db` en la raíz. La revisión read-only confirmó la revisión Alembic `0017_uso_recursos_configuraciones`. |
| Acceso a datos | SQLAlchemy 2.0.50 con modelos declarativos y sesiones síncronas; Alembic 1.18.4 para migraciones. |
| Excel | `openpyxl` 3.1.5. También están instalados `pandas` y `numpy`, pero las exportaciones revisadas se generan directamente con `openpyxl`. |
| Autenticación | **No existe.** No hay login, usuarios, JWT, OAuth, sesiones de usuario ni dependencias de autorización. CORS permite orígenes locales de Vite. |

### Organización principal de carpetas

```text
presupuestos/
├─ presupuestos.db                 # base SQLite activa
├─ backend/
│  ├─ app/
│  │  ├─ api/                      # endpoints FastAPI
│  │  ├─ models/                   # modelos SQLAlchemy
│  │  ├─ schemas/                  # esquemas Pydantic
│  │  ├─ main.py                   # aplicación y registro de routers
│  │  ├─ db.py                     # engine, sesión y dependencia de DB
│  │  └─ backup.py                 # respaldos de la base
│  └─ alembic/versions/            # migraciones versionadas
├─ frontend/
│  └─ src/
│     ├─ pages/                    # pantallas de primer nivel
│     ├─ modules/presupuestos-v2/  # módulo Presupuestos actual
│     │  ├─ components/
│     │  ├─ logic/
│     │  └─ views/
│     ├─ components/ui.jsx         # componentes visuales compartidos
│     └─ App.jsx                   # navegación principal
├─ tests/                          # pruebas backend
└─ docs/                           # documentación del producto
```

## 2. Funcionamiento actual del módulo Presupuestos

### Pantallas y rutas existentes

La aplicación no expone URLs frontend distintas. `App.jsx` cambia componentes con estado:

| Pantalla visible | Estado interno | Componente |
|---|---|---|
| Tablero | `dashboard` | `Dashboard.jsx` |
| Recursos | `recursos` | `Recursos.jsx` |
| APUs | `apus` | `Apus.jsx` |
| Detalle APU | `apu_detalle` | `ApuDetalle.jsx` |
| Presupuestos | `presupuestos` | `PresupuestosV2.jsx` → `PresupuestosV2Shell.jsx` |

Dentro de Presupuestos existen vistas internas, también por estado y no por URL:

- **Edición:** grilla tipo hoja de cálculo para nombre, unidad, metrado y estructura.
- **Vinculación:** árbol, tabla de rubros, estados y acciones Rubro–APU; aquí ya se maneja “Subcontratado”.
- **Desglose:** costos por rubro y categorías de APU.
- **Análisis:** comparación entre costo de referencia y costo meta/APU.
- **Uso de recursos:** consolidación de recursos por paquetes, agrupaciones configurables y exportación.

### Carga y selección de proyecto

1. `usePresupuestosV2Data()` solicita `GET /presupuestos/proyectos/`.
2. Selecciona por defecto el primer proyecto retornado.
3. La pantalla inicial del módulo muestra una lista de proyectos; `openProject()` fija el id y cambia de modo `lista` a `detalle`.
4. Al seleccionar un proyecto se cargan en paralelo:
   - `GET /presupuestos/proyectos/{id}/nodos`
   - `GET /presupuestos/proyectos/{id}/paquetes`
   - `GET /apus/?limit=2000`
   - `GET /apus/costos/resumen?limit=2000`
5. El proyecto queda bloqueado mientras se trabaja en el detalle; se vuelve a la lista mediante “Volver a proyectos”.

No hay un selector de “presupuesto” separado del proyecto, porque el modelo no contiene esa entidad.

### Representación jerárquica

La jerarquía persistida es una **lista de adyacencia**:

- `nodos_presupuesto.padre_id` apunta al nodo padre.
- `orden` controla la posición entre hermanos.
- `nivel` guarda la profundidad explícita.
- `tipo` conserva una clasificación estructural, pero no determina por sí solo si la fila es rubro.
- El criterio operativo real es `activo_como_rubro` y ausencia de hijos.

El frontend transforma los nodos planos en filas mediante `buildRows()` y usa utilidades de `logic/tree.js` (`descendantsOf`, visibilidad y colapsado). `PresupuestoTree.jsx` presenta contenedores y permite seleccionar una rama; las tablas filtran sus filas por los descendientes de esa selección.

### Visualización y edición de rubros

`EdicionView.jsx` ofrece selección de celdas y rangos, edición temporal en `drafts`, guardado por `PATCH /presupuestos/nodos/{id}`, creación simple o masiva, pegado tipo Excel, eliminación real de bloque y operaciones de estructura. Las columnas editables se concentran en la grilla; las acciones de mover/sangrar se envían al backend.

`VinculacionView.jsx` muestra estado, APU y precio meta; permite buscar y filtrar, vincular/desvincular, crear APU, crear APU ajustado, marcar como subcontratado y guardar `precio_unitario_subcontratado`. La selección es de una fila para acciones APU, aunque la grilla de Edición sí soporta rangos y `UsoRecursosView` selección múltiple de paquetes.

Estados visibles calculados por el frontend:

- `Subcontratado`: `observaciones === "SIN_APU"`.
- `Pendiente`: no tiene `apu_id` y no está marcado como `SIN_APU`.
- `Validado`, `Revisar` o `Vinculado`: combinan revisión, vínculo y control de costo.

Esta derivación confirma un riesgo ya conocido: el estado no está normalizado en una única columna y requiere leer `apu_id`, `tipo_rubro`, `observaciones` y campos de revisión.

## 3. Modelo de datos relacionado

### Mapa de entidades

| Concepto solicitado | Implementación actual | Observaciones |
|---|---|---|
| Proyectos | `proyectos` | `id`, nombre, código, descripción, estado y fechas. Es el contenedor raíz. |
| Presupuestos | **No hay tabla propia.** | El conjunto de `nodos_presupuesto` de un `proyecto_id` actúa como presupuesto del proyecto. No soporta varios presupuestos nominales por proyecto. |
| Versiones de presupuesto | **No existe entidad/versionado formal.** | Hay lotes de actualización e información de procedencia Excel, pero no snapshots completos consultables como versiones. |
| Rubros y estructura | `nodos_presupuesto` | Mezcla nodos estructurales y rubros en una misma tabla autorreferenciada. Incluye metrado, PU referencia, PU subcontratado y vínculo APU. |
| APUs | `apus` | Código, nombre, unidad, rendimiento, estado, `version` entero, etiquetas y soporte de APU base/ajustado por proyecto. El campo `version` no equivale a versionado del presupuesto. |
| Recursos de APU | `apu_items` → `recursos` | El ítem guarda APU, recurso opcional, categoría, cantidad, orden y marca de herramienta menor. |
| Categorías de recursos | `recursos.categoria` y `apu_items.categoria` | Strings, no FK a catálogo. Categorías de cálculo: material, mano de obra, equipo y transporte. La UI de creación también permite `otros`, que el motor suma dinámicamente pero no forma parte de los subtotales estándar de salida. |
| Cantidades | `apu_items.cantidad`; `nodos_presupuesto.metrado` | `cantidad` es coeficiente del recurso en APU; `metrado` multiplica el PU del rubro para obtener total. Ambas son `Float`. |
| Precios unitarios | `recursos.precio_unitario`, `nodos_presupuesto.precio_unitario_ref`, `nodos_presupuesto.precio_unitario_subcontratado` | El PU APU no se persiste: se deriva de recursos, cantidades y rendimiento. |
| Vinculación Rubro–APU | `nodos_presupuesto.apu_id` | FK nullable a `apus`. El estado funcional requiere además `tipo_rubro`, `observaciones` y revisión. |

### Entidades complementarias relevantes

- `actualizaciones_presupuesto_lotes`: auditoría resumida de importaciones/actualizaciones desde Excel; no guarda una copia completa de cada versión.
- `paquetes_presupuesto`: asocia una rama (`nodo_id`) a un paquete activo/liberado.
- `nodo_apu_revisiones` y `nodo_apu_revision_items`: historial de validación de cambios Rubro–APU, con snapshots parciales y motivos.
- `apu_plantillas`, `apu_plantilla_items`, `apu_plantilla_usos`: composiciones reutilizables y trazabilidad de aplicación.
- `uso_recursos_configuraciones`: guarda configuraciones JSON de agrupación/columnas para la vista de uso de recursos.
- Recursos y APUs pueden tener copias ajustadas por proyecto (`proyecto_id`, entidad base y procedencia).

### Situación específica de subcontratados

Actualmente un subcontratado **no es una entidad**. Es un estado del nodo:

```text
nodos_presupuesto
├─ apu_id = NULL
├─ tipo_rubro = "SIN_APU"
├─ observaciones = "SIN_APU"
└─ precio_unitario_subcontratado = valor opcional
```

No hay campos/tablas para proveedor, número de oferta, alcance, moneda, fecha, vigencia, condiciones, documentos, comparativo, adjudicación, responsable o múltiples cotizaciones. Incorporarlos directamente en `nodos_presupuesto` aumentaría la desnormalización; conviene definir primero si “Subcontratos” será solo una vista de trabajo o un dominio transaccional nuevo.

## 4. Cálculo actual de precios

### Fuente de verdad backend

`backend/app/api/apus.py`, función `calcular_costo_apu()`, calcula el PU:

1. Redondea a cuatro decimales rendimiento, precio de recurso y cantidad.
2. Calcula `cantidad × precio_unitario` por ítem.
3. Para `equipo` y `mano_de_obra`, multiplica además por `apu.rendimiento`.
4. Suma por categoría, redondeando a cuatro decimales en cada operación.
5. Calcula herramienta menor como `5% × subtotal mano_de_obra`.
6. Añade herramienta menor al subtotal `equipo`.
7. El PU es la suma de subtotales, redondeada a cuatro decimales.

Fórmula efectiva:

```text
material     = Σ(cantidad × precio)
transporte   = Σ(cantidad × precio)
mano_obra    = Σ(cantidad × precio × rendimiento)
equipo_base  = Σ(cantidad × precio × rendimiento)
herramienta  = mano_obra × 0.05
equipo       = equipo_base + herramienta
PU_APU       = material + transporte + mano_obra + equipo
```

### Categorías

Las categorías estándar del motor son `material`, `mano_de_obra`, `equipo` y `transporte`. `es_herramienta_menor` identifica filas especiales que se omiten como recursos calculados; la herramienta menor se deriva del 5% de MO. La UI admite `otros`, pero no está alineada de forma completa con el desglose estándar, por lo que sería riesgoso reutilizarla sin decidir su tratamiento.

### Directos, indirectos y totales

- **Costo directo:** el PU calculado del APU; incluye herramienta menor.
- **Costos indirectos:** no existe modelo ni fórmula de indirectos, utilidad, financiamiento, impuestos u otros recargos en el motor revisado.
- **Total del rubro:** `metrado × PU`.
- **Total de contenedor/proyecto:** suma de totales de rubros descendientes.
- **Subcontratado:** usa `precio_unitario_subcontratado`; si falta, el frontend cae al `precio_unitario_ref`. El backend de exportación aplica su helper específico para el PU subcontratado.

### Persistencia y recálculo

El PU APU, subtotales y totales **se calculan dinámicamente** en `/apus/{id}/costo`, `/apus/costos/resumen`, exportaciones y vistas. Se almacenan los insumos, no el resultado calculado. Esto evita costos obsoletos persistidos, pero hace que un cambio global de recurso pueda modificar simultáneamente muchos APUs y rubros.

El frontend (`ApuDetalle.jsx`) replica la fórmula para respuesta inmediata. `data.js` vuelve a calcular totales de rubro y acumulados de contenedores con los costos recibidos. Por tanto hay cálculo distribuido: backend es la fuente de verdad, pero la UI también contiene lógica financiera.

### Redondeos

- Backend APU: cuatro decimales por dato y por operación con `round(..., 4)`.
- UI APU y Presupuestos: PU, cantidades y porcentajes generalmente a cuatro decimales; totales agregados de algunas vistas se muestran a dos.
- Excel operativo: metrado, dinero y porcentajes a cuatro decimales.
- Excel de uso de recursos: cantidades a cuatro decimales, importes a dos.
- Al usar columnas SQLite `Float`, no hay aritmética decimal exacta. Para contratos y conciliación financiera debe evaluarse `Decimal/Numeric` o una política explícita de tolerancias.

## 5. Exportaciones actuales

### Presupuesto operativo

- Endpoint: `GET /presupuestos/proyectos/{proyecto_id}/exportar-operativo.xlsx`.
- Parámetros: `root_nodo_id` para exportar una rama y `vista_exportacion` para filtrar.
- Vistas: todo, pendientes, vinculados, revisar y subcontratados.
- Generador: `openpyxl`, construido programáticamente en `presupuestos.py`.
- Hojas: **Presupuesto operativo**, **Resumen** y **Desglose Rubros**.
- Columnas operativas: nivel, tipo, item, descripción, unidad, metrado, PU/total de referencia, APU/nombre, PU/total meta, diferencias, estado y observaciones.
- Columnas de desglose: estructura, APU/ajuste, materiales, MO, equipos, transporte, herramienta menor y total meta.

La vista exportada se decide en el frontend mediante `EXPORT_VIEWS`; el backend valida el valor y conserva los ancestros de cada rubro coincidente. Las columnas no son configurables por el usuario: están codificadas en listas Python.

### Uso de recursos

- Endpoint: `POST /presupuestos/proyectos/{proyecto_id}/uso-recursos/exportar.xlsx`.
- Entrada: `row_fields` y `package_ids`.
- Permite agrupar por capítulo, categoría, rubro, APU y recurso; el usuario elige paquetes mediante checkboxes.
- Genera una matriz por paquete con origen, cantidad, costo unitario y costo total, más consolidados.

### Importación y plantillas

Existe importación/actualización desde Excel, pero no es una exportación. El botón “Importar Excel” está deshabilitado en la UI V2 actual aunque los endpoints backend existen.

No se encontró un archivo `.xlsx` usado como plantilla de exportación. Las dos exportaciones crean libros desde cero; los estilos, columnas y hojas están embebidos en `presupuestos.py`. Sí existen **plantillas de composición APU**, pero son registros de base de datos, no plantillas Excel.

## 6. Patrones reutilizables para Subcontratos

| Necesidad | Patrón existente reutilizable | Límites actuales |
|---|---|---|
| Tabla principal | Grillas de `VinculacionView`, `EdicionView` y `UsoRecursosView`; `DataTable` compartida para casos simples. | Las grillas complejas son implementaciones específicas, no un componente genérico único. |
| Árbol/alcance | `PresupuestoTree`, `descendantsOf`, selección de rama y conteos por contenedor. | Debe conservar el criterio real de rubro operativo. |
| Filtros | `vincFilters`, `analysisFilters`, chips y búsqueda con debounce. Ya existe filtro “Subcontratados”. | El estado se deriva de varios campos. |
| Selección múltiple | Rangos de celdas/filas en Edición y checkboxes de paquetes en Uso de recursos. | Vinculación opera principalmente sobre una fila; una acción masiva de subcontratos requiere reglas nuevas. |
| Formularios | `ModalShell`, `ModalFormGrid`, `fieldClass`, validación local y estados saving/error. | No hay una capa de formularios/esquemas compartida ni validación de dominio de subcontratos. |
| Modales | Exportación, recurso, paquete, vínculo APU, revisión, impacto y edición APU. | Conviene evitar concentrar toda la nueva pantalla en un modal demasiado grande. |
| Servicios frontend | `usePresupuestosV2Data()` centraliza carga base; el resto usa `fetch` directo. | No hay cliente API tipado ni capa de servicios consistente; ampliar `data.js` puede aumentar acoplamiento. |
| Endpoints | CRUD de nodos; marcar/desmarcar sin APU; guardar PU subcontratado; paquetes; revisiones. | No hay CRUD de subcontratos ni proveedores/cotizaciones. |
| Exportación | Generador operativo ya filtra `subcontratados`; exportador de uso de recursos admite campos/paquetes configurables. | No existe plantilla reusable ni exportación específica de comparativos de subcontrato. |
| Historial/auditoría | Lotes de actualización, revisiones Rubro–APU, usos de plantillas, fechas y origen de edición. | No hay auditoría general de cambios ni usuario actor, debido a que tampoco hay autenticación. |

### Reutilización recomendada sin definir aún el diseño

La vía de menor riesgo para una primera pantalla read-only sería reutilizar el shell de Presupuestos, el proyecto seleccionado, el árbol/alcance, la detección `sin_apu`, los filtros y el PU subcontratado. Si la pantalla debe administrar proveedores, cotizaciones o adjudicaciones, será necesario un modelo propio y migraciones; no debería resolverse agregando más texto a `observaciones`.

## 7. Riesgos técnicos y dependencias

### Restricciones del modelo

1. **Proyecto y presupuesto están fusionados.** No se puede distinguir naturalmente entre varios presupuestos o versiones de un mismo proyecto.
2. **Subcontratado es un estado, no una entidad.** Solo hay un PU por nodo; no existen alternativas, moneda, proveedor o vigencia.
3. **Estado Rubro–APU desnormalizado.** `apu_id`, `tipo_rubro`, `observaciones` y revisión pueden contradecirse; ya se conoce el patrón `VINCULADO` + APU + `SIN_APU`.
4. **Categorías como strings duplicados.** `recursos.categoria` y `apu_items.categoria` pueden divergir; no hay FK a catálogo.
5. **Valores monetarios en Float.** Puede haber diferencias binarias y acumulativas.
6. **Sin autenticación.** No se puede atribuir auditoría ni restringir aprobación/adjudicación.
7. **API local fija.** La URL está repetida en frontend y no se observa configuración de entorno centralizada.

### Datos no normalizados

- Estado funcional en varios campos y valores semánticos dentro de `observaciones`.
- Categoría/subcategoría/familia como texto.
- Etiquetas y configuraciones como JSON.
- Origen Excel embebido por nodo.
- No existe catálogo de proveedores, monedas, impuestos o tipos de subcontrato.

### Cálculos duplicados

El costo APU se calcula en backend y se replica en `ApuDetalle.jsx`; los totales, diferencias y agregados se recalculan en `data.js` y también durante la exportación Python. Una modificación de fórmula debe probar backend, detalle APU, vistas de presupuesto y Excel.

### Recalcular parcialmente un APU

- Modificar un recurso compartido cambia todos los APUs que lo usan; además, los APUs pueden ser base o ajustados por proyecto.
- Recalcular solo una categoría puede ser incorrecto si cambia MO, porque herramienta menor depende de MO y se incorpora en equipo.
- Cambiar rendimiento afecta MO y equipo, no materiales/transporte.
- Un rubro subcontratado no debería recibir costos parciales de APU mientras esté marcado `SIN_APU`; mezclar ambos orígenes generaría un PU híbrido no representado por el modelo.
- Los paquetes liberados pueden seguir compartiendo el mismo APU; el backend ya incluye análisis de impacto y aislamiento de no liberados, patrón que debe respetarse.
- La ausencia de snapshots de costo impide reconstruir exactamente qué PU dinámico se veía en una fecha pasada si luego cambian recursos o rendimiento.

### Dependencias y controles necesarios antes de implementar

- Cualquier tabla o columna nueva requiere migración Alembic.
- Cualquier endpoint nuevo requiere pruebas en `tests/`.
- No debe modificarse `backend/app/db.py` sin confirmación explícita.
- Debe decidirse si Subcontratos es: (a) vista de rubros `SIN_APU`, (b) gestión de precios por rubro, o (c) ciclo completo de proveedores/cotizaciones/adjudicación. Las opciones implican modelos muy distintos.
- Debe definirse la fuente del “precio válido” y si sustituye al PU referencia o solo alimenta el PU meta.

## 8. Archivos relevantes

| Ruta | Responsabilidad | Relevancia para Subcontratos |
|---|---|---|
| `frontend/src/App.jsx` | Navegación superior y montaje de pantallas. | Punto para exponer una pantalla de primer nivel, si no vive como vista interna. |
| `frontend/src/pages/PresupuestosV2.jsx` | Entrada ligera al módulo. | Confirma que Presupuestos actual usa el shell V2. |
| `frontend/src/modules/presupuestos-v2/PresupuestosV2Shell.jsx` | Proyecto activo, vistas, ribbon, paquetes, exportación y modales globales. | Punto natural para una vista interna Subcontratos y para reutilizar contexto/proyecto. |
| `frontend/src/modules/presupuestos-v2/data.js` | Carga de proyectos/nodos/APUs/costos; transforma nodos a filas y calcula estados/totales. | Contiene la detección actual de subcontratado y el PU efectivo. Es sensible a inconsistencias. |
| `frontend/src/modules/presupuestos-v2/logic/tree.js` | Operaciones sobre jerarquía plana. | Permite filtrar subcontratos por rama y conservar ancestros. |
| `frontend/src/modules/presupuestos-v2/components/PresupuestoTree.jsx` | Árbol seleccionable y colapsable. | Reutilizable como filtro jerárquico. |
| `frontend/src/modules/presupuestos-v2/views/VinculacionView.jsx` | Vinculación Rubro–APU, filtros, búsqueda, revisión y PU subcontratado. | Implementación funcional vigente más cercana al dominio solicitado. |
| `frontend/src/modules/presupuestos-v2/views/EdicionView.jsx` | Grilla editable, selección por rangos, altas, borrado y estructura. | Referencia para tabla editable y operaciones masivas controladas. |
| `frontend/src/modules/presupuestos-v2/views/AnalisisView.jsx` | Comparación de costos y filtros. | Ya incluye filtro de subcontratados y diferencia referencia/meta. |
| `frontend/src/modules/presupuestos-v2/views/DesgloseView.jsx` | Desglose por rubro/categoría. | Define cómo tratar rubros sin composición APU. |
| `frontend/src/modules/presupuestos-v2/views/UsoRecursosView.jsx` | Selección múltiple de paquetes, configuraciones y Excel. | Buen patrón para filtros configurables y selección múltiple. |
| `frontend/src/components/ui.jsx` | Botones, tablas simples, filtros, modales y formularios compartidos. | Base visual para mantener consistencia. |
| `frontend/src/pages/ApuDetalle.jsx` | Edición y recálculo interactivo de un APU. | Muestra la lógica duplicada y los efectos de modificar recursos/rendimiento. |
| `backend/app/main.py` | Inicializa FastAPI, CORS y routers. | Registro de un router nuevo si Subcontratos obtiene API propia. |
| `backend/app/db.py` | Conexión a SQLite y sesiones. | Infraestructura crítica; no requiere cambios para un módulo normal. |
| `backend/app/models/presupuesto.py` | Proyecto, nodos, paquetes, lotes y revisiones. | Contiene `precio_unitario_subcontratado` y el estado actual; referencia central del modelo. |
| `backend/app/models/apu.py` | APU, ítems, ajustes y plantillas. | Necesario para separar correctamente APU de subcontrato. |
| `backend/app/models/recurso.py` | Recursos, precios y copias por proyecto. | Dependencia de cualquier comparación make-or-buy o impacto de costos. |
| `backend/app/api/presupuestos.py` | CRUD, árbol, importación, vínculo APU, paquetes, uso de recursos y Excel. | Principal API a reutilizar o separar; ya exporta y actualiza PU subcontratado. |
| `backend/app/api/apus.py` | CRUD y cálculo oficial de APUs. | Fuente de verdad para comparar APU propio frente a precio subcontratado. |
| `backend/app/api/recursos.py` | CRUD, clasificación y precio de recursos. | Fuente de datos para costo interno y filtros. |
| `backend/alembic/versions/0016_precio_subcontratado_nodos.py` | Agrega `precio_unitario_subcontratado`. | Evidencia del soporte mínimo actual y su alcance limitado a un campo. |
| `backend/alembic/versions/0012_paquetes_presupuesto.py` | Crea paquetes por ramas del presupuesto. | Puede aportar alcance/lotes de trabajo a una futura contratación. |
| `backend/alembic/versions/0015_revision_apu_por_rubro.py` | Historial de revisión Rubro–APU. | Patrón para auditoría estructurada con cabecera, detalle y snapshot. |
| `tests/test_export_presupuesto_operativo.py` | Pruebas de exportación y estados. | Debe ampliarse si Subcontratos altera filtros o columnas del Excel operativo. |
| `tests/test_uso_recursos.py` | Pruebas de consolidación/configuración/exportación. | Referencia para exportaciones parametrizadas. |
| `tests/test_paquetes_presupuesto.py` | Pruebas de paquetes y estados. | Útil si subcontratos se agrupan por paquete. |

## Conclusión y siguiente decisión recomendada

La aplicación ya tiene una **señal mínima de subcontratación** y patrones suficientes para construir primero una vista read-only sin alterar datos. No obstante, una pantalla operativa completa no debe diseñarse hasta definir el alcance funcional del término “Subcontratos”. La decisión principal es si se limitará a reunir rubros marcados `SIN_APU` y editar su PU, o si administrará un ciclo de contratación con proveedores y múltiples ofertas.

Antes de implementar, conviene preparar una especificación corta que defina: unidad de trabajo (rubro o paquete), estados, proveedor/cotizaciones, regla de precio, moneda/impuestos, documentos, permisos/aprobaciones, historial y formato de exportación. Esa definición permitirá decidir si se reutiliza `nodos_presupuesto` o si hacen falta tablas normalizadas nuevas.
