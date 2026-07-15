import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from app.db import get_db
from app.models.apu import APU, APUItem, APUPlantilla, APUPlantillaItem, APUPlantillaUso
from app.schemas.apu import (
    APUCreate,
    APUUpdate,
    APUOut,
    APUEtiquetasUpdate,
    APUPlantillaAplicar,
    APUPlantillaCreate,
    APUPlantillaDesdeAPU,
    APUPlantillaOut,
    APUPlantillaUpdate,
    APUPlantillaUsoOut,
)
from app.services.apu_costos import calcular_costo_apu_compat, redondear_4

router = APIRouter(prefix="/apus", tags=["apus"])

CODIGO_APU_RE = re.compile(r"^(.*?)(\d+)$")
ETIQUETAS_APU_CONTROLADAS = {
    "validado",
    "referencial",
    "incompleto",
    "solo mano de obra",
    "solo materiales",
    "mano de obra + materiales",
    "ajustado con cotizacion",
    "requiere cotizacion",
    "subcontratado",
    "especial del proyecto",
}


def _normalizar_etiquetas(etiquetas: list[str]) -> list[str]:
    resultado = []
    for etiqueta in etiquetas or []:
        valor = str(etiqueta or "").strip().lower()
        if not valor:
            continue
        if valor not in ETIQUETAS_APU_CONTROLADAS:
            raise HTTPException(status_code=400, detail=f"Etiqueta APU no permitida: {etiqueta}")
        if valor not in resultado:
            resultado.append(valor)
    return resultado


def siguiente_codigo_apu(db: Session):
    codigos = [row[0] for row in db.query(APU.codigo).filter(APU.codigo.isnot(None)).all()]
    candidatos = []
    for codigo in codigos:
        match = CODIGO_APU_RE.match(codigo or "")
        if not match:
            continue
        prefijo, numero = match.groups()
        candidatos.append((prefijo, len(numero), int(numero)))

    if not candidatos:
        return "APU-0001"

    prefijo, ancho, numero = max(candidatos, key=lambda item: item[2])
    return f"{prefijo}{str(numero + 1).zfill(ancho)}"


_r4 = redondear_4


def _normalizar_apu_data(data: dict) -> dict:
    if "rendimiento" in data and data["rendimiento"] is not None:
        data["rendimiento"] = _r4(data["rendimiento"])
    if "etiquetas" in data:
        data["etiquetas"] = _normalizar_etiquetas(data.get("etiquetas") or [])
    return data


def _normalizar_item_data(data: dict) -> dict:
    if "cantidad" in data and data["cantidad"] is not None:
        data["cantidad"] = _r4(data["cantidad"])
    return data


calcular_costo_apu = calcular_costo_apu_compat

@router.get("/", response_model=List[APUOut])
def listar_apus(
    skip: int = 0,
    limit: int = 100,
    categoria: Optional[str] = None,
    estado: Optional[str] = None,
    buscar: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(APU).options(joinedload(APU.items))
    if categoria:
        query = query.filter(APU.categoria == categoria)
    if estado:
        query = query.filter(APU.estado == estado)
    if buscar:
        query = query.filter(
            APU.nombre.ilike(f"%{buscar}%") |
            APU.codigo.ilike(f"%{buscar}%")
        )
    return query.offset(skip).limit(limit).all()

@router.get("/costos/resumen")
def listar_costos_apus(
    skip: int = 0,
    limit: int = 500,
    db: Session = Depends(get_db)
):
    apus = (
        db.query(APU)
        .options(joinedload(APU.items).joinedload(APUItem.recurso))
        .offset(skip)
        .limit(limit)
        .all()
    )
    resumen = []
    for apu in apus:
        costo = calcular_costo_apu(apu)
        resumen.append(
            {
                "apu_id": apu.id,
                "codigo": apu.codigo,
                "precio_unitario": costo["precio_unitario"],
                "subtotales": costo["subtotales"],
                "herramienta_menor": costo["herramienta_menor"],
                "control_costo": (
                    "revisar_costo"
                    if "COSTO_NO_COINCIDE_CON_MAESTRO" in (apu.observacion or "")
                    else "ok"
                ),
            }
        )
    return resumen

@router.get("/siguiente-codigo")
def obtener_siguiente_codigo_apu(db: Session = Depends(get_db)):
    return {"codigo": siguiente_codigo_apu(db)}

@router.post("/", response_model=APUOut)
def crear_apu(apu: APUCreate, db: Session = Depends(get_db)):
    data = _normalizar_apu_data(apu.model_dump(exclude={"items"}))
    if not data.get("codigo"):
        data["codigo"] = siguiente_codigo_apu(db)
    db_apu = APU(**data)
    db.add(db_apu)
    db.flush()
    for item in apu.items:
        db_item = APUItem(apu_id=db_apu.id, **_normalizar_item_data(item.model_dump()))
        db.add(db_item)
    db.commit()
    db.refresh(db_apu)
    return db_apu


def _normalizar_lista_texto(valores: list[str]) -> list[str]:
    resultado = []
    for valor in valores or []:
        texto = str(valor or "").strip().lower()
        if texto and texto not in resultado:
            resultado.append(texto)
    return resultado


def _normalizar_plantilla_data(data: dict) -> dict:
    data["nombre"] = " ".join(str(data.get("nombre") or "").split())
    if not data["nombre"]:
        raise HTTPException(status_code=400, detail="El nombre de la plantilla es obligatorio")
    data["tipo"] = str(data.get("tipo") or "mixta").strip().lower() or "mixta"
    data["etiquetas"] = _normalizar_lista_texto(data.get("etiquetas") or [])
    if data.get("rendimiento_sugerido") is not None:
        data["rendimiento_sugerido"] = _r4(data["rendimiento_sugerido"])
    return data


def _plantilla_snapshot(plantilla: APUPlantilla) -> dict:
    return {
        "plantilla_id": plantilla.id,
        "nombre": plantilla.nombre,
        "tipo": plantilla.tipo,
        "rendimiento_sugerido": plantilla.rendimiento_sugerido,
        "items": [
            {
                "recurso_id": item.recurso_id,
                "categoria": item.categoria,
                "cantidad": _r4(item.cantidad),
                "orden": item.orden,
                "recurso_codigo": item.recurso.codigo if item.recurso else None,
                "recurso_descripcion": item.recurso.descripcion if item.recurso else None,
            }
            for item in sorted(plantilla.items, key=lambda item: (item.orden or 0, item.id or 0))
        ],
    }


@router.get("/plantillas", response_model=List[APUPlantillaOut])
def listar_plantillas_apu(
    buscar: Optional[str] = None,
    estado: str = "activas",
    db: Session = Depends(get_db),
):
    query = db.query(APUPlantilla).options(joinedload(APUPlantilla.items).joinedload(APUPlantillaItem.recurso))
    if estado == "activas":
        query = query.filter(APUPlantilla.activo.is_(True))
    elif estado == "inactivas":
        query = query.filter(APUPlantilla.activo.is_(False))
    elif estado != "todas":
        raise HTTPException(status_code=400, detail="Estado de plantillas invalido")
    if buscar:
        terminos = [t for t in re.split(r"\s+", buscar.strip()) if t]
        for termino in terminos:
            like = f"%{termino}%"
            query = query.filter(
                APUPlantilla.nombre.ilike(like) |
                APUPlantilla.descripcion.ilike(like) |
                APUPlantilla.tipo.ilike(like)
            )
    return query.order_by(APUPlantilla.nombre, APUPlantilla.id).all()


@router.post("/plantillas", response_model=APUPlantillaOut, status_code=201)
def crear_plantilla_apu(data: APUPlantillaCreate, db: Session = Depends(get_db)):
    payload = _normalizar_plantilla_data(data.model_dump(exclude={"items"}))
    plantilla = APUPlantilla(**payload)
    db.add(plantilla)
    db.flush()
    for idx, item in enumerate(data.items):
        db.add(APUPlantillaItem(plantilla_id=plantilla.id, **_normalizar_item_data({**item.model_dump(), "orden": idx})))
    db.commit()
    db.refresh(plantilla)
    return plantilla


@router.post("/plantillas/desde-apu", response_model=APUPlantillaOut, status_code=201)
def crear_plantilla_desde_apu(data: APUPlantillaDesdeAPU, db: Session = Depends(get_db)):
    apu = (
        db.query(APU)
        .options(joinedload(APU.items))
        .filter(APU.id == data.apu_id)
        .first()
    )
    if not apu:
        raise HTTPException(status_code=404, detail="APU no encontrado")
    items = [item for item in apu.items if not item.es_herramienta_menor and item.recurso_id]
    if not items:
        raise HTTPException(status_code=400, detail="El APU no tiene recursos para guardar como plantilla")

    payload = _normalizar_plantilla_data(data.model_dump(exclude={"apu_id", "usar_rendimiento_actual"}))
    payload["origen_apu_id"] = apu.id
    payload["rendimiento_sugerido"] = _r4(apu.rendimiento) if data.usar_rendimiento_actual else None
    plantilla = APUPlantilla(**payload)
    db.add(plantilla)
    db.flush()
    for idx, item in enumerate(sorted(items, key=lambda item: (item.orden or 0, item.id or 0))):
        db.add(
            APUPlantillaItem(
                plantilla_id=plantilla.id,
                recurso_id=item.recurso_id,
                categoria=item.categoria,
                cantidad=_r4(item.cantidad),
                orden=idx,
            )
        )
    db.commit()
    db.refresh(plantilla)
    return plantilla


@router.put("/plantillas/{plantilla_id}", response_model=APUPlantillaOut)
def actualizar_plantilla_apu(plantilla_id: int, data: APUPlantillaUpdate, db: Session = Depends(get_db)):
    plantilla = db.query(APUPlantilla).filter(APUPlantilla.id == plantilla_id).first()
    if not plantilla:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    for key, value in _normalizar_plantilla_data(data.model_dump(exclude={"items"})).items():
        setattr(plantilla, key, value)
    if data.items is not None:
        db.query(APUPlantillaItem).filter(APUPlantillaItem.plantilla_id == plantilla_id).delete()
        for idx, item in enumerate(data.items):
            db.add(APUPlantillaItem(plantilla_id=plantilla_id, **_normalizar_item_data({**item.model_dump(), "orden": idx})))
    db.commit()
    db.refresh(plantilla)
    return plantilla


@router.post("/{apu_id}/plantillas/{plantilla_id}/aplicar", response_model=APUOut)
def aplicar_plantilla_apu(
    apu_id: int,
    plantilla_id: int,
    data: APUPlantillaAplicar,
    db: Session = Depends(get_db),
):
    apu = (
        db.query(APU)
        .options(joinedload(APU.items), joinedload(APU.items).joinedload(APUItem.recurso))
        .filter(APU.id == apu_id)
        .first()
    )
    if not apu:
        raise HTTPException(status_code=404, detail="APU no encontrado")
    plantilla = (
        db.query(APUPlantilla)
        .options(joinedload(APUPlantilla.items).joinedload(APUPlantillaItem.recurso))
        .filter(APUPlantilla.id == plantilla_id, APUPlantilla.activo.is_(True))
        .first()
    )
    if not plantilla:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    if data.modo != "agregar":
        raise HTTPException(status_code=400, detail="Por ahora solo esta habilitado el modo agregar")

    max_orden = max([item.orden or 0 for item in apu.items] or [0])
    for idx, item in enumerate(sorted(plantilla.items, key=lambda item: (item.orden or 0, item.id or 0)), start=1):
        db.add(
            APUItem(
                apu_id=apu.id,
                recurso_id=item.recurso_id,
                categoria=item.categoria,
                cantidad=_r4(item.cantidad),
                orden=max_orden + idx,
                es_herramienta_menor=False,
            )
        )
    if data.usar_rendimiento and plantilla.rendimiento_sugerido:
        apu.rendimiento = _r4(plantilla.rendimiento_sugerido)

    db.add(
        APUPlantillaUso(
            apu_id=apu.id,
            plantilla_id=plantilla.id,
            modo=data.modo,
            usar_rendimiento=data.usar_rendimiento,
            snapshot_json=_plantilla_snapshot(plantilla),
        )
    )
    db.commit()
    db.refresh(apu)
    return apu


@router.get("/{apu_id}/plantillas/usos", response_model=List[APUPlantillaUsoOut])
def listar_usos_plantillas_apu(apu_id: int, db: Session = Depends(get_db)):
    apu = db.query(APU.id).filter(APU.id == apu_id).first()
    if not apu:
        raise HTTPException(status_code=404, detail="APU no encontrado")
    return (
        db.query(APUPlantillaUso)
        .filter(APUPlantillaUso.apu_id == apu_id)
        .order_by(APUPlantillaUso.fecha_uso.desc(), APUPlantillaUso.id.desc())
        .all()
    )


@router.get("/{apu_id}", response_model=APUOut)
def obtener_apu(apu_id: int, db: Session = Depends(get_db)):
    apu = db.query(APU).options(joinedload(APU.items)).filter(APU.id == apu_id).first()
    if not apu:
        raise HTTPException(status_code=404, detail="APU no encontrado")
    return apu


@router.put("/{apu_id}", response_model=APUOut)
def actualizar_apu(apu_id: int, apu: APUUpdate, db: Session = Depends(get_db)):
    db_apu = db.query(APU).filter(APU.id == apu_id).first()
    if not db_apu:
        raise HTTPException(status_code=404, detail="APU no encontrado")
    for key, value in _normalizar_apu_data(apu.model_dump(exclude={"items"}, exclude_unset=True)).items():
        setattr(db_apu, key, value)
    if apu.items is not None:
        db.query(APUItem).filter(APUItem.apu_id == apu_id).delete()
        for item in apu.items:
            db_item = APUItem(apu_id=apu_id, **_normalizar_item_data(item.model_dump()))
            db.add(db_item)
    db.commit()
    db.refresh(db_apu)
    return db_apu

@router.patch("/{apu_id}/etiquetas", response_model=APUOut)
def actualizar_etiquetas_apu(apu_id: int, data: APUEtiquetasUpdate, db: Session = Depends(get_db)):
    db_apu = db.query(APU).filter(APU.id == apu_id).first()
    if not db_apu:
        raise HTTPException(status_code=404, detail="APU no encontrado")
    db_apu.etiquetas = _normalizar_etiquetas(data.etiquetas)
    db.commit()
    db.refresh(db_apu)
    return db_apu

@router.delete("/{apu_id}")
def eliminar_apu(apu_id: int, db: Session = Depends(get_db)):
    db_apu = db.query(APU).filter(APU.id == apu_id).first()
    if not db_apu:
        raise HTTPException(status_code=404, detail="APU no encontrado")
    db.delete(db_apu)
    db.commit()
    return {"ok": True}



@router.get("/{apu_id}/costo")
def obtener_costo_apu(apu_id: int, db: Session = Depends(get_db)):
    """
    Calcula y devuelve el precio unitario total del APU según SERCOP:
    - Equipos/MO: costo = cantidad × precio_recurso × rendimiento
    - Materiales/Transporte: costo = cantidad × precio_recurso
    - Herramienta menor = 5% subtotal MO (ya incluida en items como es_herramienta_menor)
    """
    apu = (
        db.query(APU)
        .options(joinedload(APU.items).joinedload(APUItem.recurso))
        .filter(APU.id == apu_id)
        .first()
    )
    if not apu:
        raise HTTPException(status_code=404, detail="APU no encontrado")

    costo = calcular_costo_apu(apu)

    return {
        "apu_id": apu_id,
        "nombre": apu.nombre,
        "unidad": apu.unidad,
        "rendimiento": _r4(apu.rendimiento),
        **costo,
    }
