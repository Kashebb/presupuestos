import asyncio
import io
import sys
import unittest
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.models.base import Base
from app.models.apu import APU, APUItem
from app.models.presupuesto import NodoPresupuesto, Proyecto
from app.models.recurso import Recurso
from app.api.apus import calcular_costo_apu
from app.api.presupuestos import exportar_presupuesto_operativo


async def _read_response(response):
    chunks = []
    async for chunk in response.body_iterator:
        chunks.append(chunk)
    return b"".join(chunks)


class ExportPresupuestoOperativoTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)
        self.db = self.Session()

    def tearDown(self):
        self.db.close()

    def test_calcular_costo_apu_redondea_a_cuatro_decimales(self):
        recurso = Recurso(
            codigo="MAT-4D",
            descripcion="Material cuatro decimales",
            categoria="material",
            unidad="u",
            precio_unitario=1.23456,
        )
        apu = APU(codigo="APU-4D", nombre="APU cuatro decimales", unidad="m2", rendimiento=1.0)
        apu.items.append(APUItem(recurso=recurso, categoria="material", cantidad=2.0, orden=1))

        costo = calcular_costo_apu(apu)

        self.assertEqual(costo["precio_unitario"], 2.4692)
        self.assertEqual(costo["subtotales"]["material"], 2.4692)
        self.assertEqual(costo["herramienta_menor"], 0.0)

    def test_exporta_excel_operativo_lectura(self):
        proyecto = Proyecto(nombre="Proyecto Prueba", codigo="PR-01")
        recurso = Recurso(
            codigo="MAT-001",
            descripcion="Material prueba",
            categoria="material",
            unidad="u",
            precio_unitario=12.345,
        )
        apu = APU(codigo="APU-001", nombre="APU prueba", unidad="m2", rendimiento=1.0)
        apu.items.append(APUItem(recurso=recurso, categoria="material", cantidad=2.0, orden=1))
        self.db.add_all([proyecto, recurso, apu])
        self.db.flush()

        fase = NodoPresupuesto(
            proyecto_id=proyecto.id,
            tipo="FASE",
            nivel=0,
            item="1",
            descripcion="Fase principal",
            orden=1,
            activo_como_rubro=False,
            estado_actualizacion="activo",
        )
        rubro = NodoPresupuesto(
            proyecto_id=proyecto.id,
            padre_id=None,
            tipo="RUBRO",
            nivel=1,
            item="1.01",
            descripcion="Rubro exportable",
            orden=2,
            unidad="m2",
            metrado=3.0,
            precio_unitario_ref=10.0,
            apu_id=apu.id,
            activo_como_rubro=True,
            tipo_rubro="VINCULADO",
            estado_actualizacion="activo",
        )
        obsoleto = NodoPresupuesto(
            proyecto_id=proyecto.id,
            tipo="RUBRO",
            nivel=1,
            item="1.02",
            descripcion="Rubro obsoleto",
            orden=3,
            unidad="m2",
            metrado=1.0,
            precio_unitario_ref=1.0,
            activo_como_rubro=True,
            estado_actualizacion="obsoleto",
        )
        self.db.add_all([fase, rubro, obsoleto])
        self.db.commit()
        rubro.padre_id = fase.id
        self.db.commit()

        response = exportar_presupuesto_operativo(proyecto.id, self.db)
        content = asyncio.run(_read_response(response))

        self.assertEqual(response.media_type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        self.assertIn("presupuesto_operativo_pr-01.xlsx", response.headers["content-disposition"])

        import openpyxl

        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        self.assertEqual(wb.sheetnames, ["Presupuesto operativo", "Resumen"])
        ws = wb["Presupuesto operativo"]
        headers = [cell.value for cell in ws[1]]
        self.assertEqual(headers[:5], ["Nivel", "Tipo", "Item", "Descripcion", "Unidad"])
        values_by_description = {row[3]: row for row in ws.iter_rows(min_row=2, values_only=True)}
        self.assertIn("Rubro exportable", values_by_description)
        self.assertNotIn("Rubro obsoleto", values_by_description)
        rubro_row = values_by_description["Rubro exportable"]
        self.assertEqual(rubro_row[14], "Vinculado")
        self.assertEqual(rubro_row[8], "APU-001")
        self.assertAlmostEqual(rubro_row[7], 30.0)
        self.assertAlmostEqual(rubro_row[10], 24.69)
        self.assertEqual(ws["F2"].number_format, "#,##0.0000")
        self.assertEqual(ws["G2"].number_format, "$#,##0.0000")

    def test_exportar_proyecto_inexistente_devuelve_404(self):
        with self.assertRaises(HTTPException) as ctx:
            exportar_presupuesto_operativo(999, self.db)
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
