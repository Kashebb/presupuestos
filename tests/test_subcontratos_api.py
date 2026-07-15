import sys
import unittest
import asyncio
import json
from pathlib import Path

from fastapi import FastAPI
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.api.subcontratos import _crear_con_codigo, router
from app.db import get_db
from app.models import Base
from app.models.apu import APU, APUItem
from app.models.presupuesto import NodoPresupuesto, Proyecto
from app.models.recurso import Recurso
from app.models.subcontrato import Subcontrato, SubcontratoCodigoSecuencia, SubcontratoRubro
from app.schemas.subcontrato import SubcontratoCreate


class RespuestaASGI:
    def __init__(self, status_code, body):
        self.status_code = status_code
        self.content = body
        self.text = body.decode("utf-8")

    def json(self):
        return json.loads(self.text) if self.content else None


class ClienteASGI:
    """Cliente minimo para probar la API sin agregar httpx a las dependencias congeladas."""
    def __init__(self, app): self.app = app

    def request(self, method, path, json_body=None):
        async def ejecutar():
            body = json.dumps(json_body).encode() if json_body is not None else b""
            enviados = []
            recibido = False
            async def receive():
                nonlocal recibido
                if recibido: return {"type": "http.disconnect"}
                recibido = True
                return {"type": "http.request", "body": body, "more_body": False}
            async def send(message): enviados.append(message)
            scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
                     "method": method, "scheme": "http", "path": path, "raw_path": path.encode(),
                     "query_string": b"", "headers": [(b"host", b"test"), (b"content-type", b"application/json")],
                     "client": ("test", 1), "server": ("test", 80), "root_path": ""}
            await self.app(scope, receive, send)
            inicio = next(m for m in enviados if m["type"] == "http.response.start")
            respuesta = b"".join(m.get("body", b"") for m in enviados if m["type"] == "http.response.body")
            return RespuestaASGI(inicio["status"], respuesta)
        return asyncio.run(ejecutar())

    def get(self, path): return self.request("GET", path)
    def post(self, path, json=None): return self.request("POST", path, json)
    def patch(self, path, json=None): return self.request("PATCH", path, json)
    def delete(self, path): return self.request("DELETE", path)


class SubcontratosApiTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        event.listen(self.engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)
        app = FastAPI(); app.include_router(router)

        def override_db():
            db = self.Session()
            try: yield db
            finally: db.close()

        app.dependency_overrides[get_db] = override_db
        self.client = ClienteASGI(app)
        with self.Session() as db:
            p1 = Proyecto(nombre="Proyecto 1", codigo="P1")
            p2 = Proyecto(nombre="Proyecto 2", codigo="P2")
            db.add_all([p1, p2]); db.flush()
            mat = Recurso(codigo="MAT-1", descripcion="Cemento", categoria="material", unidad="kg", precio_unitario=2)
            mo = Recurso(codigo="MO-1", descripcion="Albanil", categoria="mano_de_obra", unidad="h", precio_unitario=5)
            db.add_all([mat, mo]); db.flush()
            apu = APU(codigo="APU-1", nombre="Muro", unidad="m2", rendimiento=1, estado="aprobado")
            db.add(apu); db.flush()
            db.add_all([APUItem(apu_id=apu.id, recurso_id=mat.id, categoria="material", cantidad=3),
                        APUItem(apu_id=apu.id, recurso_id=mo.id, categoria="mano_de_obra", cantidad=1)])
            db.flush()
            nodos = [
                NodoPresupuesto(proyecto_id=p1.id, tipo="RUBRO", descripcion="Rubro uno", unidad="m2", metrado=10, apu_id=apu.id, activo_como_rubro=True),
                NodoPresupuesto(proyecto_id=p1.id, tipo="RUBRO", descripcion="Sin APU", unidad="u", metrado=2, activo_como_rubro=True),
                NodoPresupuesto(proyecto_id=p1.id, tipo="CAPITULO", descripcion="Estructural", activo_como_rubro=False),
                NodoPresupuesto(proyecto_id=p2.id, tipo="RUBRO", descripcion="Otro proyecto", metrado=1, apu_id=apu.id, activo_como_rubro=True),
            ]
            db.add_all(nodos); db.commit()
            self.p1, self.p2, self.apu_id = p1.id, p2.id, apu.id
            self.nodo_ok, self.nodo_sin_apu, self.nodo_estructural, self.nodo_otro = [n.id for n in nodos]

    def tearDown(self):
        self.engine.dispose()

    def crear(self, proyecto=None, nombre="Subcontrato"):
        r = self.client.post(f"/presupuestos/proyectos/{proyecto or self.p1}/subcontratos", json={"nombre": nombre})
        self.assertEqual(r.status_code, 201, r.text)
        return r.json()

    def asignar(self, sub_id, ids=None, preset="COMPLETO", seleccion=None):
        payload = {"nodo_ids": ids or [self.nodo_ok], "preset": preset}
        if seleccion is not None: payload["seleccion_personalizada"] = seleccion
        return self.client.post(f"/presupuestos/subcontratos/{sub_id}/rubros/asignar", json=payload)

    def test_secuencia_por_proyecto_no_reutiliza_y_supera_999(self):
        a = self.crear(); self.client.delete(f"/presupuestos/subcontratos/{a['id']}")
        b = self.crear(); c = self.crear(self.p2)
        self.assertEqual((a["codigo"], b["codigo"], c["codigo"]), ("SC-001", "SC-002", "SC-001"))
        with self.Session() as db:
            db.get(SubcontratoCodigoSecuencia, self.p1).ultimo_numero = 999; db.commit()
        self.assertEqual(self.crear()["codigo"], "SC-1000")

    def test_colision_reintenta_y_rollback_no_deja_cabecera(self):
        with self.Session() as db:
            db.add(Subcontrato(proyecto_id=self.p1, codigo="SC-001", nombre="Existente")); db.commit()
        self.assertEqual(self.crear()["codigo"], "SC-002")
        r = self.client.post("/presupuestos/proyectos/99999/subcontratos", json={"nombre": "X"})
        self.assertEqual(r.status_code, 404)

    def test_rollback_revierte_reserva_y_cabecera_juntas(self):
        with self.Session() as db:
            creado = _crear_con_codigo(db, self.p1, SubcontratoCreate(nombre="Temporal"))
            self.assertEqual(creado.codigo, "SC-001")
            db.rollback()
        with self.Session() as db:
            self.assertIsNone(db.query(Subcontrato).filter_by(proyecto_id=self.p1).first())
            self.assertIsNone(db.get(SubcontratoCodigoSecuencia, self.p1))

    def test_crud_y_restricciones_por_estado(self):
        s = self.crear()
        self.assertEqual(self.client.patch(f"/presupuestos/subcontratos/{s['id']}", json={"nombre": "Editado"}).json()["nombre"], "Editado")
        self.asignar(s["id"])
        self.assertEqual(self.client.post(f"/presupuestos/subcontratos/{s['id']}/confirmar").status_code, 200)
        self.assertEqual(self.client.patch(f"/presupuestos/subcontratos/{s['id']}", json={"nombre": "No"}).status_code, 409)
        self.assertEqual(self.client.delete(f"/presupuestos/subcontratos/{s['id']}").status_code, 409)

    def test_asignacion_masiva_parcial_y_validaciones(self):
        s = self.crear()
        r = self.asignar(s["id"], [self.nodo_ok, self.nodo_sin_apu, self.nodo_estructural, self.nodo_otro]).json()
        self.assertEqual([x["resultado"] for x in r["resultados"]], ["asignado", "sin_apu", "no_operativo", "proyecto_incorrecto"])
        self.assertEqual(r["calculos_apu"], 1)

    def test_configuracion_invalida_y_preset_personalizado(self):
        s = self.crear()
        r = self.asignar(s["id"], preset="PERSONALIZADO", seleccion={}).json()
        self.assertEqual(r["resultados"][0]["resultado"], "configuracion_invalida")

    def test_categoria_no_soportada_con_costo_bloquea(self):
        with self.Session() as db:
            otro = Recurso(codigo="OTR-1", descripcion="Otro", categoria="otros", unidad="u", precio_unitario=3)
            db.add(otro); db.flush()
            apu = APU(codigo="APU-OTR", nombre="Invalido", unidad="u", rendimiento=1); db.add(apu); db.flush()
            db.add(APUItem(apu_id=apu.id, recurso_id=otro.id, categoria="otros", cantidad=1)); db.flush()
            nodo = NodoPresupuesto(proyecto_id=self.p1, tipo="RUBRO", descripcion="Invalido", metrado=1, apu_id=apu.id, activo_como_rubro=True)
            db.add(nodo); db.commit(); nodo_id = nodo.id
        s = self.crear()
        self.assertEqual(self.asignar(s["id"], [nodo_id]).json()["resultados"][0]["resultado"], "categoria_no_soportada")
        r = self.asignar(s["id"], preset="SOLO_MATERIALES", seleccion={"incluye_mano_obra": True}).json()
        self.assertEqual(r["resultados"][0]["resultado"], "configuracion_invalida")

    def test_exclusividad_borrador_confirmado_y_anulado_libera(self):
        a, b = self.crear(nombre="A"), self.crear(nombre="B")
        self.assertEqual(self.asignar(a["id"]).json()["resultados"][0]["resultado"], "asignado")
        bloqueo = self.asignar(b["id"]).json()["resultados"][0]
        self.assertEqual(bloqueo["resultado"], "bloqueado"); self.assertEqual(bloqueo["subcontrato_bloqueante"]["id"], a["id"])
        self.client.post(f"/presupuestos/subcontratos/{a['id']}/confirmar")
        self.assertEqual(self.asignar(b["id"]).json()["resultados"][0]["resultado"], "bloqueado")
        self.client.post(f"/presupuestos/subcontratos/{a['id']}/anular")
        self.assertEqual(self.asignar(b["id"]).json()["resultados"][0]["resultado"], "asignado")

    def test_verificar_actualizar_cambio_apu_y_texto(self):
        s = self.crear(); aid = self.asignar(s["id"]).json()["resultados"][0]["asignacion_id"]
        with self.Session() as db:
            n = db.get(NodoPresupuesto, self.nodo_ok); n.metrado = 11; n.descripcion = "Texto nuevo"; db.commit()
        ver = self.client.post(f"/presupuestos/subcontratos/{s['id']}/rubros/verificar-cambios").json()["resultados"][0]
        self.assertEqual(ver["estado"], "DESACTUALIZADO"); self.assertTrue(ver["advertencias"])
        self.client.post(f"/presupuestos/subcontratos/{s['id']}/rubros/actualizar", json={"asignacion_ids": [aid]})
        self.assertEqual(self.client.get(f"/presupuestos/subcontratos/{s['id']}").json()["rubros"][0]["metrado_snapshot"], 11)
        with self.Session() as db:
            apu2 = APU(codigo="APU-2", nombre="Otro", unidad="m2", rendimiento=1); db.add(apu2); db.flush()
            db.get(NodoPresupuesto, self.nodo_ok).apu_id = apu2.id; db.commit()
        self.assertEqual(self.client.post(f"/presupuestos/subcontratos/{s['id']}/rubros/verificar-cambios").json()["resultados"][0]["estado"], "PENDIENTE_REVISION")
        self.assertEqual(self.client.post(f"/presupuestos/subcontratos/{s['id']}/rubros/{aid}/revisar", json={"confirmar_cambio_apu": False}).status_code, 409)
        self.assertEqual(self.client.post(f"/presupuestos/subcontratos/{s['id']}/rubros/{aid}/revisar", json={"confirmar_cambio_apu": True}).status_code, 200)

    def test_nodo_eliminado_y_no_operativo_clasifican_error(self):
        s = self.crear(); self.asignar(s["id"])
        with self.Session() as db:
            db.delete(db.get(NodoPresupuesto, self.nodo_ok)); db.commit()
        estado = self.client.post(f"/presupuestos/subcontratos/{s['id']}/rubros/verificar-cambios").json()["resultados"][0]["estado"]
        self.assertEqual(estado, "ERROR")

    def test_confirmado_verifica_sin_reemplazar_snapshot(self):
        s = self.crear(); self.asignar(s["id"])
        antes = self.client.get(f"/presupuestos/subcontratos/{s['id']}").json()["rubros"][0]["total_snapshot"]
        self.client.post(f"/presupuestos/subcontratos/{s['id']}/confirmar")
        with self.Session() as db:
            item = db.query(APUItem).filter(APUItem.apu_id == self.apu_id).first(); item.cantidad = 99; db.commit()
        ver = self.client.post(f"/presupuestos/subcontratos/{s['id']}/rubros/verificar-cambios").json()["resultados"][0]
        despues = self.client.get(f"/presupuestos/subcontratos/{s['id']}").json()["rubros"][0]["total_snapshot"]
        self.assertEqual(ver["estado"], "DESACTUALIZADO"); self.assertEqual(antes, despues)

    def test_confirmar_reabrir_anular_y_fecha_conservada(self):
        s = self.crear(); self.asignar(s["id"])
        confirmado = self.client.post(f"/presupuestos/subcontratos/{s['id']}/confirmar").json()
        reabierto = self.client.post(f"/presupuestos/subcontratos/{s['id']}/reabrir").json()
        self.assertEqual(reabierto["estado"], "BORRADOR"); self.assertEqual(reabierto["fecha_confirmacion"], confirmado["fecha_confirmacion"])
        self.assertEqual(self.client.post(f"/presupuestos/subcontratos/{s['id']}/anular").json()["estado"], "ANULADO")
        self.assertEqual(self.client.post(f"/presupuestos/subcontratos/{s['id']}/reabrir").status_code, 409)

    def test_lista_detalle_distribucion_resumen_y_materiales(self):
        s = self.crear(); self.asignar(s["id"], preset="SOLO_MANO_OBRA")
        self.assertEqual(self.client.get(f"/presupuestos/proyectos/{self.p1}/subcontratos").json()[0]["cantidad_rubros"], 1)
        self.assertEqual(len(self.client.get(f"/presupuestos/subcontratos/{s['id']}").json()["rubros"]), 1)
        dist = self.client.get(f"/presupuestos/proyectos/{self.p1}/subcontratos/distribucion").json()
        self.assertEqual(len(dist), 2); self.assertTrue(any(x["razon_bloqueo"] == "SIN_APU" for x in dist))
        mats = self.client.get(f"/presupuestos/subcontratos/{s['id']}/materiales-suministrar").json()
        self.assertEqual(mats[0]["cantidad_total"], 30)
        resumen = self.client.get(f"/presupuestos/subcontratos/{s['id']}/resumen").json()
        self.assertEqual(resumen["recursos_materiales_consolidados"], 1)

    def test_retirar_borra_snapshots_y_libera(self):
        a, b = self.crear(nombre="A"), self.crear(nombre="B")
        aid = self.asignar(a["id"]).json()["resultados"][0]["asignacion_id"]
        self.assertEqual(self.client.delete(f"/presupuestos/subcontratos/{a['id']}/rubros/{aid}").status_code, 204)
        self.assertEqual(self.asignar(b["id"]).json()["resultados"][0]["resultado"], "asignado")

    def test_asignacion_masiva_no_presenta_n_mas_uno_en_selects(self):
        with self.Session() as db:
            base = db.get(NodoPresupuesto, self.nodo_ok)
            nuevos = [NodoPresupuesto(proyecto_id=self.p1, tipo="RUBRO", descripcion=f"R{i}", metrado=1, apu_id=self.apu_id, activo_como_rubro=True) for i in range(5)]
            db.add_all(nuevos); db.commit(); ids = [n.id for n in nuevos]
        s = self.crear(); selects = []
        def contar(_conn, _cursor, statement, _params, _ctx, _many):
            if statement.lstrip().upper().startswith("SELECT"): selects.append(statement)
        event.listen(self.engine, "before_cursor_execute", contar)
        try: r = self.asignar(s["id"], ids).json()
        finally: event.remove(self.engine, "before_cursor_execute", contar)
        self.assertTrue(all(x["resultado"] == "asignado" for x in r["resultados"])); self.assertEqual(r["calculos_apu"], 1)
        self.assertLessEqual(len(selects), 6)


if __name__ == "__main__":
    unittest.main()
