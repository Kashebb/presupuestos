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
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.presupuesto import Proyecto, NodoPresupuesto
from app.models.apu import APU

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

    class Config:
        from_attributes = True


class VincularAPURequest(BaseModel):
    apu_id: int


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

@router.patch("/nodos/{nodo_id}/vincular-apu", response_model=NodoOut)
def vincular_apu(
    nodo_id: int, data: VincularAPURequest, db: Session = Depends(get_db)
):
    """
    Vincula un APU a un nodo RUBRO.
    Valida que la unidad del APU coincida con la del nodo.
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

    # Validar coincidencia de unidad (ignorar mayúsculas/minúsculas y espacios)
    if nodo.unidad and apu.unidad:
        unidad_nodo = nodo.unidad.strip().lower()
        unidad_apu = apu.unidad.strip().lower()
        if unidad_nodo != unidad_apu:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unidad del rubro ({nodo.unidad}) no coincide "
                    f"con la unidad del APU ({apu.unidad})"
                ),
            )

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