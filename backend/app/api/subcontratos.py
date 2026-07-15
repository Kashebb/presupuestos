from collections import defaultdict
from datetime import datetime

from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import case, func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db import get_db
from app.models.apu import APU, APUItem
from app.models.presupuesto import NodoPresupuesto, Proyecto
from app.models.subcontrato import (
    Subcontrato,
    SubcontratoCodigoSecuencia,
    SubcontratoRubro,
    SubcontratoRubroRecursoSnapshot,
)
from app.schemas.subcontrato import (
    SubcontratoCreate,
    SubcontratoRubroConfigurar,
    SubcontratoRubroRevisar,
    SubcontratoRubrosActualizar,
    SubcontratoRubrosAsignar,
    SubcontratoUpdate,
)
from app.services.apu_costos import CategoriaAPUNoSoportadaError, redondear_4
from app.services.subcontratos import (
    ContextoCalculoSubcontratos,
    clasificar_cambios,
    configuracion_de_asignacion,
    construir_snapshot_rubro,
    es_rubro_operativo,
    persistir_snapshot,
    reemplazar_snapshot,
    resolver_configuracion,
)
from app.services.subcontratos_excel import (
    construir_libro_subcontrato,
    libro_a_bytes,
    nombre_archivo_subcontrato,
)

router = APIRouter(prefix="/presupuestos", tags=["subcontratos"])
ACTIVOS = ("BORRADOR", "CONFIRMADO")


def _subcontrato(db: Session, subcontrato_id: int) -> Subcontrato:
    item = db.get(Subcontrato, subcontrato_id)
    if not item:
        raise HTTPException(404, "Subcontrato no encontrado")
    return item


def _borrador(db: Session, subcontrato_id: int) -> Subcontrato:
    item = _subcontrato(db, subcontrato_id)
    if item.estado != "BORRADOR":
        raise HTTPException(409, "La operacion solo esta permitida en BORRADOR")
    return item


def _borrador_bloqueado(db: Session, subcontrato_id: int) -> Subcontrato:
    """Toma el bloqueo de escritura antes de consultar exclusividad (SQLite incluido)."""
    if db.bind.dialect.name == "sqlite":
        db.execute(text("BEGIN IMMEDIATE"))
        return _borrador(db, subcontrato_id)
    item = db.query(Subcontrato).filter(Subcontrato.id == subcontrato_id).with_for_update().first()
    if not item: raise HTTPException(404, "Subcontrato no encontrado")
    if item.estado != "BORRADOR": raise HTTPException(409, "La operacion solo esta permitida en BORRADOR")
    return item


def _cabecera(item: Subcontrato) -> dict:
    return {campo: getattr(item, campo) for campo in (
        "id", "proyecto_id", "codigo", "nombre", "contratista", "descripcion", "estado",
        "fecha_confirmacion", "fecha_anulacion", "fecha_creacion", "fecha_actualizacion",
    )}


def _seleccion(entrada) -> dict | None:
    return entrada.seleccion_personalizada.model_dump() if entrada.seleccion_personalizada else None


def _ids_con_hijos(db: Session, ids: list[int]) -> set[int]:
    if not ids:
        return set()
    return {row[0] for row in db.query(NodoPresupuesto.padre_id).filter(NodoPresupuesto.padre_id.in_(ids)).distinct()}


def _asignacion_resumen(a: SubcontratoRubro) -> dict:
    nodo = a.nodo_presupuesto
    apu = a.apu_snapshot
    return {
        "id": a.id, "nodo_presupuesto_id": a.nodo_presupuesto_id,
        "nodo_item_snapshot": a.nodo_item_snapshot,
        "nodo_descripcion_snapshot": a.nodo_descripcion_snapshot,
        "nodo_unidad_snapshot": a.nodo_unidad_snapshot,
        "apu_id_snapshot": a.apu_id_snapshot, "apu_codigo_snapshot": a.apu_codigo_snapshot,
        "apu_nombre_snapshot": a.apu_nombre_snapshot, "preset": a.preset,
        **configuracion_de_asignacion(a), "metrado_snapshot": a.metrado_snapshot,
        "pu_materiales_snapshot": a.pu_materiales_snapshot,
        "pu_mano_obra_snapshot": a.pu_mano_obra_snapshot,
        "pu_herramientas_snapshot": a.pu_herramientas_snapshot,
        "pu_equipos_snapshot": a.pu_equipos_snapshot,
        "pu_transporte_snapshot": a.pu_transporte_snapshot,
        "pu_seleccionado_snapshot": a.pu_seleccionado_snapshot,
        "total_snapshot": a.total_snapshot, "estado_revision": a.estado_revision,
        "vivo": None if nodo is None else {"descripcion": nodo.descripcion, "unidad": nodo.unidad, "metrado": nodo.metrado, "apu_id": nodo.apu_id},
        "apu_vivo": None if apu is None else {"id": apu.id, "codigo": apu.codigo, "nombre": apu.nombre},
    }


def _crear_con_codigo(db: Session, proyecto_id: int, datos: SubcontratoCreate) -> Subcontrato:
    secuencia = db.get(SubcontratoCodigoSecuencia, proyecto_id)
    if secuencia is None:
        secuencia = SubcontratoCodigoSecuencia(proyecto_id=proyecto_id, ultimo_numero=0)
        db.add(secuencia)
        db.flush()
    for _ in range(20):
        secuencia.ultimo_numero += 1
        db.flush()  # reserva fuera del savepoint; una colision no devuelve el numero
        codigo = f"SC-{secuencia.ultimo_numero:03d}"
        try:
            with db.begin_nested():
                item = Subcontrato(proyecto_id=proyecto_id, codigo=codigo, **datos.model_dump())
                db.add(item)
                db.flush()
            return item
        except IntegrityError:
            continue
    raise HTTPException(409, "No fue posible reservar un codigo unico")


@router.get("/proyectos/{proyecto_id}/subcontratos")
def listar(proyecto_id: int, db: Session = Depends(get_db)):
    if not db.get(Proyecto, proyecto_id):
        raise HTTPException(404, "Proyecto no encontrado")
    q = (db.query(
        Subcontrato,
        func.count(SubcontratoRubro.id), func.coalesce(func.sum(SubcontratoRubro.total_snapshot), 0),
        func.sum(case((SubcontratoRubro.estado_revision == "ACTUALIZADO", 1), else_=0)),
        func.sum(case((SubcontratoRubro.estado_revision == "DESACTUALIZADO", 1), else_=0)),
        func.sum(case((SubcontratoRubro.estado_revision == "PENDIENTE_REVISION", 1), else_=0)),
        func.sum(case((SubcontratoRubro.estado_revision == "ERROR", 1), else_=0)),
    ).outerjoin(SubcontratoRubro).filter(Subcontrato.proyecto_id == proyecto_id)
       .group_by(Subcontrato.id).order_by(Subcontrato.fecha_actualizacion.desc()))
    salida = []
    for s, cantidad, total, act, des, pen, err in q:
        salida.append({**_cabecera(s), "cantidad_rubros": cantidad, "total_snapshot": redondear_4(total),
                       "conteo_revision": {"ACTUALIZADO": act or 0, "DESACTUALIZADO": des or 0,
                                            "PENDIENTE_REVISION": pen or 0, "ERROR": err or 0}})
    return salida


@router.post("/proyectos/{proyecto_id}/subcontratos", status_code=201)
def crear(proyecto_id: int, datos: SubcontratoCreate, db: Session = Depends(get_db)):
    if not db.get(Proyecto, proyecto_id):
        raise HTTPException(404, "Proyecto no encontrado")
    try:
        item = _crear_con_codigo(db, proyecto_id, datos)
        db.commit(); db.refresh(item)
        return _cabecera(item)
    except Exception:
        db.rollback(); raise


@router.get("/subcontratos/{subcontrato_id}")
def detalle(subcontrato_id: int, db: Session = Depends(get_db)):
    item = (db.query(Subcontrato).options(selectinload(Subcontrato.rubros).joinedload(SubcontratoRubro.nodo_presupuesto),
                                          selectinload(Subcontrato.rubros).joinedload(SubcontratoRubro.apu_snapshot))
            .filter(Subcontrato.id == subcontrato_id).first())
    if not item: raise HTTPException(404, "Subcontrato no encontrado")
    return {**_cabecera(item), "rubros": [_asignacion_resumen(a) for a in item.rubros]}


@router.get("/subcontratos/{subcontrato_id}/exportar.xlsx")
def exportar_excel(subcontrato_id: int, db: Session = Depends(get_db)):
    item = (db.query(Subcontrato)
        .options(selectinload(Subcontrato.rubros).selectinload(SubcontratoRubro.recursos_snapshot),
                 joinedload(Subcontrato.proyecto))
        .filter(Subcontrato.id == subcontrato_id).first())
    if not item:
        raise HTTPException(404, "Subcontrato no encontrado")
    libro = construir_libro_subcontrato(item, item.proyecto, item.rubros)
    contenido = libro_a_bytes(libro)
    nombre = nombre_archivo_subcontrato(item.codigo, item.nombre)
    return StreamingResponse(
        BytesIO(contenido),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


@router.patch("/subcontratos/{subcontrato_id}")
def editar(subcontrato_id: int, datos: SubcontratoUpdate, db: Session = Depends(get_db)):
    item = _borrador(db, subcontrato_id)
    for campo, valor in datos.model_dump(exclude_unset=True).items(): setattr(item, campo, valor)
    db.commit(); db.refresh(item)
    return _cabecera(item)


@router.delete("/subcontratos/{subcontrato_id}", status_code=204)
def eliminar(subcontrato_id: int, db: Session = Depends(get_db)):
    item = _borrador(db, subcontrato_id)
    db.delete(item); db.commit()


@router.post("/subcontratos/{subcontrato_id}/rubros/asignar")
def asignar(subcontrato_id: int, datos: SubcontratoRubrosAsignar, db: Session = Depends(get_db)):
    sub = _borrador_bloqueado(db, subcontrato_id)
    ids = list(dict.fromkeys(datos.nodo_ids)); seleccion = _seleccion(datos)
    try: resolver_configuracion(datos.preset.value, seleccion)
    except ValueError as exc:
        return {"resultados": [{"nodo_id": i, "resultado": "configuracion_invalida", "detalle": str(exc)} for i in ids]}
    nodos = (db.query(NodoPresupuesto).options(joinedload(NodoPresupuesto.apu).joinedload(APU.items).joinedload(APUItem.recurso))
             .filter(NodoPresupuesto.id.in_(ids)).all())
    por_id = {n.id: n for n in nodos}; con_hijos = _ids_con_hijos(db, ids)
    bloqueos = (db.query(SubcontratoRubro.nodo_presupuesto_id, Subcontrato.id, Subcontrato.codigo, Subcontrato.nombre)
                .join(Subcontrato).filter(SubcontratoRubro.nodo_presupuesto_id.in_(ids), Subcontrato.estado.in_(ACTIVOS)).all())
    bloqueos = {r[0]: {"id": r[1], "codigo": r[2], "nombre": r[3]} for r in bloqueos}
    contexto = ContextoCalculoSubcontratos(); resultados = []
    for nodo_id in ids:
        nodo = por_id.get(nodo_id)
        if nodo is None: resultado = "error"; detalle = "Nodo no encontrado"
        elif nodo.proyecto_id != sub.proyecto_id: resultado = "proyecto_incorrecto"; detalle = "El nodo pertenece a otro proyecto"
        elif not es_rubro_operativo(nodo, con_hijos): resultado = "no_operativo"; detalle = "El nodo no es un rubro operativo"
        elif nodo.apu_id is None or nodo.apu is None: resultado = "sin_apu"; detalle = "El rubro no tiene APU vigente"
        elif nodo_id in bloqueos: resultado = "bloqueado"; detalle = "El rubro ya tiene una asignacion activa"
        else:
            try:
                construido = construir_snapshot_rubro(nodo, nodo.apu, datos.preset.value, seleccion, contexto)
                with db.begin_nested(): asignacion = persistir_snapshot(db, sub.id, construido)
                resultados.append({"nodo_id": nodo_id, "resultado": "asignado", "asignacion_id": asignacion.id,
                                   "advertencias": construido["advertencias"]}); continue
            except CategoriaAPUNoSoportadaError as exc: resultado = "categoria_no_soportada"; detalle = str(exc)
            except Exception as exc: resultado = "error"; detalle = str(exc)
        fila = {"nodo_id": nodo_id, "resultado": resultado, "detalle": detalle}
        if nodo_id in bloqueos: fila["subcontrato_bloqueante"] = bloqueos[nodo_id]
        resultados.append(fila)
    db.commit()
    return {"resultados": resultados, "calculos_apu": contexto.calculos_realizados}


def _asignacion_borrador(db, subcontrato_id, asignacion_id):
    sub = _borrador(db, subcontrato_id)
    a = (db.query(SubcontratoRubro).options(selectinload(SubcontratoRubro.recursos_snapshot), joinedload(SubcontratoRubro.nodo_presupuesto).joinedload(NodoPresupuesto.apu).joinedload(APU.items).joinedload(APUItem.recurso))
         .filter(SubcontratoRubro.id == asignacion_id, SubcontratoRubro.subcontrato_id == sub.id).first())
    if not a: raise HTTPException(404, "Asignacion no encontrada")
    return sub, a


@router.patch("/subcontratos/{subcontrato_id}/rubros/{asignacion_id}")
def configurar(subcontrato_id: int, asignacion_id: int, datos: SubcontratoRubroConfigurar, db: Session = Depends(get_db)):
    _, a = _asignacion_borrador(db, subcontrato_id, asignacion_id)
    if not a.nodo_presupuesto or not a.nodo_presupuesto.apu: raise HTTPException(409, "El rubro no tiene APU vigente")
    construido = construir_snapshot_rubro(a.nodo_presupuesto, a.nodo_presupuesto.apu, datos.preset.value, _seleccion(datos))
    with db.begin_nested(): reemplazar_snapshot(db, a, construido)
    db.commit(); return _asignacion_resumen(a)


@router.delete("/subcontratos/{subcontrato_id}/rubros/{asignacion_id}", status_code=204)
def retirar(subcontrato_id: int, asignacion_id: int, db: Session = Depends(get_db)):
    _, a = _asignacion_borrador(db, subcontrato_id, asignacion_id)
    db.delete(a); db.commit()


def _verificar(db: Session, sub: Subcontrato):
    asignaciones = (db.query(SubcontratoRubro).options(selectinload(SubcontratoRubro.recursos_snapshot),
        joinedload(SubcontratoRubro.nodo_presupuesto).joinedload(NodoPresupuesto.apu).joinedload(APU.items).joinedload(APUItem.recurso))
        .filter(SubcontratoRubro.subcontrato_id == sub.id).all())
    ids = [a.nodo_presupuesto_id for a in asignaciones if a.nodo_presupuesto_id]; con_hijos = _ids_con_hijos(db, ids)
    contexto = ContextoCalculoSubcontratos(); salida = []
    for a in asignaciones:
        nodo = a.nodo_presupuesto
        try:
            resultado = clasificar_cambios(a, a.recursos_snapshot, nodo, nodo.apu if nodo else None,
                es_rubro_operativo=bool(nodo and es_rubro_operativo(nodo, con_hijos)), contexto=contexto)
        except CategoriaAPUNoSoportadaError as exc:
            resultado = {"estado": "ERROR", "motivos": ["CATEGORIA_NO_SOPORTADA"], "advertencias": [{"detalle": str(exc)}]}
        a.estado_revision = resultado["estado"]
        salida.append({"asignacion_id": a.id, **resultado})
    db.flush(); return salida


@router.post("/subcontratos/{subcontrato_id}/rubros/verificar-cambios")
def verificar(subcontrato_id: int, db: Session = Depends(get_db)):
    sub = _subcontrato(db, subcontrato_id); salida = _verificar(db, sub); db.commit()
    return {"resultados": salida}


@router.post("/subcontratos/{subcontrato_id}/rubros/actualizar")
def actualizar(subcontrato_id: int, datos: SubcontratoRubrosActualizar, db: Session = Depends(get_db)):
    sub = _borrador(db, subcontrato_id); _verificar(db, sub)
    q = db.query(SubcontratoRubro).options(selectinload(SubcontratoRubro.recursos_snapshot), joinedload(SubcontratoRubro.nodo_presupuesto).joinedload(NodoPresupuesto.apu).joinedload(APU.items).joinedload(APUItem.recurso)).filter(SubcontratoRubro.subcontrato_id == sub.id)
    q = q.filter(SubcontratoRubro.estado_revision == "DESACTUALIZADO") if datos.todos_desactualizados else q.filter(SubcontratoRubro.id.in_(datos.asignacion_ids))
    contexto = ContextoCalculoSubcontratos(); resultados = []
    for a in q.all():
        nodo = a.nodo_presupuesto
        if not nodo or not nodo.apu or nodo.apu_id != a.apu_id_snapshot:
            resultados.append({"asignacion_id": a.id, "resultado": "requiere_revision"}); continue
        try:
            construido = construir_snapshot_rubro(nodo, nodo.apu, a.preset, configuracion_de_asignacion(a), contexto)
            with db.begin_nested(): reemplazar_snapshot(db, a, construido)
            resultados.append({"asignacion_id": a.id, "resultado": "actualizado"})
        except Exception as exc: resultados.append({"asignacion_id": a.id, "resultado": "error", "detalle": str(exc)})
    db.commit(); return {"resultados": resultados}


@router.post("/subcontratos/{subcontrato_id}/rubros/{asignacion_id}/revisar")
def revisar(subcontrato_id: int, asignacion_id: int, datos: SubcontratoRubroRevisar, db: Session = Depends(get_db)):
    _, a = _asignacion_borrador(db, subcontrato_id, asignacion_id)
    nodo = a.nodo_presupuesto
    if not datos.confirmar_cambio_apu: raise HTTPException(409, "Se requiere confirmacion explicita del cambio de APU")
    if not nodo or not nodo.apu: raise HTTPException(409, "El rubro no tiene un nuevo APU vigente")
    if nodo.apu_id == a.apu_id_snapshot: raise HTTPException(409, "El APU vigente no ha cambiado")
    preset = datos.preset.value if datos.preset else a.preset
    seleccion = _seleccion(datos) if datos.preset else configuracion_de_asignacion(a)
    construido = construir_snapshot_rubro(nodo, nodo.apu, preset, seleccion)
    with db.begin_nested(): reemplazar_snapshot(db, a, construido)
    db.commit(); return _asignacion_resumen(a)


@router.post("/subcontratos/{subcontrato_id}/confirmar")
def confirmar(subcontrato_id: int, db: Session = Depends(get_db)):
    sub = _borrador(db, subcontrato_id); resultados = _verificar(db, sub)
    if not resultados: db.rollback(); raise HTTPException(409, "El subcontrato no tiene rubros")
    invalidos = [r for r in resultados if r["estado"] != "ACTUALIZADO"]
    nodos_actuales = [r[0] for r in db.query(SubcontratoRubro.nodo_presupuesto_id).filter(SubcontratoRubro.subcontrato_id == sub.id)]
    duplicados = (db.query(SubcontratoRubro.id).join(Subcontrato)
        .filter(SubcontratoRubro.nodo_presupuesto_id.in_(nodos_actuales), SubcontratoRubro.subcontrato_id != sub.id,
                Subcontrato.estado.in_(ACTIVOS)).first()) if nodos_actuales else None
    if invalidos or duplicados: db.rollback(); raise HTTPException(409, {"mensaje": "Existen rubros no confirmables", "resultados": invalidos})
    sub.estado = "CONFIRMADO"; sub.fecha_confirmacion = datetime.utcnow(); db.commit()
    return _cabecera(sub)


@router.post("/subcontratos/{subcontrato_id}/reabrir")
def reabrir(subcontrato_id: int, db: Session = Depends(get_db)):
    sub = _subcontrato(db, subcontrato_id)
    if sub.estado != "CONFIRMADO": raise HTTPException(409, "Solo un CONFIRMADO puede reabrirse")
    sub.estado = "BORRADOR"  # fecha_confirmacion conserva la ultima confirmacion
    db.commit(); return _cabecera(sub)


@router.post("/subcontratos/{subcontrato_id}/anular")
def anular(subcontrato_id: int, db: Session = Depends(get_db)):
    sub = _subcontrato(db, subcontrato_id)
    if sub.estado not in ACTIVOS: raise HTTPException(409, "El subcontrato ya esta ANULADO")
    sub.estado = "ANULADO"; sub.fecha_anulacion = datetime.utcnow(); db.commit(); return _cabecera(sub)


@router.get("/proyectos/{proyecto_id}/subcontratos/distribucion")
def distribucion(proyecto_id: int, db: Session = Depends(get_db)):
    nodos = db.query(NodoPresupuesto).filter(NodoPresupuesto.proyecto_id == proyecto_id).all()
    con_hijos = _ids_con_hijos(db, [n.id for n in nodos])
    locks = (db.query(SubcontratoRubro, Subcontrato).join(Subcontrato).filter(Subcontrato.proyecto_id == proyecto_id, Subcontrato.estado.in_(ACTIVOS)).all())
    por_nodo = {a.nodo_presupuesto_id: (a, s) for a, s in locks}
    salida = []
    for n in nodos:
        if not es_rubro_operativo(n, con_hijos): continue
        lock = por_nodo.get(n.id); a, s = lock if lock else (None, None)
        razon = "SIN_APU" if not n.apu_id else ("ASIGNADO" if lock else None)
        salida.append({"nodo_id": n.id, "item": n.item, "descripcion": n.descripcion, "unidad": n.unidad,
            "metrado": n.metrado, "apu_id": n.apu_id, "asignable": razon is None, "razon_bloqueo": razon,
            "subcontrato_activo": None if not s else {"id": s.id, "codigo": s.codigo, "nombre": s.nombre, "estado": s.estado},
            "estado_revision": a.estado_revision if a else None,
            "configuracion": None if not a else {"preset": a.preset, **configuracion_de_asignacion(a)}})
    return salida


@router.get("/subcontratos/{subcontrato_id}/materiales-suministrar")
def materiales(subcontrato_id: int, db: Session = Depends(get_db)):
    _subcontrato(db, subcontrato_id)
    filas = (db.query(SubcontratoRubroRecursoSnapshot).join(SubcontratoRubro)
        .filter(SubcontratoRubro.subcontrato_id == subcontrato_id,
                SubcontratoRubroRecursoSnapshot.recurso_categoria_snapshot == "material",
                SubcontratoRubroRecursoSnapshot.incluido_subcontrato.is_(False)).all())
    grupos = {}
    for r in filas:
        clave = (("id", r.recurso_id, r.recurso_unidad_snapshot) if r.recurso_id is not None else
                 ("texto", (r.recurso_codigo_snapshot or "").strip().lower(), " ".join(r.recurso_descripcion_snapshot.lower().split()), r.recurso_unidad_snapshot))
        g = grupos.setdefault(clave, {"codigo": r.recurso_codigo_snapshot, "descripcion": r.recurso_descripcion_snapshot,
            "unidad": r.recurso_unidad_snapshot, "cantidad_total": 0.0, "rubros": set()})
        g["cantidad_total"] += r.cantidad_total_snapshot; g["rubros"].add(r.subcontrato_rubro_id)
    return [{**{k: v for k, v in g.items() if k != "rubros"}, "cantidad_total": redondear_4(g["cantidad_total"]),
             "cantidad_rubros_origen": len(g["rubros"])} for g in grupos.values()]


@router.get("/subcontratos/{subcontrato_id}/resumen")
def resumen(subcontrato_id: int, db: Session = Depends(get_db)):
    _subcontrato(db, subcontrato_id)
    filas = db.query(SubcontratoRubro).filter(SubcontratoRubro.subcontrato_id == subcontrato_id).all()
    presets = defaultdict(int); estados = defaultdict(int); componentes = defaultdict(float)
    for a in filas:
        presets[a.preset] += 1; estados[a.estado_revision] += 1
        for campo in ("pu_materiales_snapshot", "pu_mano_obra_snapshot", "pu_herramientas_snapshot", "pu_equipos_snapshot", "pu_transporte_snapshot"):
            componentes[campo] += getattr(a, campo) * a.metrado_snapshot
    mats = materiales(subcontrato_id, db)
    return {"cantidad_rubros": len(filas), "total": redondear_4(sum(a.total_snapshot for a in filas)),
        "conteo_preset": dict(presets), "conteo_revision": dict(estados),
        "componentes_monetarios": {k: redondear_4(v) for k, v in componentes.items()},
        "cantidad_materiales_suministrar": redondear_4(sum(m["cantidad_total"] for m in mats)),
        "recursos_materiales_consolidados": len(mats)}
