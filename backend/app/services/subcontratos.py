from dataclasses import dataclass, field
from typing import Any

from app.services.apu_costos import (
    CATEGORIAS_APU_SOPORTADAS,
    calcular_cantidad_fisica_item,
    desglosar_apu_normalizado,
    generar_firma_calculo,
    redondear_4,
)


def configuracion_de_asignacion(asignacion: Any) -> dict[str, bool]:
    return {campo: bool(getattr(asignacion, campo)) for campo in CAMPOS_CONFIGURACION}


def es_rubro_operativo(nodo: Any, ids_con_hijos: set[int]) -> bool:
    activo = bool(nodo.activo_como_rubro) if nodo.activo_como_rubro is not None else nodo.tipo == "RUBRO"
    return activo and nodo.id not in ids_con_hijos


def persistir_snapshot(db: Any, subcontrato_id: int, construido: dict[str, Any]):
    """Persiste una asignacion y todos sus recursos en el savepoint/transaccion vigente."""
    from app.models.subcontrato import SubcontratoRubro, SubcontratoRubroRecursoSnapshot

    asignacion = SubcontratoRubro(subcontrato_id=subcontrato_id, **construido["asignacion"])
    asignacion.recursos_snapshot = [
        SubcontratoRubroRecursoSnapshot(**recurso) for recurso in construido["recursos"]
    ]
    db.add(asignacion)
    db.flush()
    return asignacion


def reemplazar_snapshot(db: Any, asignacion: Any, construido: dict[str, Any]):
    """Reemplaza escalares y recursos como una sola unidad transaccional."""
    from app.models.subcontrato import SubcontratoRubroRecursoSnapshot

    for campo, valor in construido["asignacion"].items():
        setattr(asignacion, campo, valor)
    asignacion.recursos_snapshot = [
        SubcontratoRubroRecursoSnapshot(**recurso) for recurso in construido["recursos"]
    ]
    db.flush()
    return asignacion


CONFIGURACIONES_PRESET = {
    "COMPLETO": {
        "incluye_materiales": True,
        "incluye_mano_obra": True,
        "incluye_equipos": True,
        "incluye_transporte": True,
    },
    "SOLO_MATERIALES": {
        "incluye_materiales": True,
        "incluye_mano_obra": False,
        "incluye_equipos": False,
        "incluye_transporte": False,
    },
    "SOLO_MANO_OBRA": {
        "incluye_materiales": False,
        "incluye_mano_obra": True,
        "incluye_equipos": False,
        "incluye_transporte": False,
    },
    "MANO_OBRA_EQUIPOS": {
        "incluye_materiales": False,
        "incluye_mano_obra": True,
        "incluye_equipos": True,
        "incluye_transporte": False,
    },
    "MATERIALES_TRANSPORTE": {
        "incluye_materiales": True,
        "incluye_mano_obra": False,
        "incluye_equipos": False,
        "incluye_transporte": True,
    },
}
CAMPOS_CONFIGURACION = (
    "incluye_materiales",
    "incluye_mano_obra",
    "incluye_equipos",
    "incluye_transporte",
)


@dataclass
class ContextoCalculoSubcontratos:
    resultados_por_apu: dict[int, dict[str, Any]] = field(default_factory=dict)
    calculos_realizados: int = 0

    def obtener(self, apu: Any) -> dict[str, Any]:
        if apu.id not in self.resultados_por_apu:
            self.resultados_por_apu[apu.id] = {
                "desglose": desglosar_apu_normalizado(apu),
                "firma_calculo": generar_firma_calculo(apu),
            }
            self.calculos_realizados += 1
        return self.resultados_por_apu[apu.id]


def validar_configuracion(configuracion: dict[str, Any]) -> dict[str, bool]:
    normalizada = {campo: bool(configuracion.get(campo, False)) for campo in CAMPOS_CONFIGURACION}
    if not any(normalizada.values()):
        raise ValueError("Debe seleccionarse al menos una categoría")
    return normalizada


def resolver_configuracion(
    preset: str,
    seleccion_personalizada: dict[str, Any] | None = None,
) -> dict[str, bool]:
    preset_normalizado = str(preset or "").strip().upper()
    if preset_normalizado == "PERSONALIZADO":
        return validar_configuracion(seleccion_personalizada or {})
    if preset_normalizado not in CONFIGURACIONES_PRESET:
        raise ValueError(f"Preset no soportado: {preset}")
    if seleccion_personalizada is not None:
        seleccion = validar_configuracion(seleccion_personalizada)
        if seleccion != CONFIGURACIONES_PRESET[preset_normalizado]:
            raise ValueError("La selección de categorías no coincide con el preset")
    return dict(CONFIGURACIONES_PRESET[preset_normalizado])


def calcular_pu_seleccionado(desglose: dict[str, Any], configuracion: dict[str, bool]) -> float:
    configuracion = validar_configuracion(configuracion)
    componentes = []
    if configuracion["incluye_materiales"]:
        componentes.append(desglose["materiales"])
    if configuracion["incluye_mano_obra"]:
        componentes.extend((desglose["mano_de_obra"], desglose["herramientas_menores"]))
    if configuracion["incluye_equipos"]:
        componentes.append(desglose["equipos_sin_herramientas"])
    if configuracion["incluye_transporte"]:
        componentes.append(desglose["transporte"])
    return redondear_4(sum(componentes))


def generar_recursos_snapshot(
    apu: Any,
    metrado: Any,
    configuracion: dict[str, bool],
) -> list[dict[str, Any]]:
    configuracion = validar_configuracion(configuracion)
    incluidos_por_categoria = {
        "material": configuracion["incluye_materiales"],
        "mano_de_obra": configuracion["incluye_mano_obra"],
        "equipo": configuracion["incluye_equipos"],
        "transporte": configuracion["incluye_transporte"],
    }
    recursos = []
    for item in apu.items:
        if item.es_herramienta_menor or not item.recurso:
            continue
        categoria = str(item.categoria or "").strip().lower()
        if categoria not in CATEGORIAS_APU_SOPORTADAS:
            continue
        recurso = item.recurso
        cantidades = calcular_cantidad_fisica_item(item, apu.rendimiento, metrado)
        recursos.append(
            {
                "recurso_id": getattr(recurso, "id", None),
                "recurso_codigo_snapshot": getattr(recurso, "codigo", None),
                "recurso_descripcion_snapshot": recurso.descripcion,
                "recurso_unidad_snapshot": getattr(recurso, "unidad", None),
                "recurso_categoria_snapshot": categoria,
                "cantidad_unitaria_snapshot": cantidades["cantidad_unitaria"],
                "metrado_snapshot": cantidades["metrado"],
                "cantidad_total_snapshot": cantidades["cantidad_total"],
                "incluido_subcontrato": incluidos_por_categoria[categoria],
            }
        )
    return recursos


def construir_snapshot_rubro(
    nodo: Any,
    apu: Any,
    preset: str,
    seleccion_personalizada: dict[str, Any] | None = None,
    contexto: ContextoCalculoSubcontratos | None = None,
) -> dict[str, Any]:
    """Construye asignación y recursos completos en memoria; no escribe ni hace commit."""

    if apu is None:
        raise ValueError("El rubro debe tener un APU para generar el snapshot")
    configuracion = resolver_configuracion(preset, seleccion_personalizada)
    contexto = contexto or ContextoCalculoSubcontratos()
    calculo = contexto.obtener(apu)
    desglose = calculo["desglose"]
    metrado = redondear_4(getattr(nodo, "metrado", 0.0))
    pu_seleccionado = calcular_pu_seleccionado(desglose, configuracion)

    asignacion = {
        "nodo_presupuesto_id": getattr(nodo, "id", None),
        "apu_id_snapshot": getattr(apu, "id", None),
        "nodo_item_snapshot": getattr(nodo, "item", None),
        "nodo_descripcion_snapshot": nodo.descripcion,
        "nodo_unidad_snapshot": getattr(nodo, "unidad", None),
        "apu_codigo_snapshot": getattr(apu, "codigo", None),
        "apu_nombre_snapshot": apu.nombre,
        "preset": str(preset).strip().upper(),
        **configuracion,
        "metrado_snapshot": metrado,
        "pu_materiales_snapshot": desglose["materiales"],
        "pu_mano_obra_snapshot": desglose["mano_de_obra"],
        "pu_herramientas_snapshot": desglose["herramientas_menores"],
        "pu_equipos_snapshot": desglose["equipos_sin_herramientas"],
        "pu_transporte_snapshot": desglose["transporte"],
        "pu_seleccionado_snapshot": pu_seleccionado,
        "total_snapshot": redondear_4(metrado * pu_seleccionado),
        "firma_calculo": calculo["firma_calculo"],
        "estado_revision": "ACTUALIZADO",
    }
    recursos = generar_recursos_snapshot(apu, metrado, configuracion)
    return {
        "asignacion": asignacion,
        "recursos": recursos,
        "advertencias": [
            {
                "codigo": "CATEGORIA_NO_SOPORTADA_SIN_COSTO",
                "categoria": categoria,
            }
            for categoria in desglose["categorias_no_soportadas_sin_costo"]
        ],
    }


def _valor(objeto: Any, campo: str, default: Any = None) -> Any:
    if isinstance(objeto, dict):
        return objeto.get(campo, default)
    return getattr(objeto, campo, default)


def _configuracion_snapshot(snapshot: Any) -> dict[str, bool]:
    return {campo: bool(_valor(snapshot, campo, False)) for campo in CAMPOS_CONFIGURACION}


def _canonico_fisico(items: list[Any]) -> list[tuple[Any, ...]]:
    canonico = []
    for item in items:
        canonico.append(
            (
                _valor(item, "recurso_id"),
                _valor(item, "recurso_categoria_snapshot"),
                _valor(item, "recurso_unidad_snapshot"),
                redondear_4(_valor(item, "cantidad_unitaria_snapshot")),
                redondear_4(_valor(item, "cantidad_total_snapshot")),
                bool(_valor(item, "incluido_subcontrato")),
            )
        )
    return sorted(canonico, key=lambda item: tuple("" if value is None else str(value) for value in item))


def clasificar_cambios(
    snapshot: Any,
    recursos_snapshot: list[Any],
    nodo_actual: Any | None,
    apu_actual: Any | None,
    *,
    es_rubro_operativo: bool,
    contexto: ContextoCalculoSubcontratos | None = None,
) -> dict[str, Any]:
    motivos: list[str] = []
    advertencias: list[dict[str, Any]] = []
    if nodo_actual is None or not es_rubro_operativo:
        return {"estado": "ERROR", "motivos": ["RUBRO_INEXISTENTE_O_NO_OPERATIVO"], "advertencias": []}

    apu_id_snapshot = _valor(snapshot, "apu_id_snapshot")
    if apu_actual is None or getattr(nodo_actual, "apu_id", None) is None:
        return {"estado": "PENDIENTE_REVISION", "motivos": ["APU_AUSENTE"], "advertencias": []}
    if getattr(nodo_actual, "apu_id", None) != apu_id_snapshot or apu_actual.id != apu_id_snapshot:
        return {"estado": "PENDIENTE_REVISION", "motivos": ["APU_CAMBIO"], "advertencias": []}

    contexto = contexto or ContextoCalculoSubcontratos()
    calculo = contexto.obtener(apu_actual)
    if calculo["firma_calculo"] != _valor(snapshot, "firma_calculo"):
        motivos.append("FIRMA_CALCULO_CAMBIO")
    if redondear_4(nodo_actual.metrado) != redondear_4(_valor(snapshot, "metrado_snapshot")):
        motivos.append("METRADO_CAMBIO")

    configuracion = _configuracion_snapshot(snapshot)
    actuales = generar_recursos_snapshot(apu_actual, nodo_actual.metrado, configuracion)
    if _canonico_fisico(actuales) != _canonico_fisico(recursos_snapshot):
        motivos.append("RECURSOS_FISICOS_CAMBIARON")

    comparaciones_texto = (
        ("RUBRO_ITEM_CAMBIO", getattr(nodo_actual, "item", None), _valor(snapshot, "nodo_item_snapshot")),
        ("RUBRO_DESCRIPCION_CAMBIO", nodo_actual.descripcion, _valor(snapshot, "nodo_descripcion_snapshot")),
        ("RUBRO_UNIDAD_CAMBIO", getattr(nodo_actual, "unidad", None), _valor(snapshot, "nodo_unidad_snapshot")),
        ("APU_CODIGO_CAMBIO", getattr(apu_actual, "codigo", None), _valor(snapshot, "apu_codigo_snapshot")),
        ("APU_NOMBRE_CAMBIO", apu_actual.nombre, _valor(snapshot, "apu_nombre_snapshot")),
    )
    for codigo, actual, aceptado in comparaciones_texto:
        if actual != aceptado:
            advertencias.append({"codigo": codigo, "actual": actual, "aceptado": aceptado})

    actuales_por_id = {item["recurso_id"]: item for item in actuales if item["recurso_id"] is not None}
    for aceptado in recursos_snapshot:
        recurso_id = _valor(aceptado, "recurso_id")
        actual = actuales_por_id.get(recurso_id)
        if not actual:
            continue
        for campo, codigo in (
            ("recurso_codigo_snapshot", "RECURSO_CODIGO_CAMBIO"),
            ("recurso_descripcion_snapshot", "RECURSO_DESCRIPCION_CAMBIO"),
        ):
            if actual[campo] != _valor(aceptado, campo):
                advertencias.append(
                    {"codigo": codigo, "recurso_id": recurso_id, "actual": actual[campo], "aceptado": _valor(aceptado, campo)}
                )

    return {
        "estado": "DESACTUALIZADO" if motivos else "ACTUALIZADO",
        "motivos": motivos,
        "advertencias": advertencias,
    }
