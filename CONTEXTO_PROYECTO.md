# Contexto del Proyecto - App de Presupuestos

## Objetivo del Proyecto

Desarrollar una app web local para gestionar presupuestos de construccion civil, adaptada al flujo real de trabajo de Santec: recursos, APUs, rubros, presupuestos, importaciones y reportes.

La app no busca reemplazar la validacion tecnica humana. Su objetivo es convertir las bases y archivos de presupuesto en una herramienta operativa, trazable y reutilizable para armar, revisar y controlar presupuestos.

Referencias funcionales: S10, Interpro, Proexcel y Presto.

## Objetivo Funcional Actual

Consolidar una biblioteca confiable de Recursos y APUs para que luego los rubros y presupuestos puedan construirse sobre datos validados.

Estado actual del foco:

- Recursos: ya existe base cargada en la app.
- APUs: ya existe importacion piloto BOSQUIRA.
- Control pendiente: separar APUs `OK` de APUs `Revisar costo`.
- Regla operativa: no vincular automaticamente rubros con APUs marcados como `Revisar costo`.

## Roadmap de Desarrollo

1. Recursos
   - Mantener biblioteca global de recursos.
   - Distinguir recursos validados desde StockProyectos de recursos piloto o externos.
   - Permitir crear, editar, desactivar y consultar recursos.

2. Plantillas / cuadrillas
   - Modelar cuadrillas reutilizables.
   - Usar coeficientes e incidencias tecnicas.
   - Evitar duplicar composiciones frecuentes en cada APU.

3. APUs
   - Crear biblioteca global reutilizable.
   - Calcular costo desde recursos y plantillas.
   - Conservar trazabilidad del origen.
   - Mostrar control entre costo calculado y costo maestro/importado.
   - Revisar manualmente diferencias antes de usar en rubros.

4. Rubros
   - Representar partidas de presupuesto.
   - Vincular rubros con APUs confiables o revisados.
   - Mantener el costo del rubro como derivado, no como valor manual sin trazabilidad.

5. Presupuestos
   - Crear proyectos/presupuestos con estructura jerarquica flexible.
   - Soportar capitulos, subcapitulos, rubros y niveles adicionales.
   - Permitir presupuestos completos o por paquetes/disciplinas.

6. Importacion de archivos
   - Leer presupuestos externos y maestros.
   - Ejecutar diagnostico antes de modificar datos.
   - Usar simulacion/dry-run antes de importar.
   - Marcar fuentes externas como piloto o no validadas cuando corresponda.

7. Reportes y control
   - Generar reportes de diferencias, recursos faltantes, APUs revisados y presupuestos.
   - Dar soporte a revision tecnica y decision humana.
   - Exportar salidas utiles para control y entrega.

## Criterio de Prioridad

Antes de seguir agregando pantallas nuevas, la prioridad es que la cadena `Recursos -> APUs -> Rubros -> Presupuestos` sea confiable.

El desarrollo debe avanzar asi:

1. Estabilizar datos base.
2. Validar calculos.
3. Permitir revision humana.
4. Vincular rubros solo con informacion confiable.
5. Construir presupuestos y reportes sobre esa base.

## Stack

- Frontend: React + Vite + Tailwind CSS
- Backend: FastAPI (Python)
- Base de datos: SQLite en desarrollo; PostgreSQL como alternativa futura de produccion.
- ORM: SQLAlchemy + Alembic

## Modelo de Datos

### Entidades principales

- **Recurso**: unidad atomica con precio unitario. Tipos: mano_de_obra, material, equipo, transporte, otros.
- **Plantilla**: agrupa recursos con coeficientes, por ejemplo cuadrillas reutilizables.
- **PlantillaItem**: detalle de cada recurso dentro de una plantilla.
- **APU**: biblioteca global reutilizable. Define el costo de una unidad de trabajo.
- **APUItem**: recursos dentro de un APU, directos o heredados de plantilla.
- **Proyecto**: contenedor del presupuesto, cliente, estado y moneda.
- **NodoPresupuesto**: arbol jerarquico flexible con `padre_id`. Soporta capitulos, subcapitulos, rubros y cualquier nivel adicional. Los nodos tipo `rubro` se vinculan a un APU.

### Decisiones clave

- Estructura jerarquica con arbol recursivo para soportar cualquier profundidad.
- APUs y Recursos son bibliotecas globales reutilizables entre proyectos.
- APUItem tiene campo `origen` para trazabilidad.
- Los datos locales sensibles, como `presupuestos.db`, no deben subirse a GitHub.
- Recursos de fuentes externas o piloto no se consideran validados hasta revision humana.

## Flujo de Trabajo por Sesion

- Una tarea principal por sesion.
- Verificar contra archivos, base o API antes de asumir.
- Hacer respaldo antes de importaciones o cambios de datos.
- Usar diagnostico y simulacion antes de importar.
- Actualizar `CONTEXTO_ACTUAL_APP.md` al cierre de sesiones importantes.
- Hacer commits frecuentes cuando haya cambios de codigo o documentacion estables.

## Contexto Operativo Actualizado - 2026-06-12

- Proyecto app: `C:\Users\luisa\Documents\proyectos\presupuestos`.
- Base SQLite activa: `presupuestos.db` en la raiz del proyecto.
- Existe otra base en `backend/presupuestos.db`, pero no es la que usa `backend/app/db.py`.
- `presupuestos.db` y `bd_recursos.xlsx` son archivos locales de datos y no deben subirse a GitHub.
- Frontend local esperado: `http://localhost:5173` o `http://127.0.0.1:5173`.
- Backend local esperado: `http://127.0.0.1:8000`.
- Estado mas reciente documentado: 442 recursos, 319 APUs y 1192 items APU.
- APUs BOSQUIRA importados desde maestro piloto: 318 APUs y 1187 items.
- APUs marcados para revision de costo: 114.

## Respuesta Corta si se Pregunta el Objetivo

El objetivo es seguir desarrollando una app local de presupuestos de construccion. La app debe transformar recursos, APUs, rubros y presupuestos en una herramienta trazable para armar, revisar y controlar costos. El foco inmediato es consolidar Recursos y APUs confiables; despues se avanza a Rubros, Presupuestos, Importaciones y Reportes.
