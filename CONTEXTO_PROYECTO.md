# Contexto del Proyecto — App de Presupuestos

## Descripción
App web local para gestión de presupuestos de construcción civil (edificios, casas).
Tipo de proyecto de referencia: S10, Interpro, Proexcel, Presto.

## Stack (por definir)
- Frontend: por definir
- Backend: por definir
- Base de datos: por definir

## Módulos (orden de desarrollo)
1. Recursos
2. Plantillas (cuadrillas + coeficientes)
3. APUs
4. Presupuestos
5. Rubros
6. Importación de archivos
7. Reportes

## Modelo de datos (Sesión 1)

### Entidades principales
- **Recurso** — unidad atómica con precio unitario. Tipos: mano_de_obra, material, equipo, transporte, otros.
- **Plantilla** — agrupa recursos con coeficientes (cuadrillas reutilizables).
- **PlantillaItem** — detalle de cada recurso dentro de una plantilla.
- **APU** — biblioteca global reutilizable. Define el costo de 1 unidad de trabajo.
- **APUItem** — recursos dentro de un APU (directos o heredados de plantilla).
- **Proyecto** — contenedor del presupuesto (cliente, estado, moneda).
- **NodoPresupuesto** — árbol jerárquico flexible con padre_id. Soporta capítulos, subcapítulos, rubros y cualquier nivel adicional. Los nodos tipo `rubro` se vinculan a un APU.

### Decisiones clave
- Estructura jerárquica con árbol recursivo (adjacency list) para soportar cualquier profundidad.
- APUs y Recursos son bibliotecas globales reutilizables entre proyectos.
- APUItem tiene campo `origen` (directo / desde_plantilla) para trazabilidad.

## Flujo de trabajo por sesión
- Una tarea por sesión
- Commits frecuentes
- Este archivo + CHANGELOG.md se actualizan al cierre de cada sesión
