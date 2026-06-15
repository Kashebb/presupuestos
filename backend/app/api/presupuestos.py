"""
Endpoints: Módulo Presupuestos
Rutas:
  GET    /presupuestos/proyectos/              → listar proyectos
  POST   /presupuestos/proyectos/              → crear proyecto vacío
  GET    /presupuestos/proyectos/{id}          → detalle proyecto
  PUT    /presupuestos/proyectos/{id}          → editar proyecto
  DELETE /presupuestos/proyectos/{id}          → eliminar proyecto + nodos
  GET    /presupuestos/proyectos/{id}/nodos    → árbol completo de nodos
  POST   /presupuestos/proyectos/{id}/importar → importar Excel
  PATCH  /presupuestos/nodos/{id}/vincular-apu → vincular APU a un nodo RUBRO
  PATCH  /presupuestos/nodos/{id}/desvincular-apu → quitar APU de un nodo
"""
import io
import json
import unicodedata
from typing import Optional, Any
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.presupuesto import Proyecto, NodoPresupuesto, ActualizacionPresupuestoLote
from app.models.apu import APU
from app.api.apus import siguiente_codigo_apu

router = APIRouter(prefix="/presupuestos", tags=["Presupuestos"])

# ── Orden jerárquico para asignar padre_id al importar ──────────
ORDEN_JERARQUIA = [
    "FASE",
    "CATEGORIA",
    "SUBCATEGORIA",
    "CAPITULO",
    "SUBCAPITULO",
    "GRUPO",
    "RUBRO",
]

PU_TOLERANCIA = 0.01


def _texto(valor: Any) -> Optional[str]:
    if valor is None:
        return None
    texto = str(valor).strip()
    return texto or None


def _numero(valor: Any) -> Optional[float]:
    if isinstance(valor, (int, float)):
        return float(valor)
    return None


def _normalizar_texto(valor: Any) -> str:
    texto = _texto(valor) or ""
    texto = " ".join(texto.split()).upper()
    return "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )


def _distinto_texto(a: Any, b: Any) -> bool:
    return _normalizar_texto(a) != _normalizar_texto(b)


def _distinto_numero(a: Optional[float], b: Optional[float], tolerancia: float = 0.000001) -> bool:
    if a is None and b is None:
        return False
    if a is None or b is None:
        return True
    return abs(float(a) - float(b)) > tolerancia


def _leer_excel_presupuesto(contenido: bytes, hoja: str) -> tuple[list[dict], dict]:
    try:
        import openpyxl

        wb = openpyxl.load_workbook(io.BytesIO(contenido), read_only=True, data_only=True)
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"No se pudo leer el archivo Excel: {e}"
        )

    if hoja not in wb.sheetnames:
        raise HTTPException(
            status_code=400,
            detail=f"Hoja '{hoja}' no encontrada. Hojas disponibles: {wb.sheetnames}",
        )

    ws = wb[hoja]
    filas = []
    stack: list[dict] = []
    conteo_por_tipo: dict[str, int] = {}

    for numero_fila, row in enumerate(ws.iter_rows(min_row=6, values_only=True), start=6):
        tipo = _texto(row[0])
        if tipo is None:
            continue
        tipo = tipo.upper()
        if tipo not in ORDEN_JERARQUIA:
            continue

        nivel_actual = ORDEN_JERARQUIA.index(tipo)
        while stack and ORDEN_JERARQUIA.index(stack[-1]["tipo"]) >= nivel_actual:
            stack.pop()

        pu_raw = row[5]
        observacion_excel = _texto(row[7]) if len(row) > 7 else None
        if tipo == "RUBRO":
            metrado = _numero(row[4])
            if isinstance(pu_raw, str) and pu_raw.strip().upper() == "SIN_APU":
                precio_ref = 0.0
                observaciones = "SIN_APU"
            elif isinstance(pu_raw, (int, float)):
                precio_ref = float(pu_raw)
                observaciones = observacion_excel
            else:
                precio_ref = 0.0
                observaciones = _texto(pu_raw) or observacion_excel
            unidad = _texto(row[3])
        else:
            metrado = None
            precio_ref = None
            observaciones = observacion_excel
            unidad = None

        item = _texto(row[1])
        descripcion = _texto(row[2]) or "(sin descripcion)"
        registro = {
            "row": numero_fila,
            "tipo": tipo,
            "item": item,
            "descripcion": descripcion,
            "unidad": unidad,
            "metrado": metrado,
            "precio_unitario_ref": precio_ref,
            "total_ref_excel": _numero(row[6]),
            "observaciones_excel": observaciones,
            "path": [p.copy() for p in stack],
        }
        filas.append(registro)
        conteo_por_tipo[tipo] = conteo_por_tipo.get(tipo, 0) + 1

        if tipo != "RUBRO":
            stack.append({
                "tipo": tipo,
                "item": item,
                "descripcion": descripcion,
                "row": numero_fila,
            })

    if not filas:
        raise HTTPException(
            status_code=400,
            detail="No se encontraron filas validas en la hoja especificada.",
        )

    return filas, {
        "total_nodos": len(filas),
        "total_rubros": conteo_por_tipo.get("RUBRO", 0),
        "por_tipo": conteo_por_tipo,
    }


def _ruta_nodo(nodo: NodoPresupuesto, por_id: dict[int, NodoPresupuesto]) -> list[NodoPresupuesto]:
    ruta = []
    actual = nodo
    while actual is not None:
        ruta.append(actual)
        actual = por_id.get(actual.padre_id)
    return list(reversed(ruta))


def _ruta_clave_actual(nodo: NodoPresupuesto, por_id: dict[int, NodoPresupuesto]) -> list[tuple[str, Optional[str]]]:
    return [(n.tipo, n.item) for n in _ruta_nodo(nodo, por_id)[:-1]]


def _ruta_clave_excel(registro: dict) -> list[tuple[str, Optional[str]]]:
    return [(n["tipo"], n["item"]) for n in registro["path"]]


def _total_ref_rubro(nodo: NodoPresupuesto) -> float:
    if nodo.tipo != "RUBRO":
        return 0.0
    if nodo.metrado is None or nodo.precio_unitario_ref is None:
        return 0.0
    return float(nodo.metrado) * float(nodo.precio_unitario_ref)


def _total_ref_excel(registro: dict) -> float:
    if registro["tipo"] != "RUBRO":
        return 0.0
    if registro["metrado"] is None or registro["precio_unitario_ref"] is None:
        return 0.0
    return float(registro["metrado"]) * float(registro["precio_unitario_ref"])


def _detalle_rubro(nodo: NodoPresupuesto) -> dict:
    return {
        "id": nodo.id,
        "item": nodo.item,
        "descripcion": nodo.descripcion,
        "unidad": nodo.unidad,
        "metrado": nodo.metrado,
        "precio_unitario_ref": nodo.precio_unitario_ref,
        "apu_id": nodo.apu_id,
        "tipo_rubro": nodo.tipo_rubro,
        "observaciones": nodo.observaciones,
        "individualizado": nodo.individualizado,
        "estado_actualizacion": nodo.estado_actualizacion or "activo",
    }


def _detalle_excel(registro: dict) -> dict:
    return {
        "row": registro["row"],
        "item": registro["item"],
        "descripcion": registro["descripcion"],
        "unidad": registro["unidad"],
        "metrado": registro["metrado"],
        "precio_unitario_ref": registro["precio_unitario_ref"],
        "observaciones_excel": registro["observaciones_excel"],
        "ruta": " > ".join([p["descripcion"] for p in registro["path"]]),
    }


def _construir_preview_actualizacion(
    db: Session,
    proyecto_id: int,
    contenido: bytes,
    archivo_nombre: Optional[str],
    hoja: str,
) -> dict:
    filas_excel, stats_excel = _leer_excel_presupuesto(contenido, hoja)
    nodos_actuales = (
        db.query(NodoPresupuesto)
        .filter(NodoPresupuesto.proyecto_id == proyecto_id)
        .order_by(NodoPresupuesto.orden, NodoPresupuesto.id)
        .all()
    )
    por_id = {n.id: n for n in nodos_actuales}
    actuales_por_item = {n.item: n for n in nodos_actuales if n.item}
    rubros_actuales = [n for n in nodos_actuales if n.tipo == "RUBRO"]
    rubros_actuales_por_item = {n.item: n for n in rubros_actuales if n.item}
    rubros_excel = [f for f in filas_excel if f["tipo"] == "RUBRO" and f["item"]]
    rubros_excel_por_item = {f["item"]: f for f in rubros_excel}

    items_actuales = set(rubros_actuales_por_item)
    items_excel = set(rubros_excel_por_item)
    items_coincidentes = items_actuales & items_excel
    items_nuevos = items_excel - items_actuales
    items_obsoletos = items_actuales - items_excel

    actualizar_seguro = []
    revision = []
    matriz = []

    for item in sorted(items_coincidentes):
        actual = rubros_actuales_por_item[item]
        nuevo = rubros_excel_por_item[item]
        cambios = {
            "descripcion": _distinto_texto(actual.descripcion, nuevo["descripcion"]),
            "unidad": _distinto_texto(actual.unidad, nuevo["unidad"]),
            "metrado": _distinto_numero(actual.metrado, nuevo["metrado"]),
            "precio_unitario_ref": _distinto_numero(
                actual.precio_unitario_ref,
                nuevo["precio_unitario_ref"],
                PU_TOLERANCIA,
            ),
            "estructura": _ruta_clave_actual(actual, por_id) != _ruta_clave_excel(nuevo),
        }
        motivos = []
        if cambios["unidad"]:
            motivos.append("CAMBIO_UNIDAD")
        if actual.apu_id and (cambios["descripcion"] or cambios["unidad"]):
            motivos.append("APU_VINCULADO_CON_CAMBIO_NOMBRE_O_UNIDAD")
        if cambios["estructura"]:
            motivos.append("CAMBIO_ESTRUCTURA")

        entrada = {
            "tipo": "coincidente",
            "item": item,
            "actual": _detalle_rubro(actual),
            "excel": _detalle_excel(nuevo),
            "cambios": cambios,
            "motivos_revision": motivos,
        }
        matriz.append(entrada)
        if motivos:
            revision.append(entrada)
        elif any(cambios.values()):
            actualizar_seguro.append(entrada)

    obsoletos = [
        {
            "tipo": "obsoleto",
            "item": item,
            "actual": _detalle_rubro(rubros_actuales_por_item[item]),
            "motivos_revision": [],
        }
        for item in sorted(items_obsoletos)
    ]

    nuevos_por_ancla: dict[str, dict] = {}
    for item in sorted(items_nuevos):
        registro = rubros_excel_por_item[item]
        ancla = None
        for ancestro in registro["path"]:
            if ancestro["item"] in actuales_por_item:
                existente = actuales_por_item[ancestro["item"]]
                ancla = {
                    "id": existente.id,
                    "tipo": existente.tipo,
                    "item": existente.item,
                    "descripcion": existente.descripcion,
                }
        clave = ancla["item"] if ancla else "__raiz__"
        if clave not in nuevos_por_ancla:
            nuevos_por_ancla[clave] = {
                "tipo": "nuevos",
                "ancla": ancla,
                "ruta": " > ".join([p["descripcion"] for p in registro["path"]]),
                "rubros": [],
            }
        nuevos_por_ancla[clave]["rubros"].append(_detalle_excel(registro))

    nuevos_paquetes = sorted(
        nuevos_por_ancla.values(),
        key=lambda p: (-len(p["rubros"]), p["ruta"]),
    )

    total_actual = sum(_total_ref_rubro(n) for n in rubros_actuales if (n.estado_actualizacion or "activo") != "obsoleto")
    total_excel = sum(_total_ref_excel(f) for f in rubros_excel)
    resumen = {
        "archivo": archivo_nombre,
        "hoja": hoja,
        "total_nodos_actual": len(nodos_actuales),
        "total_rubros_actual": len(rubros_actuales),
        "total_ref_actual": total_actual,
        "total_nodos_excel": stats_excel["total_nodos"],
        "total_rubros_excel": stats_excel["total_rubros"],
        "total_ref_excel": total_excel,
        "rubros_coincidentes": len(items_coincidentes),
        "rubros_nuevos": len(items_nuevos),
        "rubros_obsoletos": len(items_obsoletos),
        "rubros_actualizacion_segura": len(actualizar_seguro),
        "rubros_revision": len(revision),
        "cambios_nombre": sum(1 for m in matriz if m["cambios"]["descripcion"]),
        "cambios_unidad": sum(1 for m in matriz if m["cambios"]["unidad"]),
        "cambios_metrado": sum(1 for m in matriz if m["cambios"]["metrado"]),
        "cambios_pu": sum(1 for m in matriz if m["cambios"]["precio_unitario_ref"]),
        "cambios_estructura": sum(1 for m in matriz if m["cambios"]["estructura"]),
    }

    return {
        "resumen": resumen,
        "paquetes": {
            "automatico_seguro": {
                "rubros_existentes": actualizar_seguro,
                "nuevos_por_ancla": nuevos_paquetes,
            },
            "revision_requerida": revision,
            "obsoletos": obsoletos,
        },
        "matriz": matriz,
        "_filas_excel": filas_excel,
    }


# ════════════════════════════════════════
# Schemas Pydantic
# ════════════════════════════════════════

class ProyectoCreate(BaseModel):
    nombre: str
    codigo: Optional[str] = None
    descripcion: Optional[str] = None


class ProyectoUpdate(BaseModel):
    nombre: Optional[str] = None
    codigo: Optional[str] = None
    descripcion: Optional[str] = None
    estado: Optional[str] = None


class ProyectoOut(BaseModel):
    id: int
    nombre: str
    codigo: Optional[str]
    descripcion: Optional[str]
    estado: str
    fecha_creacion: datetime
    fecha_actualizacion: datetime

    class Config:
        from_attributes = True


class NodoOut(BaseModel):
    id: int
    proyecto_id: int
    padre_id: Optional[int]
    tipo: str
    item: Optional[str]
    descripcion: str
    orden: int
    unidad: Optional[str]
    metrado: Optional[float]
    precio_unitario_ref: Optional[float]
    apu_id: Optional[int]
    tipo_rubro: Optional[str]
    observaciones: Optional[str]
    individualizado: Optional[bool] = None
    estado_actualizacion: Optional[str] = None
    actualizacion_lote_id: Optional[int] = None
    excel_fila: Optional[int] = None
    excel_hoja: Optional[str] = None
    excel_archivo: Optional[str] = None
    fecha_actualizacion_fuente: Optional[datetime] = None

    class Config:
        from_attributes = True


class VincularAPURequest(BaseModel):
    apu_id: int


class CrearAPUDesdeRubroOut(BaseModel):
    nodo: NodoOut
    apu_id: int
    codigo: Optional[str]
    nombre: str
    unidad: str
    estado: str


# ════════════════════════════════════════
# CRUD Proyectos
# ════════════════════════════════════════

@router.get("/proyectos/", response_model=list[ProyectoOut])
def listar_proyectos(db: Session = Depends(get_db)):
    return db.query(Proyecto).order_by(Proyecto.fecha_creacion.desc()).all()


@router.post("/proyectos/", response_model=ProyectoOut, status_code=201)
def crear_proyecto(data: ProyectoCreate, db: Session = Depends(get_db)):
    # Verificar código único si se proporcionó
    if data.codigo:
        existe = db.query(Proyecto).filter(Proyecto.codigo == data.codigo).first()
        if existe:
            raise HTTPException(
                status_code=400, detail=f"Ya existe un proyecto con código '{data.codigo}'"
            )
    proyecto = Proyecto(
        nombre=data.nombre,
        codigo=data.codigo,
        descripcion=data.descripcion,
    )
    db.add(proyecto)
    db.commit()
    db.refresh(proyecto)
    return proyecto


@router.get("/proyectos/{proyecto_id}", response_model=ProyectoOut)
def obtener_proyecto(proyecto_id: int, db: Session = Depends(get_db)):
    proyecto = db.query(Proyecto).filter(Proyecto.id == proyecto_id).first()
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return proyecto


@router.put("/proyectos/{proyecto_id}", response_model=ProyectoOut)
def actualizar_proyecto(
    proyecto_id: int, data: ProyectoUpdate, db: Session = Depends(get_db)
):
    proyecto = db.query(Proyecto).filter(Proyecto.id == proyecto_id).first()
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    if data.nombre is not None:
        proyecto.nombre = data.nombre
    if data.codigo is not None:
        # Verificar que el nuevo código no lo usa otro proyecto
        otro = (
            db.query(Proyecto)
            .filter(Proyecto.codigo == data.codigo, Proyecto.id != proyecto_id)
            .first()
        )
        if otro:
            raise HTTPException(
                status_code=400, detail=f"Código '{data.codigo}' ya está en uso"
            )
        proyecto.codigo = data.codigo
    if data.descripcion is not None:
        proyecto.descripcion = data.descripcion
    if data.estado is not None:
        if data.estado not in ("activo", "archivado"):
            raise HTTPException(
                status_code=400, detail="Estado debe ser 'activo' o 'archivado'"
            )
        proyecto.estado = data.estado

    proyecto.fecha_actualizacion = datetime.utcnow()
    db.commit()
    db.refresh(proyecto)
    return proyecto


@router.delete("/proyectos/{proyecto_id}", status_code=204)
def eliminar_proyecto(proyecto_id: int, db: Session = Depends(get_db)):
    proyecto = db.query(Proyecto).filter(Proyecto.id == proyecto_id).first()
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    db.delete(proyecto)
    db.commit()


# ════════════════════════════════════════
# Nodos — árbol completo
# ════════════════════════════════════════

@router.get("/proyectos/{proyecto_id}/nodos", response_model=list[NodoOut])
def listar_nodos(proyecto_id: int, db: Session = Depends(get_db)):
    """
    Devuelve todos los nodos del proyecto ordenados por 'orden'.
    El frontend construye el árbol usando padre_id.
    """
    proyecto = db.query(Proyecto).filter(Proyecto.id == proyecto_id).first()
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    nodos = (
        db.query(NodoPresupuesto)
        .filter(NodoPresupuesto.proyecto_id == proyecto_id)
        .order_by(NodoPresupuesto.orden)
        .all()
    )
    return nodos


# ════════════════════════════════════════
# Importación desde Excel
# ════════════════════════════════════════

@router.post("/proyectos/{proyecto_id}/importar", status_code=201)
def importar_excel(
    proyecto_id: int,
    archivo: UploadFile = File(...),
    hoja: str = Form(default="PPTO META"),
    db: Session = Depends(get_db),
):
    """
    Importa un presupuesto desde Excel.

    Parámetros:
      - archivo: el .xlsx a importar
      - hoja: nombre de la hoja a leer (default: "PPTO META")

    La hoja debe tener columnas en este orden desde la fila 6:
      Tipo | Item | Descripción | Und. | Metrado | P.U. | P.Total

    Tipos válidos: FASE, CATEGORIA, SUBCATEGORIA, CAPITULO, SUBCAPITULO, GRUPO, RUBRO

    Comportamiento con rubros SIN_APU:
      - precio_unitario_ref = 0
      - tipo_rubro = PENDIENTE
      - observaciones = "SIN_APU"
    """
    # 1. Verificar que el proyecto existe
    proyecto = db.query(Proyecto).filter(Proyecto.id == proyecto_id).first()
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    # 2. Verificar que el proyecto no tenga nodos ya (evitar doble importación)
    nodos_existentes = (
        db.query(NodoPresupuesto)
        .filter(NodoPresupuesto.proyecto_id == proyecto_id)
        .count()
    )
    if nodos_existentes > 0:
        raise HTTPException(
            status_code=400,
            detail=(
                f"El proyecto ya tiene {nodos_existentes} nodos importados. "
                "Elimínalos antes de reimportar."
            ),
        )

    # 3. Leer el archivo Excel
    try:
        import openpyxl

        contenido = archivo.file.read()
        wb = openpyxl.load_workbook(io.BytesIO(contenido), read_only=True)
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"No se pudo leer el archivo Excel: {e}"
        )

    if hoja not in wb.sheetnames:
        raise HTTPException(
            status_code=400,
            detail=f"Hoja '{hoja}' no encontrada. Hojas disponibles: {wb.sheetnames}",
        )

    ws = wb[hoja]

    # 4. Leer filas (datos reales empiezan en fila 6)
    filas_datos = []
    for row in ws.iter_rows(min_row=6, values_only=True):
        tipo = row[0]
        if tipo is None:
            continue
        tipo = str(tipo).strip().upper()
        if tipo not in ORDEN_JERARQUIA:
            continue  # Ignorar filas con tipo desconocido
        filas_datos.append(row)

    if not filas_datos:
        raise HTTPException(
            status_code=400,
            detail="No se encontraron filas válidas en la hoja especificada.",
        )

    # 5. Construir nodos y asignar padre_id usando stack
    #    El stack guarda (tipo, nodo_db) del ancestro más reciente de cada nivel
    nodos_creados = []
    stack: list[tuple[str, NodoPresupuesto]] = []

    for orden_global, row in enumerate(filas_datos):
        tipo = str(row[0]).strip().upper()
        item = str(row[1]).strip() if row[1] else None
        descripcion = str(row[2]).strip() if row[2] else "(sin descripción)"
        unidad = str(row[3]).strip() if row[3] else None
        metrado_raw = row[4]
        pu_raw = row[5]

        # ── Determinar padre ────────────────────────────────────
        nivel_actual = ORDEN_JERARQUIA.index(tipo)

        # Sacar del stack todos los nodos con nivel >= al actual
        while stack and ORDEN_JERARQUIA.index(stack[-1][0]) >= nivel_actual:
            stack.pop()

        padre_nodo = stack[-1][1] if stack else None

        # ── Campos específicos de RUBROs ─────────────────────────
        if tipo == "RUBRO":
            # Metrado
            if isinstance(metrado_raw, (int, float)):
                metrado = float(metrado_raw)
            else:
                metrado = None

            # Precio unitario y tipo_rubro
            if pu_raw == "SIN_APU" or (
                isinstance(pu_raw, str) and pu_raw.strip().upper() == "SIN_APU"
            ):
                precio_ref = 0.0
                tipo_rubro = "PENDIENTE"
                observaciones = "SIN_APU"
            elif isinstance(pu_raw, (int, float)):
                precio_ref = float(pu_raw)
                tipo_rubro = "PENDIENTE"
                observaciones = None
            else:
                # Valor inesperado (fórmula de texto, etc.)
                precio_ref = 0.0
                tipo_rubro = "PENDIENTE"
                observaciones = str(pu_raw) if pu_raw else None
        else:
            metrado = None
            precio_ref = None
            tipo_rubro = None
            observaciones = None
            unidad = None

        # ── Crear nodo ───────────────────────────────────────────
        nodo = NodoPresupuesto(
            proyecto_id=proyecto_id,
            padre_id=padre_nodo.id if padre_nodo else None,
            tipo=tipo,
            item=item,
            descripcion=descripcion,
            orden=orden_global,
            unidad=unidad,
            metrado=metrado,
            precio_unitario_ref=precio_ref,
            tipo_rubro=tipo_rubro,
            observaciones=observaciones,
        )
        db.add(nodo)
        db.flush()  # Obtener el id sin hacer commit, necesario para padre_id de los hijos

        nodos_creados.append(nodo)

        # Agregar al stack solo si no es RUBRO (los rubros no tienen hijos)
        if tipo != "RUBRO":
            stack.append((tipo, nodo))

    # 6. Confirmar todos los nodos en una sola transacción
    db.commit()

    # 7. Estadísticas para respuesta
    conteo_por_tipo = {}
    for n in nodos_creados:
        conteo_por_tipo[n.tipo] = conteo_por_tipo.get(n.tipo, 0) + 1

    return {
        "mensaje": f"Importación completada: {len(nodos_creados)} nodos creados",
        "proyecto_id": proyecto_id,
        "hoja_importada": hoja,
        "total_nodos": len(nodos_creados),
        "por_tipo": conteo_por_tipo,
    }


# ════════════════════════════════════════
# Vincular / Desvincular APU
# ════════════════════════════════════════

# ════════════════════════════════════════
# Actualizacion desde Excel
# ════════════════════════════════════════

@router.post("/proyectos/{proyecto_id}/actualizaciones/preview")
def preview_actualizacion_excel(
    proyecto_id: int,
    archivo: UploadFile = File(...),
    hoja: str = Form(default="PPTO 260615"),
    db: Session = Depends(get_db),
):
    proyecto = db.query(Proyecto).filter(Proyecto.id == proyecto_id).first()
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    contenido = archivo.file.read()
    preview = _construir_preview_actualizacion(
        db=db,
        proyecto_id=proyecto_id,
        contenido=contenido,
        archivo_nombre=archivo.filename,
        hoja=hoja,
    )
    preview.pop("_filas_excel", None)
    return preview


@router.post("/proyectos/{proyecto_id}/actualizaciones/apply")
def aplicar_actualizacion_excel(
    proyecto_id: int,
    archivo: UploadFile = File(...),
    hoja: str = Form(default="PPTO 260615"),
    db: Session = Depends(get_db),
):
    proyecto = db.query(Proyecto).filter(Proyecto.id == proyecto_id).first()
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    contenido = archivo.file.read()
    preview = _construir_preview_actualizacion(
        db=db,
        proyecto_id=proyecto_id,
        contenido=contenido,
        archivo_nombre=archivo.filename,
        hoja=hoja,
    )
    filas_excel = preview["_filas_excel"]
    resumen = preview["resumen"]
    safe_items = {
        r["item"]
        for r in preview["paquetes"]["automatico_seguro"]["rubros_existentes"]
    }
    obsolete_items = {
        r["item"]
        for r in preview["paquetes"]["obsoletos"]
    }
    nuevos_items = {
        rubro["item"]
        for paquete in preview["paquetes"]["automatico_seguro"]["nuevos_por_ancla"]
        for rubro in paquete["rubros"]
    }
    items_a_crear = set(nuevos_items)
    for fila in filas_excel:
        if fila["tipo"] == "RUBRO" and fila["item"] in nuevos_items:
            for ancestro in fila["path"]:
                if ancestro["item"]:
                    items_a_crear.add(ancestro["item"])

    try:
        lote = ActualizacionPresupuestoLote(
            proyecto_id=proyecto_id,
            archivo=archivo.filename,
            hoja=hoja,
            estado="aplicado",
            total_nodos_excel=resumen["total_nodos_excel"],
            total_rubros_excel=resumen["total_rubros_excel"],
            total_nodos_antes=resumen["total_nodos_actual"],
            total_rubros_antes=resumen["total_rubros_actual"],
            total_excepciones=resumen["rubros_revision"],
            resumen_json=json.dumps(resumen, ensure_ascii=False),
            fecha_creacion=datetime.utcnow(),
        )
        db.add(lote)
        db.flush()

        nodos = (
            db.query(NodoPresupuesto)
            .filter(NodoPresupuesto.proyecto_id == proyecto_id)
            .order_by(NodoPresupuesto.orden, NodoPresupuesto.id)
            .all()
        )
        nodos_por_item = {n.item: n for n in nodos if n.item}
        max_orden = max([n.orden or 0 for n in nodos], default=0)
        fecha_fuente = datetime.utcnow()

        rubros_actualizados = 0
        for fila in filas_excel:
            if fila["tipo"] != "RUBRO" or fila["item"] not in safe_items:
                continue
            nodo = nodos_por_item.get(fila["item"])
            if not nodo:
                continue
            nodo.descripcion = fila["descripcion"]
            nodo.unidad = fila["unidad"]
            nodo.metrado = fila["metrado"]
            nodo.precio_unitario_ref = fila["precio_unitario_ref"]
            nodo.estado_actualizacion = "activo"
            nodo.actualizacion_lote_id = lote.id
            nodo.excel_fila = fila["row"]
            nodo.excel_hoja = hoja
            nodo.excel_archivo = archivo.filename
            nodo.fecha_actualizacion_fuente = fecha_fuente
            rubros_actualizados += 1

        obsoletos_marcados = 0
        for item in obsolete_items:
            nodo = nodos_por_item.get(item)
            if not nodo:
                continue
            nodo.estado_actualizacion = "obsoleto"
            nodo.actualizacion_lote_id = lote.id
            nodo.fecha_actualizacion_fuente = fecha_fuente
            obsoletos_marcados += 1

        stack_por_nivel: dict[int, NodoPresupuesto] = {}
        nodos_creados = 0
        for fila in filas_excel:
            nivel = ORDEN_JERARQUIA.index(fila["tipo"])
            item = fila["item"]
            nodo_existente = nodos_por_item.get(item) if item else None

            if nodo_existente is not None:
                nodo_existente.estado_actualizacion = "activo"
                stack_por_nivel[nivel] = nodo_existente
                for nivel_borrar in [n for n in stack_por_nivel if n > nivel]:
                    del stack_por_nivel[nivel_borrar]
                continue

            if not item or item not in items_a_crear:
                continue

            padre = None
            for nivel_padre in range(nivel - 1, -1, -1):
                if nivel_padre in stack_por_nivel:
                    padre = stack_por_nivel[nivel_padre]
                    break

            max_orden += 1
            es_rubro = fila["tipo"] == "RUBRO"
            nuevo = NodoPresupuesto(
                proyecto_id=proyecto_id,
                padre_id=padre.id if padre else None,
                tipo=fila["tipo"],
                item=item,
                descripcion=fila["descripcion"],
                orden=max_orden,
                unidad=fila["unidad"] if es_rubro else None,
                metrado=fila["metrado"] if es_rubro else None,
                precio_unitario_ref=fila["precio_unitario_ref"] if es_rubro else None,
                tipo_rubro="PENDIENTE" if es_rubro else None,
                observaciones=fila["observaciones_excel"] if es_rubro else None,
                estado_actualizacion="activo",
                actualizacion_lote_id=lote.id,
                excel_fila=fila["row"],
                excel_hoja=hoja,
                excel_archivo=archivo.filename,
                fecha_actualizacion_fuente=fecha_fuente,
            )
            db.add(nuevo)
            db.flush()
            nodos_por_item[item] = nuevo
            stack_por_nivel[nivel] = nuevo
            for nivel_borrar in [n for n in stack_por_nivel if n > nivel]:
                del stack_por_nivel[nivel_borrar]
            nodos_creados += 1

        lote.total_nodos_creados = nodos_creados
        lote.total_rubros_actualizados = rubros_actualizados
        lote.total_obsoletos_marcados = obsoletos_marcados
        lote.resumen_json = json.dumps(
            {
                **resumen,
                "aplicado": {
                    "lote_id": lote.id,
                    "nodos_creados": nodos_creados,
                    "rubros_actualizados": rubros_actualizados,
                    "obsoletos_marcados": obsoletos_marcados,
                    "excepciones_no_aplicadas": resumen["rubros_revision"],
                },
            },
            ensure_ascii=False,
        )
        proyecto.fecha_actualizacion = datetime.utcnow()
        db.commit()

        return {
            "mensaje": "Actualizacion aplicada",
            "lote_id": lote.id,
            "resumen": {
                **resumen,
                "nodos_creados": nodos_creados,
                "rubros_actualizados": rubros_actualizados,
                "obsoletos_marcados": obsoletos_marcados,
                "excepciones_no_aplicadas": resumen["rubros_revision"],
            },
        }
    except Exception:
        db.rollback()
        raise


@router.patch("/nodos/{nodo_id}/vincular-apu", response_model=NodoOut)
def vincular_apu(
    nodo_id: int, data: VincularAPURequest, db: Session = Depends(get_db)
):
    """
    Vincula un APU a un nodo RUBRO.
    La unidad del rubro queda como referencia visual; no bloquea la vinculacion.
    """
    nodo = db.query(NodoPresupuesto).filter(NodoPresupuesto.id == nodo_id).first()
    if not nodo:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")
    if nodo.tipo != "RUBRO":
        raise HTTPException(
            status_code=400, detail="Solo se puede vincular un APU a nodos tipo RUBRO"
        )

    apu = db.query(APU).filter(APU.id == data.apu_id).first()
    if not apu:
        raise HTTPException(status_code=404, detail="APU no encontrado")

    nodo.apu_id = data.apu_id
    nodo.tipo_rubro = "VINCULADO"
    db.commit()
    db.refresh(nodo)
    return nodo


@router.patch("/nodos/{nodo_id}/desvincular-apu", response_model=NodoOut)
def desvincular_apu(nodo_id: int, db: Session = Depends(get_db)):
    """
    Quita el APU vinculado a un nodo RUBRO.
    El nodo vuelve a estado PENDIENTE.
    """
    nodo = db.query(NodoPresupuesto).filter(NodoPresupuesto.id == nodo_id).first()
    if not nodo:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")

    nodo.apu_id = None
    nodo.tipo_rubro = "PENDIENTE"
    db.commit()
    db.refresh(nodo)
    return nodo


@router.post("/nodos/{nodo_id}/crear-apu", response_model=CrearAPUDesdeRubroOut, status_code=201)
def crear_apu_desde_rubro(nodo_id: int, db: Session = Depends(get_db)):
    """
    Crea un APU en revision desde un RUBRO y lo vincula en la misma transaccion.
    """
    nodo = db.query(NodoPresupuesto).filter(NodoPresupuesto.id == nodo_id).first()
    if not nodo:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")
    if nodo.tipo != "RUBRO":
        raise HTTPException(status_code=400, detail="Solo se puede crear APU desde nodos tipo RUBRO")
    if not nodo.unidad:
        raise HTTPException(status_code=400, detail="El rubro no tiene unidad para crear el APU")

    apu = APU(
        codigo=siguiente_codigo_apu(db),
        nombre=nodo.descripcion,
        descripcion=nodo.descripcion,
        unidad=nodo.unidad,
        rendimiento=1.0,
        estado="en_revision",
    )
    db.add(apu)
    db.flush()

    nodo.apu_id = apu.id
    nodo.tipo_rubro = "VINCULADO"
    nodo.observaciones = None

    db.commit()
    db.refresh(nodo)
    db.refresh(apu)
    return {
        "nodo": nodo,
        "apu_id": apu.id,
        "codigo": apu.codigo,
        "nombre": apu.nombre,
        "unidad": apu.unidad,
        "estado": apu.estado,
    }

@router.patch("/nodos/{nodo_id}/individualizar", response_model=NodoOut)
def individualizar_nodo(nodo_id: int, db: Session = Depends(get_db)):
    nodo = db.query(NodoPresupuesto).filter(NodoPresupuesto.id == nodo_id).first()
    if not nodo:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")
    nodo.individualizado = True
    db.commit()
    db.refresh(nodo)
    return nodo


@router.patch("/nodos/{nodo_id}/reagrupar", response_model=NodoOut)
def reagrupar_nodo(nodo_id: int, db: Session = Depends(get_db)):
    nodo = db.query(NodoPresupuesto).filter(NodoPresupuesto.id == nodo_id).first()
    if not nodo:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")
    nodo.individualizado = False
    db.commit()
    db.refresh(nodo)
    return nodo

@router.patch("/nodos/{nodo_id}/marcar-sin-apu", response_model=NodoOut)
def marcar_sin_apu(nodo_id: int, db: Session = Depends(get_db)):
    """Marca un rubro como Sin APU manualmente."""
    nodo = db.query(NodoPresupuesto).filter(NodoPresupuesto.id == nodo_id).first()
    if not nodo:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")
    if nodo.tipo != "RUBRO":
        raise HTTPException(status_code=400, detail="Solo se pueden marcar nodos tipo RUBRO")
    # Si tenía APU vinculado, lo quitamos
    nodo.apu_id = None
    nodo.tipo_rubro = "PENDIENTE"
    nodo.observaciones = "SIN_APU"
    db.commit()
    db.refresh(nodo)
    return nodo


@router.patch("/nodos/{nodo_id}/desmarcar-sin-apu", response_model=NodoOut)
def desmarcar_sin_apu(nodo_id: int, db: Session = Depends(get_db)):
    """Quita la marca Sin APU — el rubro vuelve a estado Pendiente."""
    nodo = db.query(NodoPresupuesto).filter(NodoPresupuesto.id == nodo_id).first()
    if not nodo:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")
    nodo.observaciones = None
    nodo.tipo_rubro = "PENDIENTE"
    db.commit()
    db.refresh(nodo)
    return nodo
