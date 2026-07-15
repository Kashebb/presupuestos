# Informe de QA y cierre previo al despliegue

Fecha: 2026-07-15

## Resultado

El módulo pasó pruebas unitarias, regresión completa, ciclo de migración y flujo end-to-end sobre una copia de `presupuestos.db`. La base activa no fue migrada.

## Alcance auditado

No se incorporaron categoría `otros`, indirectos, IVA calculado, catálogo de contratistas, términos de pago, firmas contractuales, cantidades parciales, precios editables, reutilización funcional de `SIN_APU`, PDF, autenticación ni dependencias nuevas.

## Inventario consolidado por fase

| Fase | Archivo | Tipo y finalidad |
|---|---|---|
| 1 | `backend/app/models/subcontrato.py` | Creado: cuatro modelos y relaciones |
| 1 | `backend/app/schemas/subcontrato.py` | Creado: contratos Pydantic y enums |
| 1 | `backend/alembic/versions/0018_subcontratos.py` | Creado: migración reversible |
| 1 | `backend/app/models/__init__.py` | Modificado: registro de modelos |
| 1 | `tests/test_subcontratos_modelo.py` | Creado: esquema, FKs y migración |
| 2 | `backend/app/services/apu_costos.py` | Creado: motor compartido de costos y firma |
| 2 | `backend/app/services/subcontratos.py` | Creado: snapshots y detección de cambios |
| 2 | `backend/app/api/apus.py` | Modificado: reutilización del motor compartido |
| 2 | `backend/app/api/presupuestos.py` | Modificado: cálculo común sin alterar exportadores |
| 2 | `tests/test_subcontratos_calculo.py` | Creado: categorías, H.M., firma y precisión |
| 3 | `backend/app/api/subcontratos.py` | Creado: 18 rutas y transacciones del dominio |
| 3 | `backend/app/main.py` | Modificado: registro del router |
| 3 | `tests/test_subcontratos_api.py` | Creado: CRUD, exclusividad, estados y E2E API |
| 4 | `frontend/src/modules/presupuestos-v2/views/SubcontratosView.jsx` | Creado: coordinación de la vista |
| 4 | `frontend/src/modules/presupuestos-v2/subcontratos/subcontratosApi.js` | Creado: cliente HTTP |
| 4 | `frontend/src/modules/presupuestos-v2/subcontratos/SubcontratosLista.jsx` | Creado: lista, indicadores y acciones |
| 4 | `frontend/src/modules/presupuestos-v2/subcontratos/SubcontratoDetalle.jsx` | Creado: detalle, estados y materiales |
| 4 | `frontend/src/modules/presupuestos-v2/subcontratos/ConfiguracionAlcancePanel.jsx` | Creado: presets y personalizado |
| 4 | `frontend/src/modules/presupuestos-v2/subcontratos/subcontratosConfig.js` | Creado: representación UI de presets |
| 4 | `frontend/src/modules/presupuestos-v2/PresupuestosV2Shell.jsx` | Modificado: navegación interna |
| 4 | `frontend/src/modules/presupuestos-v2/data.js` | Modificado: URL configurable para QA |
| 4–5 | `frontend/src/index.css` | Modificado: integración visual y responsive |
| 5 | `frontend/src/modules/presupuestos-v2/subcontratos/DistribucionSubcontratos.jsx` | Creado: árbol, filtros, selección y distribución |
| 6 | `backend/app/services/subcontratos_excel.py` | Creado: libro histórico de tres hojas |
| 6 | `tests/test_subcontratos_exportacion.py` | Creado: estructura, datos, estados y formato |
| 7 | `docs/subcontratos/01_manual_usuario.md` a `05_informe_qa_cierre.md` | Creados: operación, técnica, despliegue y QA |
| 7 | `docs/arquitectura/README.md` y `docs/deuda_tecnica.md` | Creados: mapa técnico y deuda separada |

Los archivos de evidencia bajo `reports/subcontratos/` no forman parte del runtime.

## Migración aislada

- Revisión inicial: `0017_uso_recursos_configuraciones`.
- Primer upgrade: cuatro tablas creadas en `0018_subcontratos`.
- Downgrade: cuatro tablas eliminadas y revisión restaurada a `0017`.
- Segundo upgrade: estable en `0018`.
- FKs verificadas: `CASCADE` y `SET NULL` según diseño.
- Seis checks verificados en asignaciones.

Evidencia: `reports/subcontratos/fase7/migracion_resultado.txt`.

## E2E

Se verificó: creación `SC-001`, distintos presets, rechazo sin APU, conflicto de exclusividad, materiales, cambio de metrado, actualización, cambio de APU, revisión explícita, confirmación, bloqueo de edición, exportación, reapertura, segunda confirmación, anulación, liberación y exportación histórica.

Integridad final de la copia: cero snapshots huérfanos, cero exclusividades activas duplicadas y cero totales inconsistentes.

Evidencia: `reports/subcontratos/fase7/e2e_rendimiento_resultado.txt`.

## Pruebas finales

- Backend: 89 pruebas ejecutadas, 89 aprobadas, 0 fallidas, 0 omitidas.
- Compilación Python: correcta para `backend/app` y `backend/alembic`.
- Rutas: 18 rutas del router verificadas.
- Frontend: build de producción correcto.
- ESLint: 0 errores; 2 advertencias preexistentes de dependencias de hooks en `EdicionView.jsx` y `VinculacionView.jsx`.
- Advertencias Python: usos conocidos de `datetime.utcnow` y algunos `ResourceWarning` de conexiones SQLite en pruebas heredadas; registrados como deuda, sin fallos funcionales.
- Pruebas frontend automatizadas: omitidas porque no existe infraestructura; deuda registrada.

## Auditoría de código

- No se detectaron imports circulares ni código muerto bloqueante.
- `backend/app/api/subcontratos.py` concentra orquestación HTTP y transacciones en 405 líneas; es mantenible para el alcance actual, aunque no debe seguir creciendo sin separar comandos.
- `SubcontratosView.jsx` concentra coordinación de modales y acciones; no se refactorizó para evitar cambios amplios en el cierre.
- La lógica de configuración se comparte entre servicio y frontend como representación de las mismas reglas; el backend sigue siendo autoritativo.

## Revisión visual

La captura automatizada actual quedó bloqueada porque el navegador aislado no pudo acceder a `127.0.0.1`, aunque los servidores locales respondían HTTP 200 desde el sistema. Por ello no se afirma una auditoría visual completa en escritorio/tablet durante esta fase. El build, CSS responsivo y capturas aprobadas de Fases 5–6 permanecen disponibles, pero no se usaron como evidencia nueva.

Antes del despliegue real debe ejecutarse el apartado visual del checklist en el equipo local: lista, detalle, distribución, panel, estados, errores y descarga, tanto en escritorio como aproximadamente 820 px.

## Defectos corregidos

No se encontraron defectos funcionales claros que justificaran cambios adicionales. No se realizaron refactorizaciones cosméticas ni optimizaciones prematuras.

## Decisión

Preparado técnicamente para despliegue controlado, condicionado a autorización explícita, respaldo manual de la base activa y validación visual local final.

## Artefactos aislados

- Copia migrada y usada para E2E: `reports/subcontratos/fase7/presupuestos_fase7_copia.db`.
- Respaldo previo a migración de la copia: `reports/subcontratos/fase7/presupuestos_fase7_respaldo_pre_migracion.db`.
- Integridad de ambos archivos: `ok`.
- La base activa conservó SHA-256 `30cce2fa40d11adad833fbdd9b0247b311af968903e21125b4d62a908897da4e` y `mtime_ns` `1784040767480803900` durante el QA.
