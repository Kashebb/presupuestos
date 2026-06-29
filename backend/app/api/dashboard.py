from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, aliased

from app.db import get_db
from app.models.apu import APU
from app.models.presupuesto import NodoPresupuesto, Proyecto
from app.models.recurso import Recurso

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _count(query):
    return query.scalar() or 0


def _rubros_operativos_query(db: Session):
    hijo = aliased(NodoPresupuesto)
    return (
        db.query(NodoPresupuesto)
        .outerjoin(hijo, hijo.padre_id == NodoPresupuesto.id)
        .filter(
            NodoPresupuesto.activo_como_rubro.is_(True),
            hijo.id.is_(None),
        )
    )


@router.get("/resumen")
def obtener_resumen(db: Session = Depends(get_db)):
    recursos_total = _count(db.query(func.count(Recurso.id)))
    recursos_activos = _count(db.query(func.count(Recurso.id)).filter(Recurso.activo.is_(True)))
    recursos_piloto = _count(
        db.query(func.count(Recurso.id)).filter(
            Recurso.estado_validacion.in_(["piloto", "no_aprobado"])
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
    rubros_q = _rubros_operativos_query(db)
    rubros_total = rubros_q.count()
    rubros_vinculados = rubros_q.filter(NodoPresupuesto.tipo_rubro == "VINCULADO").count()
    rubros_sin_apu = rubros_q.filter(NodoPresupuesto.observaciones == "SIN_APU").count()
    rubros_pendientes = max(rubros_total - rubros_vinculados - rubros_sin_apu, 0)

    proyectos = db.query(Proyecto).order_by(Proyecto.fecha_creacion.desc()).all()
    proyectos_resumen = []
    for proyecto in proyectos:
        rubros_q = _rubros_operativos_query(db).filter(NodoPresupuesto.proyecto_id == proyecto.id)
        total = rubros_q.count()
        vinculados = rubros_q.filter(NodoPresupuesto.tipo_rubro == "VINCULADO").count()
        sin_apu = rubros_q.filter(NodoPresupuesto.observaciones == "SIN_APU").count()
        pendientes = max(total - vinculados - sin_apu, 0)
        total_ref = (
            rubros_q.with_entities(
                func.sum(
                    (func.coalesce(NodoPresupuesto.metrado, 0))
                    * (func.coalesce(NodoPresupuesto.precio_unitario_ref, 0))
                )
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
                "avance_vinculacion": round((vinculados / total) * 100, 4)
                if total
                else 0,
                "total_referencial": round(total_ref, 4),
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
