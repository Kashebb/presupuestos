import hashlib
import json
from typing import Any, Iterable


CATEGORIAS_APU_SOPORTADAS = ("material", "mano_de_obra", "equipo", "transporte")
PORCENTAJE_HERRAMIENTA_MENOR = 0.05
VERSION_REGLA_HERRAMIENTA_MENOR = 1
VERSION_FIRMA_CALCULO = 1


class CategoriaAPUNoSoportadaError(ValueError):
    def __init__(self, categorias: list[dict[str, Any]]):
        self.categorias = categorias
        nombres = ", ".join(item["categoria"] for item in categorias)
        super().__init__(f"El APU contiene categorías no soportadas con costo efectivo: {nombres}")


def redondear_4(value: Any) -> float:
    return round(float(value or 0.0), 4)


def decimal_4_texto(value: Any) -> str:
    return f"{redondear_4(value):.4f}"


def _costo_item(item: Any, rendimiento: float) -> float:
    precio = redondear_4(item.recurso.precio_unitario)
    cantidad = redondear_4(item.cantidad)
    costo = redondear_4(cantidad * precio)
    if item.categoria in ("equipo", "mano_de_obra"):
        costo = redondear_4(costo * rendimiento)
    return costo


def calcular_costo_apu_compat(apu: Any) -> dict[str, Any]:
    """Reproduce exactamente el contrato histórico de ``calcular_costo_apu``.

    En esta salida ``subtotales.equipo`` conserva herramientas menores incluidas.
    Las categorías adicionales mantienen el comportamiento dinámico anterior.
    """

    subtotales = {"equipo": 0.0, "mano_de_obra": 0.0, "material": 0.0, "transporte": 0.0}
    subtotal_mo = 0.0
    rendimiento = redondear_4(apu.rendimiento)

    for item in apu.items:
        if item.es_herramienta_menor or not item.recurso:
            continue
        costo = _costo_item(item, rendimiento)
        categoria = item.categoria
        subtotales[categoria] = redondear_4(subtotales.get(categoria, 0.0) + costo)
        if categoria == "mano_de_obra":
            subtotal_mo = redondear_4(subtotal_mo + costo)

    herramienta_menor = redondear_4(subtotal_mo * PORCENTAJE_HERRAMIENTA_MENOR)
    subtotales["equipo"] = redondear_4(subtotales["equipo"] + herramienta_menor)
    precio_unitario = redondear_4(sum(subtotales.values()))
    return {
        "precio_unitario": precio_unitario,
        "subtotales": {categoria: redondear_4(valor) for categoria, valor in subtotales.items()},
        "herramienta_menor": herramienta_menor,
    }


def desglosar_apu_normalizado(apu: Any) -> dict[str, Any]:
    """Calcula el desglose interno de Subcontratos sin mezclar equipo y H.M."""

    subtotales = {categoria: 0.0 for categoria in CATEGORIAS_APU_SOPORTADAS}
    no_soportadas: dict[str, float] = {}
    rendimiento = redondear_4(apu.rendimiento)

    for item in apu.items:
        if item.es_herramienta_menor or not item.recurso:
            continue
        costo = _costo_item(item, rendimiento)
        categoria = str(item.categoria or "").strip().lower()
        if categoria not in CATEGORIAS_APU_SOPORTADAS:
            no_soportadas[categoria or "sin_categoria"] = redondear_4(
                no_soportadas.get(categoria or "sin_categoria", 0.0) + costo
            )
            continue
        subtotales[categoria] = redondear_4(subtotales[categoria] + costo)

    bloqueantes = [
        {"categoria": categoria, "costo_efectivo": redondear_4(costo)}
        for categoria, costo in sorted(no_soportadas.items())
        if redondear_4(costo) != 0.0
    ]
    if bloqueantes:
        raise CategoriaAPUNoSoportadaError(bloqueantes)

    herramientas = redondear_4(subtotales["mano_de_obra"] * PORCENTAJE_HERRAMIENTA_MENOR)
    resultado = {
        "materiales": redondear_4(subtotales["material"]),
        "mano_de_obra": redondear_4(subtotales["mano_de_obra"]),
        "herramientas_menores": herramientas,
        "equipos_sin_herramientas": redondear_4(subtotales["equipo"]),
        "transporte": redondear_4(subtotales["transporte"]),
        "categorias_no_soportadas_sin_costo": sorted(no_soportadas),
    }
    resultado["pu_completo"] = redondear_4(
        resultado["materiales"]
        + resultado["mano_de_obra"]
        + resultado["herramientas_menores"]
        + resultado["equipos_sin_herramientas"]
        + resultado["transporte"]
    )
    return resultado


def calcular_cantidad_fisica_item(item: Any, rendimiento: Any, metrado: Any) -> dict[str, float]:
    """Comparte la fórmula física vigente de Uso de recursos, sin consultar DB."""

    factor = float(rendimiento or 0.0) if item.categoria in ("mano_de_obra", "equipo") else 1.0
    cantidad_item = float(item.cantidad or 0.0)
    metrado_valor = float(metrado or 0.0)
    return {
        "cantidad_unitaria": redondear_4(cantidad_item * factor),
        "metrado": redondear_4(metrado_valor),
        # Mantiene el orden de operaciones del endpoint vigente.
        "cantidad_total": redondear_4(metrado_valor * cantidad_item * factor),
    }


def construir_payload_firma(apu: Any) -> dict[str, Any]:
    rendimiento = redondear_4(apu.rendimiento)
    items = []
    for item in apu.items:
        if item.es_herramienta_menor or not item.recurso:
            continue
        recurso = item.recurso
        items.append(
            {
                "cantidad": decimal_4_texto(item.cantidad),
                "categoria": str(item.categoria or "").strip().lower(),
                "recurso_base_id": getattr(recurso, "recurso_base_id", None),
                "recurso_id": getattr(recurso, "id", None),
                "precio_unitario": decimal_4_texto(recurso.precio_unitario),
            }
        )

    items.sort(
        key=lambda item: (
            item["categoria"],
            item["recurso_base_id"] if item["recurso_base_id"] is not None else -1,
            item["recurso_id"] if item["recurso_id"] is not None else -1,
            item["cantidad"],
            item["precio_unitario"],
        )
    )
    return {
        "apu_id": getattr(apu, "id", None),
        "items": items,
        "regla_herramienta_menor": {
            "base": "mano_de_obra",
            "porcentaje": decimal_4_texto(PORCENTAJE_HERRAMIENTA_MENOR),
            "version": VERSION_REGLA_HERRAMIENTA_MENOR,
        },
        "rendimiento": decimal_4_texto(rendimiento),
        "version_firma": VERSION_FIRMA_CALCULO,
    }


def serializar_payload_canonico(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def generar_firma_calculo(apu: Any) -> str:
    canonico = serializar_payload_canonico(construir_payload_firma(apu))
    return hashlib.sha256(canonico.encode("utf-8")).hexdigest()


def calcular_apus_unicos(apus: Iterable[Any]) -> dict[int, dict[str, Any]]:
    """Calcula una sola vez cada APU de un lote ya precargado por el consumidor."""

    resultados: dict[int, dict[str, Any]] = {}
    for apu in apus:
        if apu.id in resultados:
            continue
        resultados[apu.id] = {
            "desglose": desglosar_apu_normalizado(apu),
            "firma_calculo": generar_firma_calculo(apu),
        }
    return resultados
