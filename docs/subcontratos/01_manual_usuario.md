# Manual de usuario — Subcontratos

## Acceso

Abra **Presupuestos**, seleccione un proyecto y entre en la vista **Subcontratos**. La información siempre pertenece al proyecto activo.

## Crear un subcontrato

1. Pulse **Nuevo subcontrato**.
2. Ingrese el nombre obligatorio y, si corresponde, contratista y descripción.
3. Guarde. El sistema asigna un código correlativo `SC-001`, `SC-002`, etc., independiente por proyecto.

El nuevo registro queda en estado **BORRADOR**.

## Asignar rubros

Desde el detalle pulse **Distribuir rubros**, o use **Distribución general** desde la lista. Seleccione rubros disponibles, el borrador de destino y el alcance. Solo se pueden asignar hojas operativas del presupuesto con APU.

Un rubro sin APU aparece bloqueado. Use **Ir a Vinculación**, vincule el APU y vuelva a la distribución. Un rubro ya asignado a otro borrador o confirmado también queda bloqueado.

## Presets

- **Completo:** materiales, mano de obra, herramientas menores, equipos y transporte.
- **Solo materiales.**
- **Solo mano de obra:** incluye automáticamente herramientas menores.
- **Mano de obra + equipos:** incluye herramientas menores y equipos sin duplicarlas.
- **Materiales + transporte.**
- **Personalizado:** permite seleccionar categorías; debe quedar al menos una activa.

El precio unitario es automático y no se edita manualmente.

## Cambios del presupuesto o del APU

Pulse **Verificar cambios**. Los resultados posibles son:

- **ACTUALIZADO:** coincide con los datos vigentes.
- **DESACTUALIZADO:** cambió metrado, costo o composición física. En borrador puede usar **Actualizar**.
- **PENDIENTE DE REVISIÓN:** cambió o desapareció el APU. Use **Revisar APU** y confirme explícitamente el nuevo snapshot.
- **ERROR:** el rubro ya no puede verificarse correctamente.

Un subcontrato confirmado conserva sus snapshots; nunca se actualiza silenciosamente.

## Estados

- **Confirmar:** bloquea la edición. Solo procede si todos los rubros están actualizados.
- **Reabrir:** devuelve un confirmado a borrador conservando la fecha de la última confirmación.
- **Anular:** conserva el documento histórico en solo lectura y libera sus rubros para otros subcontratos.
- **Eliminar:** solo está disponible para borradores y elimina también sus asignaciones y snapshots.

## Materiales a suministrar

El detalle puede mostrar los materiales que la contratante debe suministrar. Se consolidan desde cantidades físicas guardadas en los snapshots, no desde valores monetarios.

## Exportar Excel

Pulse **Exportar Excel** en la lista o en el detalle. El libro contiene `Subcontrato`, `Desglose incluido` y `Resumen`.

- Un borrador se marca **BORRADOR — NO APROBADO**.
- Un anulado se marca **ANULADO — DOCUMENTO HISTÓRICO**.
- Un confirmado exporta los valores históricos aceptados aunque existan cambios posteriores.

