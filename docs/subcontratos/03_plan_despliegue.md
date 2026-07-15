# Plan de despliegue seguro — Subcontratos

## Condición previa

No ejecutar este procedimiento mientras backend, frontend o Excel estén usando la base. Confirmar que el árbol de trabajo corresponde a la versión aprobada y que `presupuestos.db` está en revisión `0017_uso_recursos_configuraciones`.

## 1. Cerrar procesos

```powershell
Get-NetTCPConnection -LocalPort 8000,5173 -State Listen -ErrorAction SilentlyContinue
```

Detener de forma controlada los procesos identificados.

## 2. Crear respaldo manual

Desde la raíz del repositorio:

```powershell
.\venv\Scripts\python.exe -c "import sys; sys.path.insert(0,'backend'); from app.backup import crear_backup; print(crear_backup('pre_migracion_subcontratos_0018','manual'))"
```

Registrar la ruta devuelta y verificar que el archivo exista y pueda abrirse con SQLite.

## 3. Aplicar migración

```powershell
.\venv\Scripts\alembic.exe -c backend\alembic.ini upgrade 0018_subcontratos
```

## 4. Validar revisión y tablas

```powershell
.\venv\Scripts\alembic.exe -c backend\alembic.ini current
.\venv\Scripts\python.exe -c "import sqlite3; c=sqlite3.connect('presupuestos.db'); print(c.execute('select version_num from alembic_version').fetchone()); print([r[0] for r in c.execute(\"select name from sqlite_master where type='table' and name like 'subcontrato%' order by name\")]); c.close()"
```

La revisión debe ser `0018_subcontratos` y deben existir cuatro tablas.

## 5. Iniciar y validar

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

En otra terminal:

```powershell
cd frontend
npm.cmd run dev
```

Validar: proyecto existente, lista vacía de Subcontratos, creación de un borrador, distribución, confirmación y exportación. No crear datos definitivos hasta completar el checklist.

## Rollback de esquema

Solo si no existen datos que deban conservarse o si se ha decidido descartarlos:

```powershell
.\venv\Scripts\alembic.exe -c backend\alembic.ini downgrade 0017_uso_recursos_configuraciones
```

El downgrade elimina las cuatro tablas y sus datos.

## Restauración completa

Si el despliegue falla y debe recuperarse el estado anterior:

1. Cerrar backend y frontend.
2. Conservar aparte la base fallida para diagnóstico.
3. Copiar el respaldo manual validado sobre `presupuestos.db`.
4. Verificar `PRAGMA integrity_check` y revisión `0017`.
5. Iniciar la versión anterior de la aplicación.

Ejemplo, sustituyendo la ruta confirmada:

```powershell
Copy-Item -LiteralPath 'C:\ruta\respaldo_validado.db' -Destination '.\presupuestos.db' -Force
```

La restauración es destructiva para cambios posteriores al respaldo y requiere autorización explícita.

