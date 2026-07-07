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
from app.api.presupuestos import (
    PaqueteCreate,
    RecursoProyectoUpdate,
    aislar_apu_no_liberados,
    copiar_recurso_para_proyecto,
    crear_paquete,
    impacto_apu_paquetes,
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

    def test_impacto_apu_detecta_paquete_liberado(self):
        apu = APU(codigo="APU-PKG", nombre="APU paquete", unidad="u", rendimiento=1.0)
        self.db.add(apu)
        self.db.commit()
        rubro = NodoPresupuesto(
            proyecto_id=self.proyecto.id,
            padre_id=self.nodo.id,
            tipo="RUBRO",
            descripcion="Rubro con APU",
            orden=2,
            unidad="u",
            metrado=1,
            apu_id=apu.id,
            activo_como_rubro=True,
        )
        self.db.add(rubro)
        self.db.commit()
        paquete = crear_paquete(self.proyecto.id, PaqueteCreate(nodo_id=self.nodo.id), self.db)
        liberar_paquete(paquete.id, self.db)

        impacto = impacto_apu_paquetes(self.proyecto.id, apu.id, self.db)

        self.assertEqual(impacto.total_rubros, 1)
        self.assertEqual(impacto.rubros_fuera_paquete, 0)
        self.assertEqual(len(impacto.paquetes), 1)
        self.assertEqual(impacto.paquetes[0].estado, "liberado")
        self.assertEqual(impacto.paquetes[0].rubros, 1)

    def test_aislar_apu_reasigna_solo_no_liberados(self):
        apu = APU(codigo="APU-AISLAR", nombre="APU aislar", unidad="u", rendimiento=1.0)
        self.db.add(apu)
        self.db.commit()
        rubro_liberado = NodoPresupuesto(
            proyecto_id=self.proyecto.id,
            padre_id=self.nodo.id,
            tipo="RUBRO",
            descripcion="Rubro liberado",
            orden=2,
            unidad="u",
            metrado=1,
            apu_id=apu.id,
            activo_como_rubro=True,
        )
        rubro_activo = NodoPresupuesto(
            proyecto_id=self.proyecto.id,
            tipo="RUBRO",
            descripcion="Rubro activo",
            orden=3,
            unidad="u",
            metrado=1,
            apu_id=apu.id,
            activo_como_rubro=True,
        )
        self.db.add_all([rubro_liberado, rubro_activo])
        self.db.commit()
        paquete = crear_paquete(self.proyecto.id, PaqueteCreate(nodo_id=self.nodo.id), self.db)
        liberar_paquete(paquete.id, self.db)

        result = aislar_apu_no_liberados(self.proyecto.id, apu.id, self.db)
        self.db.refresh(rubro_liberado)
        self.db.refresh(rubro_activo)

        self.assertTrue(result.created)
        self.assertEqual(result.rubros_reasignados, 1)
        self.assertEqual(result.rubros_liberados_preservados, 1)
        self.assertEqual(rubro_liberado.apu_id, apu.id)
        self.assertEqual(rubro_activo.apu_id, result.apu_id)
        self.assertEqual(result.variante.variante_nombre, "NO LIBERADOS")

    def test_copia_recurso_para_proyecto_y_actualiza_apu(self):
        recurso = Recurso(
            codigo="MAT-MAESTRO",
            descripcion="Material maestro",
            categoria="material",
            unidad="u",
            precio_unitario=1.0,
        )
        apu = APU(
            codigo="APU-PROY",
            nombre="APU proyecto",
            unidad="u",
            rendimiento=1.0,
            es_variante=True,
            proyecto_id=self.proyecto.id,
            variante_nombre="PROYECTO",
        )
        self.db.add_all([recurso, apu])
        self.db.flush()
        apu.items.append(APUItem(recurso_id=recurso.id, categoria="material", cantidad=1.0, orden=1))
        self.db.commit()

        result = copiar_recurso_para_proyecto(
            self.proyecto.id,
            apu.id,
            recurso.id,
            RecursoProyectoUpdate(
                descripcion="Material proyecto",
                unidad="u",
                precio_unitario=2.5,
                fuente_precio="Cotizacion A",
                observacion="Solo proyecto",
                estado_validacion="aprobado",
            ),
            self.db,
        )

        item = self.db.query(APUItem).filter(APUItem.apu_id == apu.id).first()
        self.assertTrue(result.created)
        self.assertNotEqual(result.recurso_id, recurso.id)
        self.assertEqual(item.recurso_id, result.recurso_id)
        self.assertEqual(result.recurso.proyecto_id, self.proyecto.id)
        self.assertEqual(result.recurso.recurso_base_id, recurso.id)
        self.assertEqual(result.recurso.precio_unitario, 2.5)


if __name__ == "__main__":
    unittest.main()
