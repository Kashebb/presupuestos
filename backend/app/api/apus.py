import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from app.db import get_db
from app.models.apu import APU, APUItem
from app.schemas.apu import APUCreate, APUUpdate, APUOut

router = APIRouter(prefix="/apus", tags=["apus"])

CODIGO_APU_RE = re.compile(r"^(.*?)(\d+)$")


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

def calcular_costo_apu(apu: APU):
    subtotales = {"equipo": 0.0, "mano_de_obra": 0.0, "material": 0.0, "transporte": 0.0}
    subtotal_mo = 0.0

    for item in apu.items:
        if item.es_herramienta_menor:
            continue
        if not item.recurso:
            continue

        precio = item.recurso.precio_unitario or 0.0
        cat = item.categoria
        costo = item.cantidad * precio

        if cat in ("equipo", "mano_de_obra"):
            costo *= apu.rendimiento

        subtotales[cat] = subtotales.get(cat, 0.0) + costo
        if cat == "mano_de_obra":
            subtotal_mo += costo

    hm = subtotal_mo * 0.05
    subtotales["equipo"] += hm
    precio_unitario = round(sum(subtotales.values()), 6)

    return {
        "precio_unitario": precio_unitario,
        "subtotales": {k: round(v, 6) for k, v in subtotales.items()},
        "herramienta_menor": round(hm, 6),
    }

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
    return [
        {
            "apu_id": apu.id,
            "codigo": apu.codigo,
            "precio_unitario": calcular_costo_apu(apu)["precio_unitario"],
            "control_costo": (
                "revisar_costo"
                if "COSTO_NO_COINCIDE_CON_MAESTRO" in (apu.observacion or "")
                else "ok"
            ),
        }
        for apu in apus
    ]

@router.get("/siguiente-codigo")
def obtener_siguiente_codigo_apu(db: Session = Depends(get_db)):
    return {"codigo": siguiente_codigo_apu(db)}

@router.get("/{apu_id}", response_model=APUOut)
def obtener_apu(apu_id: int, db: Session = Depends(get_db)):
    apu = db.query(APU).options(joinedload(APU.items)).filter(APU.id == apu_id).first()
    if not apu:
        raise HTTPException(status_code=404, detail="APU no encontrado")
    return apu

@router.post("/", response_model=APUOut)
def crear_apu(apu: APUCreate, db: Session = Depends(get_db)):
    data = apu.model_dump(exclude={"items"})
    if not data.get("codigo"):
        data["codigo"] = siguiente_codigo_apu(db)
    db_apu = APU(**data)
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
        "rendimiento": apu.rendimiento,
        **costo,
    }
