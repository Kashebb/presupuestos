# Deuda técnica registrada

Estas observaciones no forman parte de las correcciones obligatorias del módulo Subcontratos y no deben resolverse sin planificación y autorización propias.

## Plataforma y datos

- **Historial Alembic no reproducible desde cero:** validar y normalizar la cadena histórica en una iniciativa separada.
- **`datetime.utcnow`:** migrar gradualmente a fechas UTC conscientes de zona horaria.
- **Uso global de `Float`:** evaluar `Numeric/Decimal` para valores monetarios y cantidades sin cambiar silenciosamente datos existentes.
- **Futura entidad Presupuesto/Versión:** hoy el presupuesto es un árbol asociado directamente al proyecto.
- **`Base.metadata.create_all()` en el arranque:** puede crear tablas faltantes fuera del control de revisión Alembic; revisar la política general de inicialización.

## Dominio y compatibilidad

- **Nombre legado “Subcontratado”:** todavía representa `SIN_APU` en flujos históricos y no debe confundirse con la entidad Subcontrato.
- **Jerarquía snapshot para exportaciones:** los ancestros no se conservan; el Excel histórico usa tabla plana.
- **Tipos `Float` en Subcontratos:** decisión temporal alineada con el sistema vigente.

## Calidad y frontend

- **Ausencia de pruebas frontend automatizadas:** actualmente se depende de lint, build y validación manual.
- **Paginación de distribución en cliente:** el backend entrega todos los rubros operativos; evaluar paginación de servidor si aumenta el volumen.
- **Asignación masiva:** 100 rubros generaron 736 consultas, principalmente escrituras de snapshots por recurso. El tiempo observado fue adecuado, pero debe monitorizarse.

