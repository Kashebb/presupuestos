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

## Sesión 8 — 2026-06-09
### Backend APUs
- Modelos SQLAlchemy: APU y APUItem en app/models/apu.py
- base.py unificado en app/models/base.py
- Migración Alembic: tablas apu y apu_items
- Endpoints CRUD FastAPI en app/api/apus.py (/apus/)
- Schemas Pydantic en app/schemas/apu.py

## Sesión 9 — 2026-06-09
### Frontend APUs
- Pantalla APUs con tabla (código, nombre, unidad, rendimiento, categoría, estado)
- Buscador por nombre y código
- Modal crear/editar con todos los campos de cabecera
- Botón Desactivar por fila
- Navegación por tabs (Recursos / APUs) en App.jsx
- Fix: migración Alembic apuntaba a DB diferente que el servidor (alineado alembic.ini con ruta absoluta)

## Sesión 14 — 2026-06-12
### Estabilización mínima y control de contexto
- Validado el traspaso funcional contra código y datos reales.
- Backend CORS actualizado para aceptar frontend en `localhost:5173` y `127.0.0.1:5173`.
- Lint frontend estabilizado sin cambiar comportamiento funcional.
- `presupuestos.db` y `bd_recursos.xlsx` removidos del índice Git, conservando los archivos locales y respetando `.gitignore`.
- Cachés Python `__pycache__` / `*.pyc` removidos del índice Git y agregados a `.gitignore`.
- Confirmado que la base activa de la app es `presupuestos.db` en la raíz del proyecto.
- Pendiente: localizar/importar `bd_apus.xlsx` y alinear estados reales de APU antes del rediseño de APUs.

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

## 2026-06-29

- Eliminada la columna redundante `tipo_origen` de `nodos_presupuesto`.
- Retirado `tipo_origen` del modelo SQLAlchemy, del schema Pydantic `NodoOut` y de las escrituras al crear nodos.
- Agregada migracion Alembic `0009_elimina_tipo_origen_nodos_presupuesto` con downgrade que recrea la columna y rellena `tipo_origen = tipo`.
- La API de nodos ya no expone `tipo_origen`.
