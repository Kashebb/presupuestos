from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.apu import APU
from app.models.presupuesto import NodoPresupuesto, Proyecto
from app.models.recurso import Recurso

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _count(query):
    return query.scalar() or 0


@router.get("/resumen")
def obtener_resumen(db: Session = Depends(get_db)):
    recursos_total = _count(db.query(func.count(Recurso.id)))
    recursos_activos = _count(db.query(func.count(Recurso.id)).filter(Recurso.activo.is_(True)))
    recursos_piloto = _count(
        db.query(func.count(Recurso.id)).filter(
            Recurso.observacion.ilike("%PILOTO_NO_VALIDADO%")
        )
    )

    apus_total = _count(db.query(func.count(APU.id)))
    apus_revision_costo = _count(
        db.query(func.count(APU.id)).filter(
            APU.observacion.ilike("%COSTO_NO_COINCIDE_CON_MAESTRO%")
        )
    )
    apus_ok = max(apus_total - apus_revision_costo, 0)

    proyectos_total = _count(db.query(func.count(Proyecto.id)))
    rubros_total = _count(
        db.query(func.count(NodoPresupuesto.id)).filter(NodoPresupuesto.tipo == "RUBRO")
    )
    rubros_vinculados = _count(
        db.query(func.count(NodoPresupuesto.id)).filter(
            NodoPresupuesto.tipo == "RUBRO",
            NodoPresupuesto.tipo_rubro == "VINCULADO",
        )
    )
    rubros_sin_apu = _count(
        db.query(func.count(NodoPresupuesto.id)).filter(
            NodoPresupuesto.tipo == "RUBRO",
            NodoPresupuesto.observaciones == "SIN_APU",
        )
    )
    rubros_pendientes = max(rubros_total - rubros_vinculados - rubros_sin_apu, 0)

    proyectos = db.query(Proyecto).order_by(Proyecto.fecha_creacion.desc()).all()
    proyectos_resumen = []
    for proyecto in proyectos:
        rubros_q = db.query(NodoPresupuesto).filter(
            NodoPresupuesto.proyecto_id == proyecto.id,
            NodoPresupuesto.tipo == "RUBRO",
        )
        total = rubros_q.count()
        vinculados = rubros_q.filter(NodoPresupuesto.tipo_rubro == "VINCULADO").count()
        sin_apu = rubros_q.filter(NodoPresupuesto.observaciones == "SIN_APU").count()
        pendientes = max(total - vinculados - sin_apu, 0)
        total_ref = (
            db.query(
                func.sum(
                    (func.coalesce(NodoPresupuesto.metrado, 0))
                    * (func.coalesce(NodoPresupuesto.precio_unitario_ref, 0))
                )
            )
            .filter(
                NodoPresupuesto.proyecto_id == proyecto.id,
                NodoPresupuesto.tipo == "RUBRO",
            )
            .scalar()
            or 0
        )

        proyectos_resumen.append(
            {
                "id": proyecto.id,
                "codigo": proyecto.codigo,
                "nombre": proyecto.nombre,
                "estado": proyecto.estado,
                "rubros_total": total,
                "rubros_vinculados": vinculados,
                "rubros_pendientes": pendientes,
                "rubros_sin_apu": sin_apu,
                "avance_vinculacion": round((vinculados / total) * 100, 2)
                if total
                else 0,
                "total_referencial": round(total_ref, 2),
            }
        )

    return {
        "recursos": {
            "total": recursos_total,
            "activos": recursos_activos,
            "piloto_no_validado": recursos_piloto,
        },
        "apus": {
            "total": apus_total,
            "ok": apus_ok,
            "revisar_costo": apus_revision_costo,
        },
        "presupuestos": {
            "proyectos": proyectos_total,
            "rubros_total": rubros_total,
            "rubros_vinculados": rubros_vinculados,
            "rubros_pendientes": rubros_pendientes,
            "rubros_sin_apu": rubros_sin_apu,
        },
        "proyectos": proyectos_resumen,
    }
