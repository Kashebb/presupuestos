# Documentación técnica — Subcontratos

## Arquitectura

El dominio se integra en Presupuestos V2 mediante:

- modelos SQLAlchemy en `backend/app/models/subcontrato.py`;
- esquemas Pydantic en `backend/app/schemas/subcontrato.py`;
- migración Alembic `0018_subcontratos`;
- cálculo compartido en `backend/app/services/apu_costos.py`;
- construcción y comparación de snapshots en `backend/app/services/subcontratos.py`;
- exportación en `backend/app/services/subcontratos_excel.py`;
- API en `backend/app/api/subcontratos.py`;
- vistas React bajo `frontend/src/modules/presupuestos-v2/subcontratos/`.

## Tablas

| Tabla | Finalidad | Eliminación |
|---|---|---|
| `subcontratos` | Cabecera, código, estado y fechas | Proyecto: `CASCADE` |
| `subcontrato_codigo_secuencias` | Último correlativo por proyecto | Proyecto: `CASCADE` |
| `subcontrato_rubros` | Asignación, configuración y snapshot monetario/textual | Subcontrato: `CASCADE`; nodo y APU: `SET NULL` |
| `subcontrato_rubro_recursos_snapshot` | Cantidades físicas históricas por recurso | Asignación: `CASCADE`; recurso: `SET NULL` |

Los `CHECK` restringen estados, presets, categorías, importes no negativos y al menos una categoría seleccionada. El código es único por proyecto.

## Estados y exclusividad

Estados de cabecera: `BORRADOR`, `CONFIRMADO`, `ANULADO`. Estados de revisión: `ACTUALIZADO`, `DESACTUALIZADO`, `PENDIENTE_REVISION`, `ERROR`.

Solo `BORRADOR` y `CONFIRMADO` bloquean un nodo. La asignación toma bloqueo transaccional (`BEGIN IMMEDIATE` en SQLite; `FOR UPDATE` en otros dialectos) antes de comprobar exclusividad. Los anulados no bloquean.

## Snapshots y firma

Al asignar o actualizar se guardan:

- textos del nodo y APU;
- metrado;
- PU por categoría y PU seleccionado;
- total;
- recursos y cantidades físicas;
- configuración y preset;
- firma SHA-256 canónica del cálculo.

Herramientas menores se derivan de mano de obra. Equipos usa el componente sin herramientas menores para evitar duplicación. Todos los cálculos siguen el redondeo vigente de cuatro decimales.

## Endpoints

- `GET/POST /presupuestos/proyectos/{proyecto_id}/subcontratos`
- `GET/PATCH/DELETE /presupuestos/subcontratos/{id}`
- `GET /presupuestos/subcontratos/{id}/exportar.xlsx`
- `POST /presupuestos/subcontratos/{id}/rubros/asignar`
- `PATCH/DELETE /presupuestos/subcontratos/{id}/rubros/{asignacion_id}`
- `POST /presupuestos/subcontratos/{id}/rubros/verificar-cambios`
- `POST /presupuestos/subcontratos/{id}/rubros/actualizar`
- `POST /presupuestos/subcontratos/{id}/rubros/{asignacion_id}/revisar`
- `POST /presupuestos/subcontratos/{id}/confirmar|reabrir|anular`
- `GET /presupuestos/proyectos/{proyecto_id}/subcontratos/distribucion`
- `GET /presupuestos/subcontratos/{id}/materiales-suministrar`
- `GET /presupuestos/subcontratos/{id}/resumen`

## Exportación

El Excel usa exclusivamente cabecera y snapshots. No recalcula APUs ni precios vivos. Los materiales externos se consolidan por recurso y unidad; si falta la referencia viva, por código, descripción normalizada y unidad.

## Rendimiento observado

Medición sobre copia representativa de la base activa:

| Operación | Tiempo | Consultas |
|---|---:|---:|
| Lista | 12,5 ms | 2 |
| Distribución | 110,3 ms | 3 |
| Detalle | 14,5 ms | 2 |
| Verificación | 23,3 ms | 5 |
| Materiales | 11,9 ms | 2 |
| Resumen | 6,0 ms | 4 |
| Exportación | 53,5 ms | 3 |
| Asignación masiva de 100 rubros | 173,3 ms | 736 |

No se observó N+1 de lectura en lista, distribución, detalle o exportación. La asignación masiva realiza numerosas escrituras de snapshots por recurso; el tiempo actual es aceptable, pero debe vigilarse si crece el volumen.

## Riesgos conocidos

- `Base.metadata.create_all()` continúa en el arranque general: el procedimiento debe ejecutar Alembic antes de iniciar el backend para no ocultar una migración pendiente.
- La distribución devuelve el conjunto completo y pagina 100 filas en frontend; no hay paginación de servidor.
- La jerarquía histórica del Excel es plana porque no existe snapshot de ancestros.
- No existen pruebas frontend automatizadas; lint, build y revisión manual son los controles actuales.

