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
from app.models.apu import APU
from app.models.recurso import Recurso
from app.schemas.apu import APUEtiquetasUpdate
from app.schemas.recurso import RecursoEtiquetasUpdate
from app.api.apus import actualizar_etiquetas_apu
from app.api.recursos import actualizar_etiquetas_recurso


class EtiquetasControladasTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)
        self.db = self.Session()

    def tearDown(self):
        self.db.close()

    def test_actualiza_etiquetas_apu_controladas(self):
        apu = APU(codigo="APU-TAG", nombre="APU tags", unidad="m2", rendimiento=1.0)
        self.db.add(apu)
        self.db.commit()

        actualizado = actualizar_etiquetas_apu(
            apu.id,
            APUEtiquetasUpdate(etiquetas=["validado", "solo mano de obra", "validado"]),
            self.db,
        )

        self.assertEqual(actualizado.etiquetas, ["validado", "solo mano de obra"])

    def test_rechaza_etiqueta_apu_no_controlada(self):
        apu = APU(codigo="APU-BAD-TAG", nombre="APU tag mala", unidad="m2", rendimiento=1.0)
        self.db.add(apu)
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            actualizar_etiquetas_apu(apu.id, APUEtiquetasUpdate(etiquetas=["libre"]), self.db)

        self.assertEqual(ctx.exception.status_code, 400)

    def test_actualiza_etiquetas_recurso_controladas(self):
        recurso = Recurso(
            codigo="MAT-TAG",
            descripcion="Material tags",
            categoria="material",
            unidad="u",
            precio_unitario=1.0,
        )
        self.db.add(recurso)
        self.db.commit()

        actualizado = actualizar_etiquetas_recurso(
            recurso.id,
            RecursoEtiquetasUpdate(etiquetas=["precio cotizado", "proveedor confirmado"]),
            self.db,
        )

        self.assertEqual(actualizado.etiquetas, ["precio cotizado", "proveedor confirmado"])

    def test_rechaza_etiqueta_recurso_no_controlada(self):
        recurso = Recurso(
            codigo="MAT-BAD-TAG",
            descripcion="Material tag mala",
            categoria="material",
            unidad="u",
            precio_unitario=1.0,
        )
        self.db.add(recurso)
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            actualizar_etiquetas_recurso(recurso.id, RecursoEtiquetasUpdate(etiquetas=["libre"]), self.db)

        self.assertEqual(ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
