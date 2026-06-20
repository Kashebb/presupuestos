# Changelog

## 2026-06-20

- Agregada base progresiva para jerarquia dinamica por sangria en presupuestos.
- Nueva migracion Alembic `0008_nivel_dinamico_presupuesto`:
  - agrega `tipo_origen`, `nivel` y `activo_como_rubro` a `nodos_presupuesto`;
  - migra datos existentes desde `tipo` a `nivel`;
  - marca como grupos los nodos con hijos y como rubros operativos las hojas.
- La API de nodos ahora expone `tipo_origen`, `nivel`, `activo_como_rubro`, `tiene_hijos`, `es_grupo` y `es_rubro_operativo`.
- El frontend de Presupuestos usa helpers `esRubroNodo`, `esGrupoNodo`, `nivelNodo` y `configNodo` como primera capa de compatibilidad.
- `tipo` se mantiene temporalmente para compatibilidad con importacion, dashboard y flujos existentes.
- Agregado endpoint `PATCH /presupuestos/nodos/{id}/mover-estructura` para subir, bajar, sangrar y quitar sangria.
- La vista `Editar` incluye controles basicos de estructura para el rubro seleccionado o la seccion seleccionada en el sidebar.
- En `Editar`, los checkboxes de tabla ahora permiten seleccionar grupos y rubros; en `Vincular APUs` siguen limitados a rubros.
- La tabla de presupuesto ya no desplaza el texto segun nivel; la jerarquia se expresa por formato de fila/celda.
- En `Editar`, la tabla deja de contraer/expandir grupos al hacer clic; esa accion queda reservada al arbol lateral.
- En `Editar`, las filas de grupo se muestran como filas de grilla, sin fondo verde de contenedor.
- Las acciones de estructura ya no renumeran `item`; trabajan con `padre_id`, `nivel` y `orden`, dejando el codigo como referencia/exportacion.
- `mover-estructura` acepta seleccion multiple y bloquea selecciones ambiguas: grupos mezclados con hijos, filas no contiguas o filas de distintos padres.
- En `Editar`, se oculta la columna `Item/codigo` para que la organizacion se trabaje como grilla jerarquica y no por numeracion.
- `Deshacer` ahora cancela la ultima accion de estructura restaurando una foto previa del arbol.
- Se retiro de la interfaz el acceso a `Actualizar desde Excel` mientras se estabiliza la edicion estructural.
- `Sangrar` sigue el comportamiento Project: una tarea puede convertirse en grupo/resumen al recibir hijos, conservando sus datos para volver a ser rubro si queda sin hijos.
- La celda editable de descripcion elimina padding interno extra para alinear mejor texto seleccionado y no seleccionado.
- Luego de mover estructura, los niveles se recalculan desde el arbol real para que los hijos de un mismo grupo queden alineados.
- En `Editar`, la sangria visual usa la profundidad real del arbol y no el nivel historico guardado.
