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