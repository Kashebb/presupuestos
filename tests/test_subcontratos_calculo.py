import copy
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.api.apus import calcular_costo_apu
from app.services.apu_costos import (
    CategoriaAPUNoSoportadaError,
    calcular_cantidad_fisica_item,
    calcular_costo_apu_compat,
    construir_payload_firma,
    desglosar_apu_normalizado,
    generar_firma_calculo,
    redondear_4,
)
from app.services.subcontratos import (
    CONFIGURACIONES_PRESET,
    ContextoCalculoSubcontratos,
    calcular_pu_seleccionado,
    clasificar_cambios,
    construir_snapshot_rubro,
    resolver_configuracion,
)


def recurso(recurso_id, codigo, descripcion, unidad, precio, recurso_base_id=None):
    return SimpleNamespace(
        id=recurso_id,
        codigo=codigo,
        descripcion=descripcion,
        unidad=unidad,
        precio_unitario=precio,
        recurso_base_id=recurso_base_id,
    )


def item(recurso_item, categoria, cantidad, orden=0, es_herramienta_menor=False):
    return SimpleNamespace(
        recurso=recurso_item,
        recurso_id=getattr(recurso_item, "id", None),
        categoria=categoria,
        cantidad=cantidad,
        orden=orden,
        es_herramienta_menor=es_herramienta_menor,
    )


def apu_ejemplo():
    materiales = recurso(1, "MAT-001", "Cemento", "kg", 2.5)
    mano_obra = recurso(2, "MO-001", "Oficial", "h", 10.0)
    equipo = recurso(3, "EQ-001", "Mezcladora", "h", 8.0)
    transporte = recurso(4, "TR-001", "Camión", "km", 1.25)
    herramienta = recurso(5, "HM-001", "Herramienta derivada", "%", 999.0)
    return SimpleNamespace(
        id=10,
        codigo="APU-010",
        nombre="Hormigón",
        unidad="m3",
        rendimiento=1.2,
        items=[
            item(materiales, "material", 4.0, orden=1),
            item(mano_obra, "mano_de_obra", 2.0, orden=2),
            item(equipo, "equipo", 0.5, orden=3),
            item(transporte, "transporte", 3.0, orden=4),
            item(herramienta, "equipo", 1.0, orden=5, es_herramienta_menor=True),
        ],
    )


def nodo_ejemplo(apu_id=10, metrado=3.0):
    return SimpleNamespace(
        id=100,
        apu_id=apu_id,
        item="1.01",
        descripcion="Rubro hormigón",
        unidad="m3",
        metrado=metrado,
        activo_como_rubro=True,
    )


def calculo_anterior_literal(apu):
    def r4(value):
        return round(float(value or 0.0), 4)

    subtotales = {"equipo": 0.0, "mano_de_obra": 0.0, "material": 0.0, "transporte": 0.0}
    subtotal_mo = 0.0
    rendimiento = r4(apu.rendimiento)
    for item_apu in apu.items:
        if item_apu.es_herramienta_menor or not item_apu.recurso:
            continue
        precio = r4(item_apu.recurso.precio_unitario)
        cantidad = r4(item_apu.cantidad)
        categoria = item_apu.categoria
        costo = r4(cantidad * precio)
        if categoria in ("equipo", "mano_de_obra"):
            costo = r4(costo * rendimiento)
        subtotales[categoria] = r4(subtotales.get(categoria, 0.0) + costo)
        if categoria == "mano_de_obra":
            subtotal_mo = r4(subtotal_mo + costo)
    hm = r4(subtotal_mo * 0.05)
    subtotales["equipo"] = r4(subtotales["equipo"] + hm)
    return {
        "precio_unitario": r4(sum(subtotales.values())),
        "subtotales": {key: r4(value) for key, value in subtotales.items()},
        "herramienta_menor": r4(hm),
    }


class MotorCompartidoAPUTest(unittest.TestCase):
    def test_regresion_exacta_contra_implementacion_anterior(self):
        apu = apu_ejemplo()
        esperado = calculo_anterior_literal(apu)
        self.assertEqual(calcular_costo_apu_compat(apu), esperado)
        self.assertEqual(calcular_costo_apu(apu), esperado)

    def test_desglose_normalizado_no_duplica_herramientas(self):
        desglose = desglosar_apu_normalizado(apu_ejemplo())
        self.assertEqual(desglose["materiales"], 10.0)
        self.assertEqual(desglose["mano_de_obra"], 24.0)
        self.assertEqual(desglose["herramientas_menores"], 1.2)
        self.assertEqual(desglose["equipos_sin_herramientas"], 4.8)
        self.assertEqual(desglose["transporte"], 3.75)
        self.assertEqual(desglose["pu_completo"], 43.75)
        self.assertEqual(calcular_costo_apu(apu_ejemplo())["precio_unitario"], 43.75)

    def test_categoria_no_soportada_con_costo_bloquea(self):
        apu = apu_ejemplo()
        apu.items.append(item(recurso(8, "OTR-1", "Otro", "u", 3), "otros", 2))
        with self.assertRaises(CategoriaAPUNoSoportadaError) as contexto:
            desglosar_apu_normalizado(apu)
        self.assertEqual(contexto.exception.categorias, [{"categoria": "otros", "costo_efectivo": 6.0}])

    def test_categoria_no_soportada_en_cero_es_advertencia(self):
        apu = apu_ejemplo()
        apu.items.append(item(recurso(8, "OTR-0", "Otro cero", "u", 0), "otros", 2))
        desglose = desglosar_apu_normalizado(apu)
        self.assertEqual(desglose["categorias_no_soportadas_sin_costo"], ["otros"])
        self.assertEqual(desglose["pu_completo"], 43.75)

    def test_redondeo_cuatro_decimales(self):
        apu = apu_ejemplo()
        apu.rendimiento = 1.234567
        apu.items[0].cantidad = 0.333333
        apu.items[0].recurso.precio_unitario = 7.777777
        self.assertEqual(redondear_4(apu.rendimiento), 1.2346)
        self.assertEqual(calcular_costo_apu(apu), calculo_anterior_literal(apu))


class PresetsYCantidadesTest(unittest.TestCase):
    def test_cada_preset_y_pu_seleccionado(self):
        desglose = desglosar_apu_normalizado(apu_ejemplo())
        esperados = {
            "COMPLETO": 43.75,
            "SOLO_MATERIALES": 10.0,
            "SOLO_MANO_OBRA": 25.2,
            "MANO_OBRA_EQUIPOS": 30.0,
            "MATERIALES_TRANSPORTE": 13.75,
        }
        for preset, esperado in esperados.items():
            configuracion = resolver_configuracion(preset)
            self.assertEqual(configuracion, CONFIGURACIONES_PRESET[preset])
            self.assertEqual(calcular_pu_seleccionado(desglose, configuracion), esperado)

    def test_personalizado(self):
        configuracion = resolver_configuracion(
            "PERSONALIZADO",
            {"incluye_materiales": True, "incluye_equipos": True},
        )
        self.assertEqual(calcular_pu_seleccionado(desglosar_apu_normalizado(apu_ejemplo()), configuracion), 14.8)

    def test_seleccion_vacia_es_invalida(self):
        with self.assertRaises(ValueError):
            resolver_configuracion("PERSONALIZADO", {})

    def test_categoria_seleccionada_en_cero_es_valida(self):
        apu = apu_ejemplo()
        apu.items = [item for item in apu.items if item.categoria != "transporte"]
        desglose = desglosar_apu_normalizado(apu)
        configuracion = resolver_configuracion(
            "PERSONALIZADO",
            {"incluye_transporte": True},
        )
        self.assertEqual(calcular_pu_seleccionado(desglose, configuracion), 0.0)

    def test_cantidades_fisicas_por_categoria(self):
        apu = apu_ejemplo()
        material = calcular_cantidad_fisica_item(apu.items[0], apu.rendimiento, 3)
        mano_obra = calcular_cantidad_fisica_item(apu.items[1], apu.rendimiento, 3)
        equipo = calcular_cantidad_fisica_item(apu.items[2], apu.rendimiento, 3)
        transporte = calcular_cantidad_fisica_item(apu.items[3], apu.rendimiento, 3)
        self.assertEqual(material, {"cantidad_unitaria": 4.0, "metrado": 3.0, "cantidad_total": 12.0})
        self.assertEqual(mano_obra["cantidad_total"], 7.2)
        self.assertEqual(equipo["cantidad_total"], 1.8)
        self.assertEqual(transporte["cantidad_total"], 9.0)


class FirmaCanonicaTest(unittest.TestCase):
    def test_distinto_orden_misma_firma(self):
        apu = apu_ejemplo()
        firma = generar_firma_calculo(apu)
        apu.items.reverse()
        for indice, item_apu in enumerate(apu.items):
            item_apu.orden = indice + 50
        self.assertEqual(generar_firma_calculo(apu), firma)

    def test_cambios_relevantes_cambian_firma(self):
        base = apu_ejemplo()
        firma = generar_firma_calculo(base)
        mutaciones = []

        por_precio = copy.deepcopy(base)
        por_precio.items[0].recurso.precio_unitario += 1
        mutaciones.append(por_precio)
        por_cantidad = copy.deepcopy(base)
        por_cantidad.items[0].cantidad += 1
        mutaciones.append(por_cantidad)
        por_rendimiento = copy.deepcopy(base)
        por_rendimiento.rendimiento += 1
        mutaciones.append(por_rendimiento)
        por_categoria = copy.deepcopy(base)
        por_categoria.items[0].categoria = "transporte"
        mutaciones.append(por_categoria)
        por_recurso = copy.deepcopy(base)
        por_recurso.items[0].recurso.id = 99
        mutaciones.append(por_recurso)

        for cambiado in mutaciones:
            self.assertNotEqual(generar_firma_calculo(cambiado), firma)

    def test_cambios_textuales_no_cambian_firma(self):
        apu = apu_ejemplo()
        firma = generar_firma_calculo(apu)
        apu.nombre = "Nombre cambiado"
        apu.codigo = "CODIGO-NUEVO"
        apu.unidad = "otra"
        apu.items[0].recurso.descripcion = "Descripción cambiada"
        apu.items[0].recurso.codigo = "MAT-NUEVO"
        apu.items[0].orden = 999
        self.assertEqual(generar_firma_calculo(apu), firma)

    def test_payload_excluye_metrado_y_fila_hm(self):
        payload = construir_payload_firma(apu_ejemplo())
        self.assertNotIn("metrado", payload)
        self.assertEqual(len(payload["items"]), 4)
        self.assertEqual(payload["rendimiento"], "1.2000")
        self.assertEqual(payload["regla_herramienta_menor"]["porcentaje"], "0.0500")

    def test_multiplicidad_de_items_cambia_firma(self):
        apu = apu_ejemplo()
        firma = generar_firma_calculo(apu)
        apu.items.append(copy.deepcopy(apu.items[0]))
        self.assertNotEqual(generar_firma_calculo(apu), firma)
        self.assertEqual(len(construir_payload_firma(apu)["items"]), 5)


class SnapshotsYVerificacionTest(unittest.TestCase):
    def test_snapshot_asignacion_y_recursos(self):
        resultado = construir_snapshot_rubro(nodo_ejemplo(), apu_ejemplo(), "SOLO_MANO_OBRA")
        asignacion = resultado["asignacion"]
        self.assertEqual(asignacion["nodo_descripcion_snapshot"], "Rubro hormigón")
        self.assertEqual(asignacion["apu_codigo_snapshot"], "APU-010")
        self.assertEqual(asignacion["pu_herramientas_snapshot"], 1.2)
        self.assertEqual(asignacion["pu_equipos_snapshot"], 4.8)
        self.assertEqual(asignacion["pu_seleccionado_snapshot"], 25.2)
        self.assertEqual(asignacion["total_snapshot"], 75.6)
        self.assertEqual(asignacion["estado_revision"], "ACTUALIZADO")
        self.assertEqual(len(asignacion["firma_calculo"]), 64)

        recursos = resultado["recursos"]
        self.assertEqual(len(recursos), 4)
        mano_obra = next(item for item in recursos if item["recurso_categoria_snapshot"] == "mano_de_obra")
        material = next(item for item in recursos if item["recurso_categoria_snapshot"] == "material")
        self.assertTrue(mano_obra["incluido_subcontrato"])
        self.assertFalse(material["incluido_subcontrato"])
        self.assertEqual(mano_obra["cantidad_unitaria_snapshot"], 2.4)
        self.assertEqual(mano_obra["cantidad_total_snapshot"], 7.2)

    def test_varios_rubros_comparten_un_solo_calculo_apu(self):
        apu = apu_ejemplo()
        contexto = ContextoCalculoSubcontratos()
        construir_snapshot_rubro(nodo_ejemplo(metrado=2), apu, "COMPLETO", contexto=contexto)
        construir_snapshot_rubro(nodo_ejemplo(metrado=5), apu, "SOLO_MATERIALES", contexto=contexto)
        self.assertEqual(contexto.calculos_realizados, 1)

    def snapshot_base(self):
        apu = apu_ejemplo()
        nodo = nodo_ejemplo()
        construido = construir_snapshot_rubro(nodo, apu, "COMPLETO")
        return apu, nodo, construido["asignacion"], construido["recursos"]

    def test_clasifica_sin_cambios(self):
        apu, nodo, snapshot, recursos = self.snapshot_base()
        resultado = clasificar_cambios(snapshot, recursos, nodo, apu, es_rubro_operativo=True)
        self.assertEqual(resultado, {"estado": "ACTUALIZADO", "motivos": [], "advertencias": []})

    def test_clasifica_error_y_cambio_apu(self):
        apu, nodo, snapshot, recursos = self.snapshot_base()
        self.assertEqual(
            clasificar_cambios(snapshot, recursos, None, None, es_rubro_operativo=False)["estado"],
            "ERROR",
        )
        nodo.apu_id = None
        self.assertEqual(
            clasificar_cambios(snapshot, recursos, nodo, None, es_rubro_operativo=True)["estado"],
            "PENDIENTE_REVISION",
        )
        nodo.apu_id = apu.id
        apu_nuevo = copy.deepcopy(apu)
        apu_nuevo.id = 11
        nodo.apu_id = 11
        self.assertEqual(
            clasificar_cambios(snapshot, recursos, nodo, apu_nuevo, es_rubro_operativo=True)["estado"],
            "PENDIENTE_REVISION",
        )

    def test_clasifica_firma_metrado_y_lista_fisica(self):
        apu, nodo, snapshot, recursos = self.snapshot_base()
        apu.items[0].recurso.precio_unitario += 1
        resultado = clasificar_cambios(snapshot, recursos, nodo, apu, es_rubro_operativo=True)
        self.assertEqual(resultado["estado"], "DESACTUALIZADO")
        self.assertIn("FIRMA_CALCULO_CAMBIO", resultado["motivos"])

        apu, nodo, snapshot, recursos = self.snapshot_base()
        nodo.metrado = 4
        resultado = clasificar_cambios(snapshot, recursos, nodo, apu, es_rubro_operativo=True)
        self.assertIn("METRADO_CAMBIO", resultado["motivos"])

        apu, nodo, snapshot, recursos = self.snapshot_base()
        apu.items[0].recurso.unidad = "t"
        resultado = clasificar_cambios(snapshot, recursos, nodo, apu, es_rubro_operativo=True)
        self.assertIn("RECURSOS_FISICOS_CAMBIARON", resultado["motivos"])

    def test_cambios_textuales_son_solo_advertencia(self):
        apu, nodo, snapshot, recursos = self.snapshot_base()
        nodo.descripcion = "Descripción nueva"
        apu.nombre = "APU renombrado"
        apu.items[0].recurso.descripcion = "Material renombrado"
        resultado = clasificar_cambios(snapshot, recursos, nodo, apu, es_rubro_operativo=True)
        self.assertEqual(resultado["estado"], "ACTUALIZADO")
        codigos = {item["codigo"] for item in resultado["advertencias"]}
        self.assertIn("RUBRO_DESCRIPCION_CAMBIO", codigos)
        self.assertIn("APU_NOMBRE_CAMBIO", codigos)
        self.assertIn("RECURSO_DESCRIPCION_CAMBIO", codigos)

    def test_servicios_no_mutan_objetos(self):
        apu = apu_ejemplo()
        nodo = nodo_ejemplo()
        original = copy.deepcopy((apu, nodo))
        construir_snapshot_rubro(nodo, apu, "COMPLETO")
        self.assertEqual(apu.__dict__, original[0].__dict__)
        self.assertEqual(nodo.__dict__, original[1].__dict__)


if __name__ == "__main__":
    unittest.main()
