from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db import get_db
from app.models.recurso import Recurso
from app.schemas.recurso import RecursoCreate, RecursoUpdate, RecursoOut

router = APIRouter(prefix="/recursos", tags=["recursos"])

@router.get("/", response_model=List[RecursoOut])
def listar_recursos(db: Session = Depends(get_db)):
    return db.query(Recurso).filter(Recurso.activo == True).all()

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