from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from app.db import get_db
from app.models.apu import APU, APUItem
from app.schemas.apu import APUCreate, APUUpdate, APUOut

router = APIRouter(prefix="/apus", tags=["apus"])

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

@router.get("/{apu_id}", response_model=APUOut)
def obtener_apu(apu_id: int, db: Session = Depends(get_db)):
    apu = db.query(APU).options(joinedload(APU.items)).filter(APU.id == apu_id).first()
    if not apu:
        raise HTTPException(status_code=404, detail="APU no encontrado")
    return apu

@router.post("/", response_model=APUOut)
def crear_apu(apu: APUCreate, db: Session = Depends(get_db)):
    db_apu = APU(**apu.model_dump(exclude={"items"}))
    db.add(db_apu)
    db.flush()
    for item in apu.items:
        db_item = APUItem(apu_id=db_apu.id, **item.model_dump())
        db.add(db_item)
    db.commit()
    db.refresh(db_apu)
    return db_apu

@router.put("/{apu_id}", response_model=APUOut)
def actualizar_apu(apu_id: int, apu: APUUpdate, db: Session = Depends(get_db)):
    db_apu = db.query(APU).filter(APU.id == apu_id).first()
    if not db_apu:
        raise HTTPException(status_code=404, detail="APU no encontrado")
    for key, value in apu.model_dump(exclude={"items"}, exclude_unset=True).items():
        setattr(db_apu, key, value)
    if apu.items is not None:
        db.query(APUItem).filter(APUItem.apu_id == apu_id).delete()
        for item in apu.items:
            db_item = APUItem(apu_id=apu_id, **item.model_dump())
            db.add(db_item)
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
    from app.models.recurso import Recurso
    from app.models.apu import APU, APUItem

    apu = db.query(APU).filter(APU.id == apu_id).first()
    if not apu:
        raise HTTPException(status_code=404, detail="APU no encontrado")

    items = db.query(APUItem).filter(APUItem.apu_id == apu_id).all()

    subtotales = {"equipo": 0.0, "mano_de_obra": 0.0, "material": 0.0, "transporte": 0.0}
    subtotal_mo = 0.0

    for item in items:
        if item.es_herramienta_menor:
            continue
        recurso = db.query(Recurso).filter(Recurso.id == item.recurso_id).first()
        if not recurso:
            continue
        precio = recurso.precio_unitario or 0.0
        cat = item.categoria

        if cat in ("equipo", "mano_de_obra"):
            costo = item.cantidad * precio * apu.rendimiento
        else:
            costo = item.cantidad * precio

        subtotales[cat] = subtotales.get(cat, 0.0) + costo
        if cat == "mano_de_obra":
            subtotal_mo += costo

    # Herramienta menor = 5% MO
    hm = subtotal_mo * 0.05
    subtotales["equipo"] += hm

    precio_unitario = round(sum(subtotales.values()), 6)

    return {
        "apu_id": apu_id,
        "nombre": apu.nombre,
        "unidad": apu.unidad,
        "rendimiento": apu.rendimiento,
        "precio_unitario": precio_unitario,
        "subtotales": {k: round(v, 6) for k, v in subtotales.items()},
        "herramienta_menor": round(hm, 6),
    }