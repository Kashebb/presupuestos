# Roadmap UI/UX - Pantalla Presupuestos

Fecha: 2026-06-19

## Objetivo

Reorganizar la pantalla `Presupuestos` como un modulo operativo con vistas internas por tarea, evitando que edicion, vinculacion APU y analisis economico compitan en una sola tabla.

El cambio debe mantener trazabilidad, proteger datos importados y preparar la app para edicion manual tipo Excel sin romper el flujo de vinculacion de APUs.

## Decisiones Confirmadas

- Las nuevas vistas viven dentro de `Presupuestos`, no como rutas separadas.
- La eliminacion de rubros debe ser logica: marcar como `obsoleto`, no borrar fisicamente por defecto.
- El sidebar de secciones debe poder ocultarse en todas las vistas.
- La vista de vinculacion APU debe iniciar enfocada en `Pendientes`.
- El flujo de vinculacion APU debe usar un modal grande.
- La vista de analisis debe mostrar `Top desviaciones` siempre visible.
- La vista de edicion debe permitir operaciones tipo Excel: agregar fila debajo, editar fila y eliminar/marcar obsoleto.
- En la primera version de edicion se apunta a todos los campos operativos: nombre, item/codigo, unidad, metrado, precio unitario referencial, orden y estado.
- Se debe evaluar reemplazar o reducir `Actualizar desde Excel` por un flujo de copiar/pegar celdas desde Excel hacia la app.
- Al agregar una fila debajo, debe crearse vacia como en Excel; no debe copiar unidad, P.U. ref ni otros datos del rubro anterior.
- El `item/codigo` de un rubro manual debe autogenerarse segun la codificacion actual del presupuesto.
- `Actualizar desde Excel` debe ocultarse o inhabilitarse por ahora. Si se confirma que la edicion manual y copiar/pegar desde Excel cubren el flujo, se eliminara despues.

## Nueva Distribucion Propuesta

### 1. Editar Presupuesto

Objetivo: corregir y mantener la estructura del presupuesto.

Controles principales:

- Agregar fila debajo.
- Editar fila.
- Duplicar fila, opcional.
- Marcar obsoleto.
- Guardar cambios.
- Cancelar cambios no guardados.
- Sidebar de secciones ocultable.

Tabla esperada:

- Item/codigo.
- Descripcion.
- Unidad.
- Metrado.
- P.U. ref.
- Total ref.
- Estado fuente: importado, editado manual, nuevo manual, obsoleto.

Reglas funcionales:

- Agregar fila crea un rubro debajo del rubro seleccionado.
- La fila nueva debe nacer vacia, sin heredar datos operativos del rubro anterior.
- Si se agrega fila dentro de una seccion, hereda el padre jerarquico del rubro seleccionado.
- El `item/codigo` se autogenera segun la codificacion actual del presupuesto.
- Marcar obsoleto no elimina fisicamente el nodo.
- Editar unidad de un rubro con APU vinculado debe advertir por posible incompatibilidad.
- Editar descripcion o unidad de un rubro vinculado debe marcar revision del vinculo APU.
- Los cambios manuales deben distinguirse de cambios importados desde Excel.

Backend probable:

- `PATCH /presupuestos/nodos/{id}` para editar campos.
- `POST /presupuestos/proyectos/{id}/nodos` para crear rubro debajo de otro.
- `PATCH /presupuestos/nodos/{id}/marcar-obsoleto`.
- Posible campo nuevo: `origen_edicion` o `estado_edicion`.

### 2. Vincular APUs

Objetivo: vincular rubros a APUs de forma segura y eficiente.

Layout:

- Subvistas: `Jerarquia` y `Por grupos`.
- Filtro inicial: `Pendientes`.
- Sidebar de secciones ocultable.
- Tabla de rubros con foco en estado APU y unidad.
- Modal grande para buscar, comparar y confirmar APU.

Modal grande de vinculacion APU:

- Resumen de rubro o rubros seleccionados.
- Unidad detectada y unidad normalizada.
- Buscador APU.
- APUs compatibles primero.
- APUs incompatibles visibles con advertencia o filtrables.
- P.U. calculado.
- Estado del APU.
- Diferencia contra P.U. ref.
- Confirmacion final.

Reglas funcionales:

- Bloquear vinculacion masiva con unidades mezcladas o incompatibles.
- Permitir cambiar APU de un rubro vinculado, con confirmacion.
- En grupos, separar rubros incompatibles antes de vincular.
- Mantener `Por grupos`, pero orientado a reducir trabajo repetitivo.

Backend probable:

- Puede seguir usando endpoints individuales al inicio.
- Recomendado despues: endpoint masivo transaccional para evitar estados parciales.
- Validacion de unidad tambien deberia existir en backend en una fase de robustez.

### 3. Analisis

Objetivo: explicar diferencias economicas y priorizar revision.

Contenido principal:

- KPIs economicos.
- Top desviaciones siempre visible.
- Filtros: mayor impacto, diferencias positivas, diferencias negativas, sin meta, sin APU.
- Tabla de diferencias.
- Panel detalle de rubro/APU al seleccionar.
- Sidebar de secciones ocultable para analizar por nodo.

Reglas funcionales:

- El ranking debe usar los mismos calculos de la tabla.
- Si hay una seccion seleccionada, el ranking se calcula para esa seccion.
- No cambiar la semantica de signos ni colores economicos sin decision de negocio.
- `Analisis` no debe incluir controles de edicion estructural.

## Sidebar De Secciones

Debe ser colapsable en todas las vistas.

Estados:

- Expandido: arbol visible.
- Contraido: columna minima con boton para reabrir.
- Oculto en pantallas estrechas, si aplica.

Reglas:

- Recordar estado durante la sesion del proyecto.
- No perder nodo seleccionado al ocultar.
- En `Analisis`, el nodo seleccionado filtra ranking y tabla.
- En `Vincular APUs`, el nodo seleccionado filtra rubros a vincular.
- En `Editar Presupuesto`, el nodo seleccionado ayuda a navegar, pero no debe impedir edicion global.

## Color Y Jerarquia Visual

La regla actual de verde institucional es demasiado rigida para jerarquia, estados y analisis al mismo tiempo.

Propuesta:

- Verde institucional: acciones primarias, OK, vinculado, exito.
- Verde suave: seleccion o confirmacion leve.
- Azul/teal: informacion, analisis, comparables economicos.
- Ambar: pendiente, advertencia, revision.
- Rojo: error, sin APU, eliminacion, riesgo.
- Grises: jerarquia estructural y fondos de tabla.

Regla:

- La jerarquia del presupuesto no debe depender solo de fondos verdes.
- Usar bordes, peso tipografico, indentacion y fondos neutros para niveles.
- Reservar colores fuertes para estados o acciones.

## Flujo Excel: Decision Pendiente

Existe duda sobre mantener `Actualizar desde Excel` como flujo principal.

Alternativa propuesta: copiar y pegar desde Excel.

Posible flujo:

1. Usuario copia rango de Excel.
2. App abre vista de pegado.
3. App detecta columnas.
4. Usuario confirma mapeo.
5. App muestra preview: nuevos, modificados, obsoletos potenciales.
6. Usuario aplica cambios.

Decisiones y preguntas abiertas:

- `Actualizar desde Excel` se ocultara o inhabilitara en la siguiente fase.
- Si copiar/pegar desde Excel y edicion manual cubren el flujo operativo, `Actualizar desde Excel` se eliminara despues.
- El pegado desde Excel reemplaza completamente `Actualizar desde Excel` o convive con el flujo actual?
- El pegado debe aceptar solo rubros o tambien estructura jerarquica completa?
- Que columnas minimas debe exigir?
- Se debe permitir pegar sobre una seccion especifica?

## Fases De Implementacion

### Fase A - Shell De Vistas

Objetivo: reorganizar sin cambiar persistencia.

- Agregar tabs internas: `Editar`, `Vincular APUs`, `Analisis`.
- Mover controles actuales a la vista correspondiente.
- Hacer sidebar colapsable.
- Mover ranking y filtros a `Analisis`.
- Mantener la tabla actual como base.

Riesgo: bajo-medio.

### Fase B - Vinculacion APU Mejorada

Objetivo: mejorar flujo de vinculacion.

- Reemplazar panel actual de vinculacion por modal grande.
- Separar APUs compatibles/incompatibles.
- Mantener validacion de unidades.
- Iniciar vista en pendientes.

Riesgo: medio.

### Fase C - Edicion Manual De Rubros

Objetivo: habilitar edicion tipo Excel.

- Crear endpoints de edicion y creacion.
- Editar campos completos.
- Agregar fila debajo.
- Marcar obsoleto.
- Registrar origen manual.

Riesgo: alto.

### Fase D - Pegado Desde Excel

Objetivo: reemplazar o complementar actualizacion Excel.

- Crear parser de portapapeles.
- Mapear columnas.
- Preview antes de aplicar.
- Reglas de actualizacion contra rubros existentes.

Riesgo: alto.

### Fase E - Robustez Y Trazabilidad

Objetivo: proteger datos y evitar inconsistencias.

- Validaciones backend para unidades.
- Endpoint masivo transaccional para vinculacion.
- Historial de cambios por rubro.
- Marcadores de cambios manuales vs importados.

Riesgo: medio-alto.

## Preguntas Pendientes Antes De Implementar

1. Si un rubro obsoleto tenia APU vinculado, el vinculo se conserva historicamente o se desvincula?
2. Para pegar desde Excel, se pegara estructura completa o solo rubros dentro de una seccion?
3. Que columnas son obligatorias para guardar un rubro manual?
4. Debe existir boton `Guardar cambios` o cada edicion se guarda automaticamente?
5. La edicion tipo Excel debe permitir pegar multiples filas directamente en la tabla?
6. En `Vincular APUs`, los APUs con estado `en_revision` deben aparecer por defecto o solo con filtro?
7. En `Analisis`, las diferencias positivas/negativas deben nombrarse asi o con etiquetas de negocio mas claras?

## Recomendacion

No implementar edicion manual hasta completar Fase A y Fase B. Primero hay que separar los modos de trabajo y limpiar la distribucion. Despues se agregan endpoints y reglas de edicion con menor riesgo.

Primer paso ejecutable recomendado:

1. Implementar Fase A: shell de tres vistas internas y sidebar colapsable.
2. No cambiar backend.
3. Mantener funcionalidad existente dentro de `Vincular APUs` y `Analisis`.
4. Dejar `Editar` como vista preparada con tabla de lectura y acciones deshabilitadas o en modo preview hasta crear endpoints.
