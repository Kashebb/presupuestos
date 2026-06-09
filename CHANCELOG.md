# Changelog

## Sesión 1 — 2026-06-08
### Modelo de datos (conceptual, sin código)
- Definidas 7 entidades: Recurso, Plantilla, PlantillaItem, APU, APUItem, Proyecto, NodoPresupuesto
- Decisión: estructura jerárquica flexible con árbol recursivo (padre_id) para presupuestos
- Decisión: APUs y Recursos como bibliotecas globales reutilizables entre proyectos
- Decisión: APUItem con campo origen para mezclar recursos directos y desde plantilla
- Pendiente para v2: historial completo de precios por recurso (tabla RecursoPrecio)

## Sesión 2 — 2026-06-08
### Stack y estructura del proyecto
- Stack definido: React + Vite + Tailwind / FastAPI / SQLite→PostgreSQL / SQLAlchemy + Alembic
- Estructura de carpetas definida (frontend/ + backend/)
- Despliegue futuro: Vercel (frontend) + Railway/Render (backend) + Supabase (PostgreSQL)
