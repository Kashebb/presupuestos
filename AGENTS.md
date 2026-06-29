# AGENTS.md — Sistema Presupuestos Bosquira

## Stack
Python 3.12, FastAPI, SQLAlchemy 2.0.50, SQLite, Alembic 1.18.4, 
React 19 + Vite + Tailwind (frontend).
Dependencias congeladas en backend/requirements.txt — no instalar 
nada nuevo sin actualizar ese archivo.

## Base de datos activa
Única base real: `presupuestos.db` en la raíz del repo.
NO usar ni reactivar `backend/presupuestos.OBSOLETA.db` (desactualizada, 
migración antigua, no la lee la app).

## Esquema (fuente de verdad — verificar aquí antes de crear tablas/columnas)

### recursos
id, codigo, descripcion, categoria, subcategoria, familia, unidad, 
precio_unitario, fecha_precio, fuente_precio, observacion, activo, 
estado_validacion, fuente_validacion, fecha_validacion, nota_validacion

### apus
id, codigo, nombre, descripcion, categoria, subcategoria, unidad, 
rendimiento, estado, version, observacion, fecha_creacion, fecha_actualizacion

### apu_items (FK: recurso_id→recursos.id, apu_id→apus.id)
id, apu_id, recurso_id (nullable — puede ser NULL si es_herramienta_menor), 
categoria, cantidad, orden, es_herramienta_menor

### proyectos
id, nombre, codigo, descripcion, estado, fecha_creacion, fecha_actualizacion

### nodos_presupuesto (FK: proyecto_id→proyectos.id CASCADE, padre_id→nodos_presupuesto.id CASCADE, apu_id→apus.id SET NULL)
id, proyecto_id, padre_id, tipo, item, descripcion, orden, unidad, metrado, 
precio_unitario_ref, apu_id, tipo_rubro, observaciones, individualizado, 
estado_actualizacion, actualizacion_lote_id, excel_fila, excel_hoja, 
excel_archivo, fecha_actualizacion_fuente, origen_edicion, 
requiere_revision_apu, fecha_edicion_manual, tipo_origen, nivel, 
activo_como_rubro

⚠️ REGLAS CRÍTICAS sobre nodos_presupuesto (no asumir lo obvio):
- `tipo` (valores: RUBRO, CAPITULO, SUBCATEGORIA, CATEGORIA, SUBCAPITULO, 
  FASE, GRUPO) ya NO determina si un nodo es "rubro operativo". 
  Usar `activo_como_rubro == 1` AND sin hijos para eso.
- `tipo_origen` es redundante con `tipo` (0 filas distintas detectadas). 
  No usar en lógica nueva. Candidato a eliminar en migración futura — 
  no eliminar sin confirmación explícita.
- Estado real de vinculación APU requiere mirar 3 campos juntos: 
  `apu_id`, `tipo_rubro`, `observaciones`. 
  CONOCIDO: existen 12 filas con `tipo_rubro=VINCULADO` + `apu_id` 
  poblado pero `observaciones=SIN_APU` (inconsistencia real, pendiente 
  de corregir — NO reproducir este patrón en código nuevo).
- `requiere_revision_apu` se activa al editar nombre/unidad de un nodo 
  con APU vinculado; el frontend lo muestra como "APU POR REVISAR".

### actualizaciones_presupuesto_lotes (FK: proyecto_id→proyectos.id CASCADE)
id, proyecto_id, archivo, hoja, estado, total_nodos_excel, 
total_rubros_excel, total_nodos_antes, total_rubros_antes, 
total_nodos_creados, total_rubros_actualizados, total_obsoletos_marcados, 
total_excepciones, resumen_json, fecha_creacion

## Reglas de trabajo
- Toda tabla o columna nueva requiere migración Alembic — NO modificar 
  el esquema sin migración versionada.
- Antes de crear una tabla o columna, verificar contra este esquema 
  si ya existe algo equivalente. Si hay ambigüedad, preguntar antes 
  de crear.
- Todo endpoint nuevo necesita test en tests/.
- No modificar backend/app/db.py sin confirmación explícita 
  (define la conexión a la única base activa).
- Commits en español, formato: "feat: agrega modelo X" / "fix: corrige Y"
- Si una tarea toca nodos_presupuesto, leer primero la sección 
  de reglas críticas arriba — no asumir que `tipo` define jerarquía 
  operativa por sí solo.

## Pendientes conocidos (no resolver sin pedirlo explícitamente)
- tipo_origen candidato a eliminación (campo muerto).
- El proceso de importación desde Excel puede dejar observaciones 
  desactualizado al vincular un apu_id existente. Si reaparece este patrón, 
  revisar el flujo de importación en presupuestos.py, no solo corregir los datos.
- Revisar por qué cada acción de UI (subir/bajar/sangrar nodo) 
  dispara un backup completo de la base — posible señal de 
  transacciones no atómicas en la lógica de edición del árbol.
