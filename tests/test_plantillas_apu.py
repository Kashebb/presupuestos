import sys
import unittest
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.models.base import Base
from app.models.apu import APU, APUItem, APUPlantillaUso
from app.models.recurso import Recurso
from app.schemas.apu import APUPlantillaAplicar, APUPlantillaDesdeAPU
from app.api.apus import aplicar_plantilla_apu, crear_plantilla_desde_apu, listar_plantillas_apu


class PlantillasAPUTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)
        self.db = self.Session()
        self.recurso = Recurso(
            codigo="MOB-TPL",
            descripcion="Cuadrilla plantilla",
            categoria="mano_de_obra",
            unidad="h",
            precio_unitario=12.5,
        )
        self.apu = APU(codigo="APU-TPL", nombre="APU plantilla", unidad="m3", rendimiento=0.5)
        self.db.add_all([self.recurso, self.apu])
        self.db.flush()
        self.db.add(APUItem(apu_id=self.apu.id, recurso_id=self.recurso.id, categoria="mano_de_obra", cantidad=2.0, orden=0))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_crea_plantilla_desde_apu_y_lista(self):
        plantilla = crear_plantilla_desde_apu(
            APUPlantillaDesdeAPU(
                apu_id=self.apu.id,
                nombre="Vertido hormigon A1",
                tipo="mixta",
                usar_rendimiento_actual=True,
            ),
            self.db,
        )

        plantillas = listar_plantillas_apu(buscar="vertido", db=self.db)

        self.assertEqual(plantilla.nombre, "Vertido hormigon A1")
        self.assertEqual(plantilla.rendimiento_sugerido, 0.5)
        self.assertEqual(len(plantilla.items), 1)
        self.assertEqual(len(plantillas), 1)

    def test_aplica_plantilla_sin_borrar_items_y_guarda_trazabilidad(self):
        plantilla = crear_plantilla_desde_apu(
            APUPlantillaDesdeAPU(
                apu_id=self.apu.id,
                nombre="Cuadrilla contratista A",
                tipo="mixta",
                usar_rendimiento_actual=True,
            ),
            self.db,
        )
        destino = APU(codigo="APU-DEST", nombre="APU destino", unidad="m3", rendimiento=1.0)
        self.db.add(destino)
        self.db.commit()

        actualizado = aplicar_plantilla_apu(
            destino.id,
            plantilla.id,
            APUPlantillaAplicar(modo="agregar", usar_rendimiento=True),
            self.db,
        )
        usos = self.db.query(APUPlantillaUso).filter(APUPlantillaUso.apu_id == destino.id).all()

        self.assertEqual(actualizado.rendimiento, 0.5)
        self.assertEqual(len(actualizado.items), 1)
        self.assertEqual(actualizado.items[0].recurso_id, self.recurso.id)
        self.assertEqual(len(usos), 1)
        self.assertEqual(usos[0].snapshot_json["nombre"], "Cuadrilla contratista A")


if __name__ == "__main__":
    unittest.main()
