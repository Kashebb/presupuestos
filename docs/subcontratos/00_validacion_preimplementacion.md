# Validación preimplementación — Módulo Subcontratos

**Fecha:** 2026-07-13  
**Fase:** 0 — diagnóstico y validación  
**Estado:** implementación no iniciada  
**Alcance de escritura:** únicamente este informe; no se modificó código, base de datos ni migraciones.

## 1. Entendimiento y fuentes revisadas

El alcance aprobado es crear **Subcontratos como vista interna de Presupuestos**, ligada al proyecto abierto, para asignar rubros operativos con APU a un único subcontrato activo, seleccionar categorías completas, calcular el PU desde el motor oficial, conservar snapshots y exportar tres hojas Excel.

Fuentes contrastadas:

- `01_PRD_MODULO_SUBCONTRATOS.md`, versión 1.0 aprobada.
- `02_PROMPT_IMPLEMENTACION_CODEX_SUBCONTRATOS.md`.
- `docs/analisis-modulo-subcontratos.md`.
- Código actual de frontend, backend, modelos, migraciones y pruebas.
- `presupuestos.db` abierta en modo SQLite read-only.
- `AGENTS.md` y `CONTEXTO_ACTUAL_APP.md`.
- `COT_OBRACIVIL_PTARD_260713.xlsx`, inspeccionado en modo lectura estructural y visual.

El Excel no está dentro del repositorio y no debe copiarse ni modificarse; funciona como referencia visual externa para la Fase 7.

## 2. Hallazgos confirmados

### 2.1 Arquitectura y base activa

- Frontend: React 19 + Vite + Tailwind, sin React Router. `frontend/src/App.jsx:8-23` navega con estado local.
- Entrada vigente: `App.jsx:72` monta `PresupuestosV2`; `frontend/src/pages/PresupuestosV2.jsx` delega en `PresupuestosV2Shell`.
- Backend: FastAPI y SQLAlchemy síncrono. Los routers se registran en `backend/app/main.py:25-28`.
- Base activa verificada: `presupuestos.db` en la raíz. Revisión Alembic actual: `0017_uso_recursos_configuraciones`.
- No existe autenticación, autorización ni actor de auditoría. No deben inventarse roles.
- Dependencias relevantes existentes: SQLAlchemy 2.0.50, Alembic 1.18.4 y openpyxl 3.1.5. No hace falta una dependencia nueva.

Estado vivo de la base:

| Métrica | Valor |
|---|---:|
| Proyectos | 1 |
| Nodos | 1.613 |
| Rubros operativos | 1.258 |
| APUs | 383 |
| Ítems APU | 1.357 |
| Recursos | 485 |

### 2.2 Integración exacta de la vista

La vista debe integrarse en `frontend/src/modules/presupuestos-v2/PresupuestosV2Shell.jsx`, después de abrir un proyecto, no como pantalla superior en `App.jsx`.

Ruta real:

`App.jsx` → `PresupuestosV2.jsx` → `PresupuestosV2Shell.jsx` → proyecto abierto → estado interno `view` → vista interna.

El shell define `view` en la línea 77, la cinta en las líneas 443-480 y renderiza vistas en las líneas 646-706. La integración recomendada es un grupo/acción **Subcontratos** en la cinta, con `view === "subcontratos"`, manteniendo `selectedProjectId` y sin modificar `App.jsx`.

### 2.3 Rubro operativo

La regla real coincide con `AGENTS.md` y el PRD: un rubro operativo requiere `activo_como_rubro == true` y no tener hijos. El helper backend está en `backend/app/api/presupuestos.py:268-270`; el frontend prioriza `es_rubro_operativo` y luego `activo_como_rubro && !tiene_hijos` en `data.js:64-69`.

Riesgo: ambos conservan fallback legacy a `tipo == "RUBRO"` cuando faltan flags. El nuevo servicio debe usar el criterio backend autoritativo y no reimplementar el fallback en cada endpoint.

### 2.4 Motor oficial de APUs

Fuente de verdad: `backend/app/api/apus.py:86-117`, función `calcular_costo_apu()`.

- Redondea rendimiento, cantidad, precio y operaciones a 4 decimales mediante `_r4`.
- Material y transporte: `cantidad × precio`.
- Mano de obra y equipo: `cantidad × precio × rendimiento`.
- Herramienta menor: `5%` del subtotal de mano de obra.
- PU total: suma de subtotales.

Consumidores confirmados:

- `GET /apus/costos/resumen`.
- `GET /apus/{id}/costo`.
- estados, análisis y exportación operativa en `backend/app/api/presupuestos.py`.
- frontend mediante `costsByApu`; además `ApuDetalle.jsx` replica parte del cálculo para interacción inmediata.

La extracción futura debe conservar resultados bit a bit a 4 decimales y tener pruebas de regresión sobre APUs representativos.

### 2.5 Herramientas menores: contradicción de representación, no de fórmula

La fórmula coincide con el PRD, pero la respuesta actual mezcla H.M. dentro de equipos:

- `apus.py:109`: calcula H.M.
- `apus.py:110`: la suma a `subtotales["equipo"]`.
- `apus.py:116`: también la devuelve separada como `herramienta_menor`.

Consecuencia: `subtotales.equipo` significa hoy **equipo base + H.M.**. Para Subcontratos no puede sumarse `equipo + herramienta_menor` porque duplicaría H.M. La Fase 2 debe producir un desglose normalizado con `equipos_sin_hm` y `herramientas_menores`, preservando el contrato actual de `calcular_costo_apu()` para no romper consumidores existentes.

### 2.6 Categorías y uso real de `otros`

El motor usa un diccionario dinámico (`apus.py:105`), por lo que un ítem con categoría `otros` sí entraría al PU total aunque no forme parte de los cuatro subtotales iniciales. Algunas pantallas permiten/contabilizan `otros`.

Comprobación read-only de la base viva:

- Recursos con `categoria = otros`: **0**.
- Ítems APU con `categoria = otros`: **0**.
- APUs afectados: **0**.

Categorías reales de ítems: material 866, mano de obra 417, equipo 64, transporte 10. Por tanto, la validación de `otros` es preventiva y debe permanecer bloqueante para confirmación, aunque hoy no haya datos afectados.

### 2.7 Cantidades físicas y Uso de recursos

Implementación vigente: `backend/app/api/presupuestos.py:1712-1838`.

- Precarga APU → ítems → recurso con `joinedload` (`1723-1731`), evitando N+1 en esa relación.
- Filtra rubros operativos con el helper oficial (`1757-1759`).
- Omite filas `es_herramienta_menor` y recursos nulos (`1802-1804`).
- Factor físico: rendimiento para mano de obra/equipo; 1 para material/transporte (`1805`).
- Cantidad: `metrado × item.cantidad × factor`, redondeada a 4 decimales (`1806`).
- Consolidación identifica la copia base mediante `recurso_base_id or recurso.id` (`1814-1818`).

Para materiales, la fórmula coincide con el PRD: `metrado × coeficiente`, sin rendimiento. El servicio nuevo debe reutilizar esta lógica en una función compartida; no debe llamar internamente al endpoint ni copiar la fórmula.

Diferencia a resolver técnicamente: el PRD pide agrupar snapshots por `recurso_id + unidad snapshot`, con fallback por código/descripción/unidad; Uso de recursos hoy usa `recurso_base_id or recurso.id` y no expone código en el movimiento. Subcontratos necesita su propia clave de snapshot conforme al PRD, apoyada en un helper común de cantidades.

### 2.8 Exportaciones actuales

- Presupuesto operativo: `GET /presupuestos/proyectos/{id}/exportar-operativo.xlsx`, `presupuestos.py:2183-2218`.
- Uso de recursos: `POST /presupuestos/proyectos/{id}/uso-recursos/exportar.xlsx`, `presupuestos.py:1894+`.
- Ambas usan openpyxl y construyen libros en código; no hay plantilla `.xlsx` reusable.
- La exportación operativa tiene tres hojas y estilos reutilizables conceptualmente, pero no un servicio de estilos compartido.
- La exportación operativa ejecuta `_sincronizar_niveles(db, proyecto_id)` antes de leer (`2194`). Esto supone escritura durante una operación GET y no debe copiarse al exportador de Subcontratos.

### 2.9 Estado legado “Subcontratado”

La app actual llama “Subcontratado” al estado legado `observaciones == "SIN_APU"` (`presupuestos.py:388-397`, `data.js:77-84`) y tiene `precio_unitario_subcontratado` en el nodo. El PRD prohíbe reutilizarlo como modelo nuevo.

Ambos conceptos deben coexistir sin mezclarse:

- `SIN_APU`: rubro externo/legado sin APU, visible pero no distribuible.
- Nuevo Subcontrato: entidad con rubros que sí tienen APU y selección de categorías.

La base viva no contiene actualmente filas con la inconsistencia conocida `tipo_rubro=VINCULADO + apu_id no nulo + observaciones=SIN_APU` (conteo actual: 0).

### 2.10 Excel de referencia

Archivo: `COT_OBRACIVIL_PTARD_260713.xlsx`. Tiene una sola hoja, **CONTRATO OC PTAR**. El rango con datos es `A1:G45`; existe formato aplicado hasta `P45`, pero H:P está visualmente vacío. No contiene gráficos ni hojas auxiliares.

#### Estructura confirmada

| Sección | Rango | Contenido |
|---|---|---|
| Título | `A1:G1` combinado | “PRESUPUESTO DE CONSTRUCCION DE OBRA CIVIL” |
| Cabecera | `A3:G4` | Descripción y fecha |
| Contratista | `A6:G8` | Representante legal, RUC, celular y correo |
| Términos | `A10:G11` | Plazo y forma de pago; `B11:G11` combinado, texto multilínea |
| Tabla de rubros | `A13:G29` | Rubro, descripción, unidad, cantidad, P. Unitario, P. Total, observación |
| Total | `A30:G30` | `TOTAL SIN IVA` y total en F30 |
| Materiales contratante | `A32:D36` | Título y filas descripción, unidad, cantidad |
| Firma | `E45:G45` combinado | “FIRMA CONTRATISTA” |

La tabla de rubros conserva jerarquía visual mediante filas de sección en la columna B (por ejemplo OBRA CIVIL, HORMIGONES NORMALES, ACERO DE REFUERZO, ARQUITECTURA y ALBAÑILERÍA). La columna A “Rubro” está vacía en la muestra, pero debe conservarse para el ítem/código jerárquico aprobado por el PRD.

#### Formato confirmado

- Tipografía predominante: Aptos Narrow, 12 pt; título 16 pt negrita.
- Encabezado de tabla: azul oscuro `#002060`, texto blanco, centrado y negrita.
- Filas de nivel principal: azul claro; subniveles en gris claro/negrita.
- Bordes finos en cabecera, contratista, términos y tabla.
- Descripciones con ajuste de texto y alturas variables.
- Anchos aproximados: A 23,8; B 62,9; C:F 15,1; G 23,8.
- Números visibles: cantidades y moneda con dos decimales; P. Unitario/P. Total con símbolo `$`.
- Fecha real en G4, mostrada como `7/13/26` en el libro de referencia.
- Configuración de impresión: orientación vertical, papel A4, escala 51%, márgenes estándar; zoom de hoja 85%.
- Combinaciones: `A1:G1`, `B7:C7`, `B8:C8`, `B11:G11`, `A30:D30` y `E45:G45`.

#### Fórmulas relevantes

Fórmulas encontradas:

- `F16 = E16*D16`
- `F24 = E24*D24`
- `F29 = E29*D29`
- `F30 = SUM(F14:F29)`
- `D33 = D16*0.05`
- `D34 = D21+D19+D17`
- `D35 = D26+D25+D24`
- `D36 = D29`

Los demás P. Total visibles de rubros están almacenados como valores, no como fórmulas. La muestra mezcla, por tanto, fórmulas y valores calculados. Para la exportación del módulo se recomienda usar los snapshots como fuente autoritativa y escribir valores reproducibles en todas las filas (o fórmulas de forma uniforme si se aprueba expresamente), sin copiar la inconsistencia. Las cantidades de materiales de referencia demuestran el patrón de consolidación esperado, pero la implementación debe calcularlas desde snapshots físicos, no mediante referencias posicionales a filas.

#### Adaptación al PRD

La referencia valida la apariencia de la hoja principal **Subcontrato**, pero no contiene las hojas adicionales **Desglose incluido** ni **Resumen** exigidas por el PRD. Estas dos hojas deben usar la misma identidad visual (azul oscuro, azul/gris claro, tipografía y formatos), no inventar secciones contractuales nuevas. Los campos “términos y condiciones”, RUC, celular, correo y firma aparecen en la referencia, pero no forman parte del modelo aprobado de la primera versión; no deben incorporarse como datos editables nuevos sin aprobación funcional.

## 3. Diferencias frente al análisis técnico previo

| Tema | Análisis previo | Verificación actual |
|---|---|---|
| Conteos | No fijaba snapshot vivo completo | 1 proyecto, 1.613 nodos, 1.258 rubros operativos, 383 APUs, 1.357 ítems, 485 recursos |
| `otros` | UI lo admite; motor dinámico | Confirmado y además uso real actual = 0 |
| Inconsistencia `VINCULADO/SIN_APU` | Riesgo conocido | Sigue siendo riesgo de modelo, pero conteo vivo actual = 0 |
| Herramientas menores | Indicaba que se añade a equipo | Se confirma que la API expone a la vez equipo con H.M. incluida y H.M. separada; esto exige normalización para evitar doble conteo |
| Subcontratos | Planteaba tres alcances funcionales posibles | El PRD ya resolvió el alcance: dominio nuevo de distribución por categorías; no reutilizar `SIN_APU` |
| Exportación de referencia | No había plantilla en repo | Excel externo inspeccionado: una hoja contractual A:G; no incluye Desglose ni Resumen |
| Snapshots | Señalaba ausencia histórica | El PRD define snapshots completos; la estructura propuesta es viable con carga bajo demanda |

## 4. Matriz PRD vs repositorio

| Requisito | Estado | Evidencia/impacto |
|---|---|---|
| Vista interna y proyecto activo | Confirmado | Shell y `selectedProjectId` ya existen |
| Rubro operativo real | Confirmado | Helper backend y bandera calculada |
| Rubros sin APU visibles/no asignables | Compatible | Nodos y estados actuales permiten distinguirlos |
| Exclusividad activa | No encontrado | Requiere servicio y tablas nuevas |
| Categorías completas | Parcial | Categorías existen como strings; falta dominio de selección |
| H.M. inseparable de MO | Fórmula confirmada; representación contradictoria | H.M. está embebida en equipo y expuesta aparte |
| PU automático desde motor oficial | Confirmado como base | Requiere desglose normalizado compartido |
| Cantidad física de materiales | Confirmado | Uso de recursos calcula desde coeficiente y metrado |
| `otros` no soportado | Compatible | Uso vivo cero; motor debe detectarlo explícitamente |
| Estados y snapshots | No encontrado | Requiere modelo, migración y servicios |
| Código SC secuencial no reusable | No encontrado | Requiere secuencia persistente/transacción |
| Exportación histórica | No encontrado | Requiere leer exclusivamente snapshots |
| Excel de tres hojas | Patrón parcial | Referencia valida hoja principal; Desglose y Resumen son requisitos nuevos del PRD |
| Permisos/auditoría avanzada | No existe y fuera de alcance | No implementar |
| Rendimiento por lotes | Patrón parcial | `joinedload` y cálculo consolidado existentes |

## 5. Modelo de datos final recomendado

Se recomienda conservar las tres entidades conceptuales del PRD y añadir una secuencia técnica mínima para garantizar códigos no reutilizables.

### `subcontratos`

- `id INTEGER PK`
- `proyecto_id INTEGER NOT NULL FK proyectos.id ON DELETE CASCADE`
- `codigo VARCHAR(30) NOT NULL`
- `nombre VARCHAR(200) NOT NULL`
- `contratista VARCHAR(250) NULL`
- `descripcion TEXT NULL`
- `estado VARCHAR(20) NOT NULL` (`BORRADOR`, `CONFIRMADO`, `ANULADO`)
- `fecha_confirmacion DATETIME NULL`
- `fecha_anulacion DATETIME NULL`
- `fecha_creacion DATETIME NOT NULL`
- `fecha_actualizacion DATETIME NOT NULL`
- `UNIQUE(proyecto_id, codigo)`
- índices `(proyecto_id, estado)` y `(proyecto_id, fecha_actualizacion)`.

### `subcontrato_codigo_secuencias` (infraestructura técnica)

- `proyecto_id INTEGER PK/FK`
- `ultimo_numero INTEGER NOT NULL`

Evita reutilizar códigos cuando un borrador se elimina. En SQLite, la asignación debe ejecutarse en transacción con colisión controlada/reintento; no usar `MAX(codigo)+1` sin protección.

### `subcontrato_rubros`

Campos del PRD, con:

- FKs explícitas: `subcontrato_id` con `CASCADE`; `nodo_presupuesto_id` y `apu_id_snapshot` con `SET NULL` para preservar historia ante eliminación.
- `nodo_presupuesto_id` nullable para conservar snapshots de rubros eliminados.
- booleanos de materiales, mano de obra, equipos y transporte; H.M. derivada, no editable.
- importes y cantidades: mantener inicialmente `Float` para compatibilidad exacta con el motor actual y snapshots a 4 decimales. Migrar solo este módulo a `Numeric` sin una política global produciría comparaciones inconsistentes. Esta es una decisión técnica de compatibilidad, no una nueva regla funcional.
- `firma_calculo VARCHAR(64)` SHA-256 determinista.
- índices `(subcontrato_id, estado_revision)`, `nodo_presupuesto_id`, `apu_id_snapshot`.

No debe existir `UNIQUE(nodo_presupuesto_id)` simple porque impediría historia anulada. La exclusividad se valida transaccionalmente consultando asignaciones cuyo padre está en `BORRADOR` o `CONFIRMADO`.

### `subcontrato_rubro_recursos_snapshot`

Campos del PRD, todos los recursos del APU, con `subcontrato_rubro_id ON DELETE CASCADE`; `recurso_id ON DELETE SET NULL`; índice `(subcontrato_rubro_id, recurso_categoria_snapshot)` y `(recurso_id, recurso_unidad_snapshot)`.

`cantidad_unitaria_snapshot` debe guardar el coeficiente físico efectivo utilizado por Uso de recursos: para materiales/transporte, `item.cantidad`; para MO/equipo, `item.cantidad × rendimiento`. `cantidad_total_snapshot = cantidad_unitaria_snapshot × metrado_snapshot`, a 4 decimales.

## 6. Endpoints finales recomendados

Mantener el prefijo existente `/presupuestos` y separar el router en un archivo nuevo para no aumentar el actual `presupuestos.py` (~3.600 líneas):

- `GET /presupuestos/proyectos/{proyecto_id}/subcontratos`
- `POST /presupuestos/proyectos/{proyecto_id}/subcontratos`
- `GET /presupuestos/subcontratos/{subcontrato_id}`
- `PATCH /presupuestos/subcontratos/{subcontrato_id}`
- `DELETE /presupuestos/subcontratos/{subcontrato_id}` (solo borrador)
- `POST /presupuestos/subcontratos/{id}/confirmar`
- `POST /presupuestos/subcontratos/{id}/reabrir`
- `POST /presupuestos/subcontratos/{id}/anular`
- `GET /presupuestos/proyectos/{proyecto_id}/subcontratos/distribucion`
- `POST /presupuestos/subcontratos/{id}/rubros/asignar`
- `PATCH /presupuestos/subcontratos/{id}/rubros/{asignacion_id}`
- `DELETE /presupuestos/subcontratos/{id}/rubros/{asignacion_id}`
- `POST /presupuestos/subcontratos/{id}/rubros/verificar-cambios`
- `POST /presupuestos/subcontratos/{id}/rubros/actualizar`
- `POST /presupuestos/subcontratos/{id}/rubros/{asignacion_id}/revisar`
- `GET /presupuestos/subcontratos/{id}/resumen`
- `GET /presupuestos/subcontratos/{id}/materiales-suministrar`
- `GET /presupuestos/subcontratos/{id}/exportar.xlsx`

Las operaciones masivas deben devolver HTTP adecuado más un arreglo por rubro (`asignado`, `sin_apu`, `bloqueado`, `no_operativo`, `otros_no_soportado`, `error`). Se recomienda consistencia transaccional por elemento dentro de una operación coordinada, con éxito parcial conforme al PRD, sin dejar snapshots incompletos.

## 7. Evaluación de snapshots y rendimiento

La propuesta es viable y no debería generar un problema de rendimiento si se respeta la carga bajo demanda.

Estimación sobre la base actual: 1.258 rubros y 1.357 ítems distribuidos en 383 APUs (promedio aproximado 3,5 ítems/APU). Incluso si todos los rubros se asignaran y cada snapshot copiara todos los ítems, el orden de magnitud sería de pocos miles de filas por versión aceptada, razonable para SQLite local.

Controles obligatorios:

- Lista: agregados SQL, sin cargar recursos snapshot.
- Detalle: cabecera y asignaciones resumidas.
- Recursos snapshot: solo resumen, actualización, revisión y exportación.
- Precargar nodos/APUs/ítems/recursos por lote.
- Cache de cálculo por `apu_id` dentro de cada operación masiva.
- Inserción bulk de snapshots, no `commit` por recurso.
- Índices recomendados y `EXPLAIN QUERY PLAN` en Fase 8.
- La firma se calcula una vez por APU/composición y combina metrado por asignación.

Riesgo principal no es volumen, sino duplicar consultas/cálculos por rubro cuando muchos comparten APU. El diseño por servicio y cache de operación lo evita.

## 8. Riesgos, contradicciones y decisiones abiertas

### Contradicciones/riesgos confirmados

1. **H.M. dentro de equipo:** el nuevo desglose debe separarla sin cambiar el resultado del motor vigente.
2. **Cálculo duplicado en frontend:** Subcontratos no debe añadir otra réplica; toda vista previa debe venir del backend.
3. **`otros` dinámico:** hoy suma silenciosamente al PU; el servicio nuevo debe detectarlo y bloquear confirmación si su costo efectivo no es cero.
4. **`Float`:** puede producir diferencias binarias. Para esta primera versión debe preservarse el redondeo oficial a 4 decimales y compararse firmas sobre valores normalizados.
5. **Exclusividad dependiente del padre:** SQLite no resuelve limpiamente con una unicidad parcial entre tablas; requiere validación transaccional centralizada y pruebas de colisión.
6. **Código no reusable:** eliminar un borrador obliga a conservar una secuencia independiente o una marca histórica. Se recomienda tabla de secuencia.
7. **GET con escritura en exportación existente:** no reutilizar `_sincronizar_niveles` en el exportador nuevo.
8. **Término “Subcontratado” ya ocupado:** UI y documentación deben diferenciar el legado `SIN_APU` del nuevo módulo.
9. **Borrador exportable con inválidos:** el PRD permite exportarlo con advertencias, mientras la exportación definitiva se bloquea. La API debe distinguir explícitamente estado/advertencias, no tratar todo fallo como bloqueo.
10. **Referencia con una sola hoja:** no define visualmente Desglose incluido ni Resumen; deben extender la identidad visual existente sin añadir campos funcionales.
11. **Fórmulas inconsistentes en la referencia:** solo algunos totales son fórmulas. No debe replicarse esa inconsistencia.

### Preguntas bloqueantes

No se identifican preguntas funcionales bloqueantes. El PRD resuelve alcance, estados, categorías, presets, exclusividad, snapshots, exportación y casos límite. Los datos adicionales presentes en el Excel pero ausentes del PRD se consideran únicamente referencia visual y no se incorporan al modelo.

## 9. Plan de archivos por fase

### Fase 1 — dominio y migración

Crear:

- `backend/app/models/subcontrato.py`
- `backend/app/schemas/subcontrato.py`
- `backend/alembic/versions/0018_subcontratos.py`
- `tests/test_subcontratos_modelo.py`

Modificar:

- `backend/app/models/__init__.py`

No modificar `backend/app/db.py`.

### Fase 2 — cálculo y snapshots

Crear:

- `backend/app/services/apu_costos.py`
- `backend/app/services/subcontratos.py`
- `tests/test_subcontratos_calculo.py`

Modificar:

- `backend/app/api/apus.py` para delegar sin cambiar su contrato/respuesta.
- `backend/app/api/presupuestos.py` para reutilizar helper de cantidades, solo si las pruebas demuestran resultado idéntico.
- `tests/test_export_presupuesto_operativo.py`
- `tests/test_uso_recursos.py`

### Fase 3 — API

Crear:

- `backend/app/api/subcontratos.py`
- `tests/test_subcontratos_api.py`

Modificar:

- `backend/app/main.py` para registrar router.

### Fases 4-6 — frontend

Crear:

- `frontend/src/modules/presupuestos-v2/views/SubcontratosView.jsx`
- `frontend/src/modules/presupuestos-v2/subcontratos/SubcontratosLista.jsx`
- `frontend/src/modules/presupuestos-v2/subcontratos/SubcontratoDetalle.jsx`
- `frontend/src/modules/presupuestos-v2/subcontratos/DistribucionSubcontratos.jsx`
- `frontend/src/modules/presupuestos-v2/subcontratos/ConfiguracionAlcancePanel.jsx`
- `frontend/src/modules/presupuestos-v2/subcontratos/subcontratosApi.js`
- pruebas frontend en el patrón que se acuerde; hoy el repo no tiene infraestructura de tests frontend.

Modificar:

- `frontend/src/modules/presupuestos-v2/PresupuestosV2Shell.jsx`
- `frontend/src/index.css`
- opcionalmente `frontend/src/components/ui.jsx` solo si falta un componente verdaderamente compartible.

No modificar `frontend/src/App.jsx`.

### Fase 7 — Excel

Crear:

- `backend/app/services/subcontratos_excel.py`
- `tests/test_subcontratos_exportacion.py`

Modificar:

- `backend/app/api/subcontratos.py`

No se recomienda modificar los exportadores actuales salvo para extraer helpers de estilo puros con regresión.

### Fase 8 — cierre

Crear:

- fixtures/dataset de rendimiento dentro de `tests/` si no se reutilizan factories existentes.
- documentación operativa final bajo `docs/subcontratos/`.

## 10. Plan de pruebas

1. **Migración:** upgrade/downgrade en copia temporal; tablas, FKs, cascadas e índices.
2. **Secuencia:** códigos concurrentes/colisiones y no reutilización tras eliminar/anular.
3. **Exclusividad:** borrador/confirmado bloquean; anulado libera; frontend desactualizado no vence backend.
4. **Motor:** regresión de PU actual antes/después de extracción; precisión a 4 decimales.
5. **Presets:** seis configuraciones exactas; vacío inválido; categoría en cero permitida.
6. **H.M.:** siempre con MO, nunca sola, sin doble conteo en equipo.
7. **`otros`:** cero permitido con advertencia definida; costo efectivo bloquea confirmación.
8. **Snapshots/firma:** estabilidad ante orden; cambio ante precio, coeficiente, rendimiento, categoría, recurso o composición.
9. **Cantidades:** materiales por coeficiente × metrado; consolidación por identidad/unidad; recurso sin ID/unidad.
10. **Estados de cambio:** mismo APU/metrado → desactualizado; APU distinto/ausente → pendiente; nodo eliminado/no operativo → error.
11. **Transiciones:** confirmar, reabrir, anular, eliminar borrador y acciones inválidas.
12. **Masivos:** mezcla de válidos/bloqueados/sin APU/otros; éxito parcial sin snapshots huérfanos.
13. **Excel:** tres hojas, celdas y formatos clave, borrador/anulado, snapshots históricos, categorías incluidas y materiales excluidos.
14. **Regresión:** tests actuales de exportación operativa, Uso de recursos, paquetes y plantillas APU.
15. **Frontend:** build/lint; navegación, estados, filtros, selección, accesibilidad y bloqueo de confirmados.
16. **Rendimiento:** conteo de consultas y tiempos para lista, detalle, asignación masiva, verificación y exportación con dataset representativo.

## 11. Orden de implementación recomendado

1. Aprobar esta validación.
2. Fase 1: modelo, secuencia y migración.
3. Fase 2: servicio único de cálculo/cantidades, firma y snapshots.
4. Fase 3: API, transiciones y operaciones masivas.
5. Fase 4: navegación interna, lista y cabecera.
6. Fase 5: detalle y distribución general compartiendo componentes/servicios.
7. Fase 6: detección/aceptación de cambios.
8. Fase 7: Excel validado contra el archivo de referencia.
9. Fase 8: rendimiento, regresión y cierre.

No avanzar de fase sensible sin revisar diff, pruebas y riesgos de la anterior.

## 12. Criterios de aceptación verificables

- La vista aparece dentro del proyecto abierto y no crea una navegación superior nueva.
- Todos los rubros operativos se muestran; los sin APU están visibles y bloqueados.
- Backend impide que un nodo esté en dos subcontratos no anulados.
- Los seis presets producen exactamente las categorías aprobadas.
- H.M. se incluye si y solo si se incluye MO y no se duplica dentro de equipos.
- PU seleccionado y total vienen del backend, no son editables y coinciden a 4 decimales con el motor oficial.
- `otros` con costo efectivo impide confirmar.
- Las cantidades de materiales salen de coeficientes físicos y metrado, nunca de costos.
- Cambios de precio/coeficiente/rendimiento/mismo APU o metrado marcan `DESACTUALIZADO`.
- Cambio/desvinculación/eliminación de APU marca `PENDIENTE_REVISION`.
- Nodo eliminado/no operativo marca `ERROR` sin borrar snapshot.
- Confirmado no cambia silenciosamente y exporta snapshot histórico.
- Anulado conserva historia y libera rubros; borrador eliminado libera rubros y no permite reutilizar código.
- Operaciones masivas calculan cada APU compartido una vez por operación y reportan resultados por rubro.
- Lista y detalle no cargan snapshots de recursos innecesariamente; no hay N+1.
- Excel contiene exactamente tres hojas, marca de borrador/anulado, total sin IVA y materiales excluidos consolidados.
- Todas las pruebas nuevas y regresiones existentes pasan sobre base temporal/copia, nunca sobre `presupuestos.db` activa.

## 13. Revisión final de Fase 0

- Se contrastaron PRD, prompt, análisis previo, código y base viva.
- Se confirmó el punto exacto de integración y los archivos previstos.
- Se verificaron cálculo APU, H.M., categorías, cantidades físicas, Uso de recursos, exportaciones y rubro operativo.
- Se comprobó que `otros` no tiene uso real actual.
- Se evaluaron snapshots y rendimiento con el volumen vivo.
- No se modificó implementación ni esquema.
- Se inspeccionó el Excel de referencia, incluidas estructura, fórmulas, formato y presentación visual.
