import math
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db import get_db
from app.models.recurso import Recurso
from app.schemas.recurso import RecursoCreate, RecursoUpdate, RecursoOut, RecursoPrecioUpdate, RecursoEtiquetasUpdate

router = APIRouter(prefix="/recursos", tags=["recursos"])
CODIGO_CONSECUTIVO_RE = re.compile(r"^(.+-)(\d+)$")
ETIQUETAS_RECURSO_CONTROLADAS = {
    "precio validado",
    "precio referencial",
    "precio cotizado",
    "proveedor confirmado",
    "sin precio actualizado",
    "requiere validacion",
    "especial del proyecto",
    "solo este subproyecto",
}


def _normalizar_etiquetas(etiquetas: list[str]) -> list[str]:
    resultado = []
    for etiqueta in etiquetas or []:
        valor = str(etiqueta or "").strip().lower()
        if not valor:
            continue
        if valor not in ETIQUETAS_RECURSO_CONTROLADAS:
            raise HTTPException(status_code=400, detail=f"Etiqueta recurso no permitida: {etiqueta}")
        if valor not in resultado:
            resultado.append(valor)
    return resultado


def _patrones_codigo_por_categoria(db: Session, categoria: str, subcategoria: Optional[str] = None):
    filtros = [Recurso.activo == True, Recurso.categoria == categoria]
    if subcategoria:
        filtros.append(Recurso.subcategoria == subcategoria)

    recursos = (
        db.query(Recurso.codigo)
        .filter(*filtros)
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


def _siguiente_codigo(db: Session, categoria: str, subcategoria: Optional[str] = None, codigo_base: Optional[str] = None):
    patrones = _patrones_codigo_por_categoria(db, categoria, subcategoria)
    if not patrones:
        alcance = f"{categoria} / {subcategoria}" if subcategoria else categoria
        raise HTTPException(
            status_code=400,
            detail=f"No hay patrones de codigo existentes para '{alcance}'.",
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
def listar_recursos(estado: str = "activos", db: Session = Depends(get_db)):
    query = db.query(Recurso)
    if estado == "activos":
        query = query.filter(Recurso.activo == True)
    elif estado == "inactivos":
        query = query.filter(Recurso.activo == False)
    elif estado != "todos":
        raise HTTPException(status_code=400, detail="Estado de recursos invalido.")
    return query.all()

@router.get("/clasificaciones")
def listar_clasificaciones_recurso(db: Session = Depends(get_db)):
    recursos = (
        db.query(Recurso.categoria, Recurso.subcategoria, Recurso.familia, Recurso.codigo)
        .filter(Recurso.activo == True)
        .all()
    )

    clasificaciones = {}
    for categoria, subcategoria, familia, codigo in recursos:
        if not categoria or not subcategoria:
            continue
        match = CODIGO_CONSECUTIVO_RE.match(codigo or "")
        if not match:
            continue

        categoria_info = clasificaciones.setdefault(categoria, {})
        subcategoria_info = categoria_info.setdefault(
            subcategoria,
            {"familias": set(), "prefijos": set()},
        )
        subcategoria_info["prefijos"].add(match.group(1))
        if familia:
            subcategoria_info["familias"].add(familia)

    return [
        {
            "categoria": categoria,
            "subcategorias": [
                {
                    "nombre": subcategoria,
                    "prefijos": sorted(info["prefijos"]),
                    "familias": sorted(info["familias"]),
                }
                for subcategoria, info in sorted(subcategorias.items())
            ],
        }
        for categoria, subcategorias in sorted(clasificaciones.items())
    ]

@router.get("/siguiente-codigo")
def obtener_siguiente_codigo_recurso(
    categoria: str,
    subcategoria: Optional[str] = None,
    codigo_base: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return _siguiente_codigo(db, categoria, subcategoria, codigo_base)

@router.get("/{recurso_id}", response_model=RecursoOut)
def obtener_recurso(recurso_id: int, db: Session = Depends(get_db)):
    recurso = db.query(Recurso).filter(Recurso.id == recurso_id).first()
    if not recurso:
        raise HTTPException(status_code=404, detail="Recurso no encontrado")
    return recurso

@router.post("/", response_model=RecursoOut)
def crear_recurso(recurso: RecursoCreate, db: Session = Depends(get_db)):
    data = recurso.model_dump()
    data["etiquetas"] = _normalizar_etiquetas(data.get("etiquetas") or [])
    db_recurso = Recurso(**data)
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
    data = recurso.model_dump()
    data["etiquetas"] = _normalizar_etiquetas(data.get("etiquetas") or [])
    for key, value in data.items():
        setattr(db_recurso, key, value)
    db.commit()
    db.refresh(db_recurso)
    return db_recurso

@router.patch("/{recurso_id}/etiquetas", response_model=RecursoOut)
def actualizar_etiquetas_recurso(recurso_id: int, data: RecursoEtiquetasUpdate, db: Session = Depends(get_db)):
    db_recurso = db.query(Recurso).filter(Recurso.id == recurso_id).first()
    if not db_recurso:
        raise HTTPException(status_code=404, detail="Recurso no encontrado")
    db_recurso.etiquetas = _normalizar_etiquetas(data.etiquetas)
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
