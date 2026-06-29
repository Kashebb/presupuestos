# Contexto Actual - App Presupuestos

Fecha: 2026-06-29

Este archivo es el handoff operativo para continuar la app en otro chat sin depender solo de memoria interna.

## Ruta y Base Activa

- Proyecto app: `C:\Users\luisa\Documents\proyectos\presupuestos`
- Base activa: `presupuestos.db` en la raiz del proyecto.
- La base local no se sube a GitHub por seguridad.

## Objetivo del Proyecto

Seguir desarrollando una app local de presupuestos de construccion. La app debe convertir Recursos, APUs, Rubros y Presupuestos en una herramienta trazable para armar, revisar y controlar costos.

El foco inmediato no es cerrar el proyecto, sino consolidar una biblioteca confiable de Recursos y APUs. Despues se avanza a Rubros, Presupuestos, Importaciones y Reportes.

Si la usuaria pregunta "cual es el objetivo", responder desde `CONTEXTO_PROYECTO.md`: construir una app tipo S10/Interpro/Presto adaptada al flujo real de Santec, con validacion humana y trazabilidad.

## Estado de Datos

- Recursos en app: 445
- Recursos piloto no validados: 9
- APUs totales: 330
- Items APU: 1210
- APUs importados desde maestro BOSQUIRA: 318
- Items importados desde maestro BOSQUIRA: 1187

Fuente usada:
`C:\Users\luisa\OneDrive - Santec Group\Automatizaciones\01 Sistema de Presupuestos\05_PROYECTOS\BOSQUIRA_CONSTRUCCION\09_Fuentes_Externas\06_Salidas\maestro_apus_unificado_base_piloto_bosquira_20260612.xlsx`

## Decisiones Tomadas

- No importar `APU-HOR-REPLANTILLO-E5` porque no tenia detalle.
- No importar `ACB-PIN-0001`, `ACB-PIN-0002`, `ACB-PIN-0003`, `APU-HOR-280-INHIBIDOR` porque no tenian PU maestro unificado.
- Solo recursos salidos de StockProyectos deben considerarse validados.
- Recursos de fuentes externas o piloto quedan como no validados hasta revision humana.
- Los 9 recursos faltantes creados quedaron marcados en `observacion` como `PILOTO_NO_VALIDADO` y `fuente_validacion=NO_STOCKPROYECTOS`.
- 114 APUs quedaron marcados con `COSTO_NO_COINCIDE_CON_MAESTRO` porque el costo calculado por la app difiere mas de 0.10 del `pu_maestro_unificado` del Excel.
- No automatizar vinculacion de APUs marcados como `Revisar costo`.

## Cambios de Codigo Pendientes

Archivos modificados sin commit:

- `backend/app/api/apus.py`
  - Agregado helper `calcular_costo_apu`.
  - Agregado endpoint `/apus/costos/resumen`.
  - Endpoint `/apus/{id}/costo` reutiliza el helper.
- `frontend/src/pages/ApuDetalle.jsx`
  - Corregida duplicacion visual/de calculo de Herramientas Menores.
  - Los items `es_herramienta_menor` no se suman como fila normal, porque la vista conserva la fila fija 5% MO.
- `frontend/src/pages/Apus.jsx`
  - Lista solicita `limit=500`.
  - Agregadas columnas `PU Calc.` y `Control`.
  - Consume `/apus/costos/resumen?limit=500`.

## Verificaciones Realizadas

- `npm run lint`: paso.
- `npm run build`: paso.
- `python -m py_compile app/api/apus.py`: paso.
- API `/apus/costos/resumen?limit=500`: devuelve 319 APUs.
- Resultado control API: 114 `revisar_costo`, 205 `ok`.

## Reportes Generados

Carpeta: `reports/`

- `dry_run_import_apus_20260612_142730.md`
- `recursos_piloto_creados_20260612_143529.md`
- `dry_run_import_apus_post_recursos_piloto_20260612_143554.md`
- `import_apus_bosquira_20260612_150002.md`
- `validacion_costos_apus_importados_20260612_153431.md`
- `apus_marcados_revision_costo_20260612_153605.md`

## Como Arrancar

Backend:

```powershell
cd C:\Users\luisa\Documents\proyectos\presupuestos\backend
..\venv\Scripts\activate
uvicorn app.main:app --reload
```

Frontend:

```powershell
cd C:\Users\luisa\Documents\proyectos\presupuestos\frontend
npm run dev
```

Si VS Code muestra error de puerto/socket en `8000`, probablemente ya hay un backend corriendo. Revisar el proceso del puerto 8000 y detenerlo si se quiere iniciar uno nuevo.

## Flujo Operativo Acordado

- Para ideas nuevas: capturar, clasificar y decidir si es requisito inmediato, decision de arquitectura o backlog.
- No mezclar automaticamente ideas nuevas con la tarea en curso.
- Para ahorrar tokens: usar navegador solo para validaciones puntuales; para conteos, calculos, diagnosticos e importaciones usar base/API/archivos.
- Flujo base: respaldo -> diagnostico -> datos piloto/ajustes controlados -> simulacion -> importacion controlada -> verificacion en app -> documentar avance -> commit si hubo codigo/reportes.

## Siguiente Paso Recomendado

Usar la pantalla APUs como tablero:

1. Revisar visualmente APUs solo de forma puntual.
2. Usar `PU Calc.` y `Control` para elegir candidatos.
3. Vincular rubros solo con APUs `OK` o revisados.
4. Dejar fuera de automatizaciones los 114 APUs `Revisar costo`.
5. Decidir si se hace commit de codigo y reportes. La base `.db` debe protegerse con respaldos locales, no con GitHub.
