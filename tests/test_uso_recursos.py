import sys
import unittest
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.api.presupuestos import PaqueteCreate, crear_paquete, listar_uso_recursos
from app.models.apu import APU, APUItem
from app.models.base import Base
from app.models.presupuesto import NodoPresupuesto, Proyecto
from app.models.recurso import Recurso


class UsoRecursosTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)
        self.db = self.Session()
        self.proyecto = Proyecto(nombre="Proyecto uso recursos", codigo="UR")
        self.db.add(self.proyecto)
        self.db.commit()

        self.capitulo = NodoPresupuesto(
            proyecto_id=self.proyecto.id,
            tipo="CAPITULO",
            descripcion="Garita",
            orden=1,
            activo_como_rubro=False,
        )
        self.db.add(self.capitulo)
        self.db.commit()
        crear_paquete(self.proyecto.id, PaqueteCreate(nodo_id=self.capitulo.id, nombre="Garita"), self.db)

    def tearDown(self):
        self.db.close()

    def test_devuelve_cantidades_con_rendimiento_y_consolida_copia_proyecto(self):
        hormigon_maestro = Recurso(
            codigo="MAT-001", descripcion="Hormigon 280", categoria="material", unidad="m3", precio_unitario=96,
        )
        hormigon_proyecto = Recurso(
            codigo="MAT-001-P1", proyecto_id=self.proyecto.id, recurso_base_id=1,
            descripcion="Hormigon 280", categoria="material", unidad="m3", precio_unitario=100,
        )
        oficial = Recurso(
            codigo="MO-001", descripcion="Oficial", categoria="mano_de_obra", unidad="h", precio_unitario=10,
        )
        self.db.add_all([hormigon_maestro, hormigon_proyecto, oficial])
        self.db.flush()
        hormigon_proyecto.recurso_base_id = hormigon_maestro.id
        apu = APU(codigo="APU-001", nombre="Hormigon simple", unidad="m3", rendimiento=2)
        self.db.add(apu)
        self.db.flush()
        self.db.add_all([
            APUItem(apu_id=apu.id, recurso_id=hormigon_maestro.id, categoria="material", cantidad=1.5),
            APUItem(apu_id=apu.id, recurso_id=hormigon_proyecto.id, categoria="material", cantidad=0.5),
            APUItem(apu_id=apu.id, recurso_id=oficial.id, categoria="mano_de_obra", cantidad=3),
        ])
        self.db.add(NodoPresupuesto(
            proyecto_id=self.proyecto.id, padre_id=self.capitulo.id, tipo="RUBRO", descripcion="Zapatas",
            unidad="m3", metrado=4, apu_id=apu.id, orden=2, activo_como_rubro=True,
        ))
        self.db.commit()

        resultado = listar_uso_recursos(self.proyecto.id, self.db)
        movimientos = resultado["movimientos"]

        self.assertEqual(len(movimientos), 3)
        maestro = next(item for item in movimientos if item["origen"] == "Maestro")
        proyecto = next(item for item in movimientos if item["origen"] == "Solo proyecto")
        mano_obra = next(item for item in movimientos if item["recurso"]["descripcion"] == "Oficial")
        self.assertEqual(maestro["cantidad"], 6.0)
        self.assertEqual(maestro["costo_total"], 576.0)
        self.assertEqual(proyecto["cantidad"], 2.0)
        self.assertEqual(proyecto["costo_total"], 200.0)
        self.assertEqual(maestro["recurso"]["clave_consolidacion"], proyecto["recurso"]["clave_consolidacion"])
        self.assertEqual(mano_obra["cantidad"], 24.0)
        self.assertEqual(mano_obra["costo_total"], 240.0)
        self.assertEqual(maestro["paquete"]["nombre"], "Garita")

    def test_incluye_subcontratado_con_precio_referencia(self):
        self.db.add(NodoPresupuesto(
            proyecto_id=self.proyecto.id, padre_id=self.capitulo.id, tipo="RUBRO", descripcion="Puertas aluminio",
            unidad="m2", metrado=24, precio_unitario_ref=35, observaciones="SIN_APU", orden=2,
            activo_como_rubro=True,
        ))
        self.db.commit()

        resultado = listar_uso_recursos(self.proyecto.id, self.db)
        movimiento = resultado["movimientos"][0]

        self.assertEqual(movimiento["tipo"], "subcontratado")
        self.assertEqual(movimiento["origen"], "Subcontratado")
        self.assertEqual(movimiento["cantidad"], 24.0)
        self.assertEqual(movimiento["costo_unitario"], 35.0)
        self.assertEqual(movimiento["costo_total"], 840.0)


if __name__ == "__main__":
    unittest.main()
