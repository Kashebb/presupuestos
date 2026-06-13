import math
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db import get_db
from app.models.recurso import Recurso
from app.schemas.recurso import RecursoCreate, RecursoUpdate, RecursoOut, RecursoPrecioUpdate

router = APIRouter(prefix="/recursos", tags=["recursos"])
CODIGO_CONSECUTIVO_RE = re.compile(r"^(.+-)(\d+)$")


def _patrones_codigo_por_categoria(db: Session, categoria: str):
    recursos = (
        db.query(Recurso.codigo)
        .filter(Recurso.activo == True, Recurso.categoria == categoria)
        .all()
    )
    patrones = {}
    for (codigo,) in recursos:
        match = CODIGO_CONSECUTIVO_RE.match(codigo or "")
        if not match:
            continue
        prefijo, consecutivo = match.groups()
        ancho = len(consecutivo)
        numero = int(consecutivo)
        if prefijo not in patrones:
            patrones[prefijo] = {"conteo": 0, "maximo": 0, "ancho": ancho}
        patrones[prefijo]["conteo"] += 1
        patrones[prefijo]["maximo"] = max(patrones[prefijo]["maximo"], numero)
        patrones[prefijo]["ancho"] = max(patrones[prefijo]["ancho"], ancho)
    return patrones


def _siguiente_codigo(db: Session, categoria: str, codigo_base: Optional[str] = None):
    patrones = _patrones_codigo_por_categoria(db, categoria)
    if not patrones:
        raise HTTPException(
            status_code=400,
            detail=f"No hay patrones de codigo existentes para la categoria '{categoria}'.",
        )

    prefijo = None
    if codigo_base:
        match = CODIGO_CONSECUTIVO_RE.match(codigo_base)
        if match and match.group(1) in patrones:
            prefijo = match.group(1)

    if not prefijo:
        prefijo = max(
            patrones,
            key=lambda p: (patrones[p]["conteo"], patrones[p]["maximo"], p),
        )

    info = patrones[prefijo]
    siguiente = info["maximo"] + 1
    codigo = f"{prefijo}{str(siguiente).zfill(info['ancho'])}"
    return {"codigo": codigo, "prefijo": prefijo, "siguiente": siguiente}

@router.get("/", response_model=List[RecursoOut])
def listar_recursos(db: Session = Depends(get_db)):
    return db.query(Recurso).filter(Recurso.activo == True).all()

@router.get("/siguiente-codigo")
def obtener_siguiente_codigo_recurso(
    categoria: str,
    codigo_base: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return _siguiente_codigo(db, categoria, codigo_base)

@router.get("/{recurso_id}", response_model=RecursoOut)
def obtener_recurso(recurso_id: int, db: Session = Depends(get_db)):
    recurso = db.query(Recurso).filter(Recurso.id == recurso_id).first()
    if not recurso:
        raise HTTPException(status_code=404, detail="Recurso no encontrado")
    return recurso

@router.post("/", response_model=RecursoOut)
def crear_recurso(recurso: RecursoCreate, db: Session = Depends(get_db)):
    db_recurso = Recurso(**recurso.model_dump())
    db.add(db_recurso)
    db.commit()
    db.refresh(db_recurso)
    return db_recurso

@router.patch("/{recurso_id}/precio", response_model=RecursoOut)
def actualizar_precio_recurso(
    recurso_id: int,
    data: RecursoPrecioUpdate,
    db: Session = Depends(get_db),
):
    db_recurso = db.query(Recurso).filter(Recurso.id == recurso_id).first()
    if not db_recurso:
        raise HTTPException(status_code=404, detail="Recurso no encontrado")
    if data.precio_unitario < 0 or not math.isfinite(data.precio_unitario):
        raise HTTPException(status_code=400, detail="Precio invalido")

    db_recurso.precio_unitario = data.precio_unitario
    db.commit()
    db.refresh(db_recurso)
    return db_recurso

@router.put("/{recurso_id}", response_model=RecursoOut)
def actualizar_recurso(recurso_id: int, recurso: RecursoUpdate, db: Session = Depends(get_db)):
    db_recurso = db.query(Recurso).filter(Recurso.id == recurso_id).first()
    if not db_recurso:
        raise HTTPException(status_code=404, detail="Recurso no encontrado")
    for key, value in recurso.model_dump().items():
        setattr(db_recurso, key, value)
    db.commit()
    db.refresh(db_recurso)
    return db_recurso

@router.delete("/{recurso_id}")
def eliminar_recurso(recurso_id: int, db: Session = Depends(get_db)):
    db_recurso = db.query(Recurso).filter(Recurso.id == recurso_id).first()
    if not db_recurso:
        raise HTTPException(status_code=404, detail="Recurso no encontrado")
    db_recurso.activo = False
    db.commit()
    return {"mensaje": "Recurso desactivado"}
