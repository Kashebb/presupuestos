# Checklist de validación — Subcontratos

## Antes del despliegue

- [ ] Código y documentación aprobados.
- [ ] Backend y frontend cerrados.
- [ ] `presupuestos.db` confirmada como base activa.
- [ ] Revisión Alembic actual confirmada en `0017_uso_recursos_configuraciones`.
- [ ] Respaldo manual creado en `backups/manual/`.
- [ ] Ruta y tamaño del respaldo registrados.
- [ ] Respaldo abre correctamente y pasa `PRAGMA integrity_check`.
- [ ] Pruebas backend completas aprobadas.
- [ ] Lint y build frontend aprobados.

## Migración

- [ ] Ejecutado `upgrade 0018_subcontratos` una sola vez.
- [ ] Revisión Alembic confirmada en `0018_subcontratos`.
- [ ] Existen las cuatro tablas de Subcontratos.
- [ ] FKs, índices y restricciones verificados.
- [ ] Tablas y filas preexistentes conservadas.

## Validación funcional posterior

- [ ] La aplicación inicia sin errores.
- [ ] Se abre un proyecto existente.
- [ ] La pestaña Subcontratos carga correctamente.
- [ ] Se crea un borrador con código correlativo.
- [ ] Rubro sin APU queda bloqueado.
- [ ] Rubro asignado no puede duplicarse en otro activo.
- [ ] Presets y personalizado calculan correctamente.
- [ ] Materiales externos muestran cantidades físicas.
- [ ] Cambio de metrado produce `DESACTUALIZADO`.
- [ ] Cambio de APU produce `PENDIENTE_REVISION`.
- [ ] Confirmación bloquea edición.
- [ ] Anulación libera rubros.
- [ ] Exportación Excel contiene tres hojas y valores snapshot.

## Cierre

- [ ] No existen snapshots huérfanos.
- [ ] No existen asignaciones activas duplicadas.
- [ ] Logs revisados sin errores nuevos.
- [ ] Respaldo predespliegue conservado.
- [ ] Responsable registra fecha, resultado y observaciones.

Responsable: ____________________  Fecha: ____________________

Resultado: [ ] Aprobado  [ ] Rollback  [ ] Pendiente

Observaciones:

____________________________________________________________________

