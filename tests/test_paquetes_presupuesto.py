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
from app.models.presupuesto import NodoPresupuesto, Proyecto
from app.api.presupuestos import (
    PaqueteCreate,
    crear_paquete,
    liberar_paquete,
    listar_paquetes,
    reabrir_paquete,
)


class PaquetesPresupuestoTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)
        self.db = self.Session()
        self.proyecto = Proyecto(nombre="Proyecto paquetes", codigo="PKG")
        self.db.add(self.proyecto)
        self.db.commit()
        self.nodo = NodoPresupuesto(
            proyecto_id=self.proyecto.id,
            tipo="CAPITULO",
            descripcion="Garita",
            orden=1,
            activo_como_rubro=False,
        )
        self.db.add(self.nodo)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_crea_paquete_desde_nodo(self):
        paquete = crear_paquete(
            self.proyecto.id,
            PaqueteCreate(nodo_id=self.nodo.id, nombre="Garita principal"),
            self.db,
        )

        self.assertEqual(paquete.proyecto_id, self.proyecto.id)
        self.assertEqual(paquete.nodo_id, self.nodo.id)
        self.assertEqual(paquete.nombre, "Garita principal")
        self.assertEqual(paquete.estado, "activo")

    def test_rechaza_paquete_duplicado_para_misma_rama(self):
        crear_paquete(self.proyecto.id, PaqueteCreate(nodo_id=self.nodo.id), self.db)

        with self.assertRaises(HTTPException) as ctx:
            crear_paquete(self.proyecto.id, PaqueteCreate(nodo_id=self.nodo.id), self.db)

        self.assertEqual(ctx.exception.status_code, 400)

    def test_libera_y_reabre_paquete(self):
        paquete = crear_paquete(self.proyecto.id, PaqueteCreate(nodo_id=self.nodo.id), self.db)

        liberado = liberar_paquete(paquete.id, self.db)
        self.assertEqual(liberado.estado, "liberado")
        self.assertIsNotNone(liberado.fecha_liberacion)

        reabierto = reabrir_paquete(paquete.id, self.db)
        self.assertEqual(reabierto.estado, "activo")
        self.assertIsNone(reabierto.fecha_liberacion)

    def test_lista_paquetes_por_proyecto(self):
        crear_paquete(self.proyecto.id, PaqueteCreate(nodo_id=self.nodo.id), self.db)

        paquetes = listar_paquetes(self.proyecto.id, self.db)

        self.assertEqual(len(paquetes), 1)
        self.assertEqual(paquetes[0].nodo_id, self.nodo.id)


if __name__ == "__main__":
    unittest.main()
