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

## Sesión 3 — 2026-06-09
### Configuración inicial del proyecto
- Node.js v24 instalado
- Frontend: React + Vite + Tailwind CSS corriendo en localhost:5173
- Backend: FastAPI + uvicorn corriendo en 127.0.0.1:8000
- Estructura de carpetas backend creada (app, api, models, schemas)
- .gitignore configurado
- Proyecto movido a C:\Users\luisa\Documents\proyectos\presupuestos (fuera de OneDrive)
- Aprendizaje: OneDrive interfiere con servidores locales en Windows

## Sesión 4 — 2026-06-09
### Backend CRUD Recursos
- Creado modelo SQLAlchemy Recurso con 12 columnas basadas en bd_recursos.xlsx
- Creado schema Pydantic (RecursoBase, RecursoCreate, RecursoUpdate, RecursoOut)
- Implementados 5 endpoints CRUD en /recursos/
- Configurada ruta absoluta en db.py con pathlib para evitar conflictos de rutas
- Creado script seed_recursos.py para importación desde Excel
- Importados 432 recursos activos desde bd_recursos.xlsx
- API verificada y funcionando en http://127.0.0.1:8000

### Pendiente sesión 5
- Agregar presupuestos.db y bd_recursos.xlsx al .gitignore
- Pantalla React CRUD Recursos (listar, buscar, crear, editar, desactivar)

## Sesión 5 — 2026-06-09

### Frontend Recursos
- Creada pantalla React Recursos (src/pages/Recursos.jsx)
- Tabla con campos: Código, Nombre, Unidad, Tipo, Precio
- Buscador por nombre y categoría
- Conexión con API backend funcionando
- 432 recursos cargando correctamente

### Pendiente sesión 6
- Agregar presupuestos.db y bd_recursos.xlsx al .gitignore
- Botones Crear, Editar y Desactivar recursos

## Sesión 6 — 2026-06-09

### CRUD Recursos
- Agregado .gitignore para *.db y bd_recursos.xlsx
- Botón + Nuevo recurso con modal de creación
- Botón Editar por fila con modal precargado
- Botón Desactivar por fila con confirmación
- Validaciones en formulario (nombre, unidad, precio)

### Pendiente sesión 7
- Filtro por tipo de recurso (mano_de_obra, material, equipo...)
- Paginación o scroll virtual para 432 recursos
- Feedback visual al guardar/desactivar (mensaje de éxito)