import sys
import tempfile
import unittest
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.models import Base
from app.models.apu import APU
from app.models.presupuesto import NodoPresupuesto, Proyecto
from app.models.recurso import Recurso
from app.models.subcontrato import (
    Subcontrato,
    SubcontratoCodigoSecuencia,
    SubcontratoRubro,
    SubcontratoRubroRecursoSnapshot,
)


TABLAS_SUBCONTRATOS = {
    "subcontratos",
    "subcontrato_codigo_secuencias",
    "subcontrato_rubros",
    "subcontrato_rubro_recursos_snapshot",
}


def activar_fks_sqlite(dbapi_connection, _connection_record):
    dbapi_connection.execute("PRAGMA foreign_keys=ON")


class SubcontratosModeloTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        event.listen(self.engine, "connect", activar_fks_sqlite)
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.proyecto = Proyecto(nombre="Proyecto subcontratos", codigo="SC-PROY")
        self.apu = APU(codigo="APU-SC", nombre="APU subcontrato", unidad="u", rendimiento=1.0)
        self.recurso = Recurso(
            codigo="MAT-SC",
            descripcion="Material subcontrato",
            categoria="material",
            unidad="u",
            precio_unitario=10.0,
        )
        self.db.add_all([self.proyecto, self.apu, self.recurso])
        self.db.flush()
        self.nodo = NodoPresupuesto(
            proyecto_id=self.proyecto.id,
            tipo="RUBRO",
            item="1.01",
            descripcion="Rubro de prueba",
            unidad="u",
            metrado=2.0,
            apu_id=self.apu.id,
            activo_como_rubro=True,
        )
        self.db.add(self.nodo)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def crear_subcontrato(self, codigo="SC-001", estado="BORRADOR"):
        item = Subcontrato(
            proyecto_id=self.proyecto.id,
            codigo=codigo,
            nombre="Obra civil",
            estado=estado,
        )
        self.db.add(item)
        self.db.flush()
        return item

    def crear_asignacion(self, subcontrato, **overrides):
        data = {
            "subcontrato_id": subcontrato.id,
            "nodo_presupuesto_id": self.nodo.id,
            "apu_id_snapshot": self.apu.id,
            "nodo_item_snapshot": self.nodo.item,
            "nodo_descripcion_snapshot": self.nodo.descripcion,
            "nodo_unidad_snapshot": self.nodo.unidad,
            "apu_codigo_snapshot": self.apu.codigo,
            "apu_nombre_snapshot": self.apu.nombre,
            "preset": "SOLO_MATERIALES",
            "incluye_materiales": True,
            "incluye_mano_obra": False,
            "incluye_equipos": False,
            "incluye_transporte": False,
            "metrado_snapshot": 2.0,
            "pu_materiales_snapshot": 10.0,
            "pu_mano_obra_snapshot": 0.0,
            "pu_herramientas_snapshot": 0.0,
            "pu_equipos_snapshot": 0.0,
            "pu_transporte_snapshot": 0.0,
            "pu_seleccionado_snapshot": 10.0,
            "total_snapshot": 20.0,
            "firma_calculo": "a" * 64,
            "estado_revision": "ACTUALIZADO",
        }
        data.update(overrides)
        item = SubcontratoRubro(**data)
        self.db.add(item)
        self.db.flush()
        return item

    def crear_snapshot_recurso(self, asignacion):
        item = SubcontratoRubroRecursoSnapshot(
            subcontrato_rubro_id=asignacion.id,
            recurso_id=self.recurso.id,
            recurso_codigo_snapshot=self.recurso.codigo,
            recurso_descripcion_snapshot=self.recurso.descripcion,
            recurso_unidad_snapshot=self.recurso.unidad,
            recurso_categoria_snapshot="material",
            cantidad_unitaria_snapshot=1.5,
            metrado_snapshot=2.0,
            cantidad_total_snapshot=3.0,
            incluido_subcontrato=False,
        )
        self.db.add(item)
        self.db.flush()
        return item

    def assert_integrity_error(self, callback):
        with self.assertRaises(IntegrityError):
            callback()
            self.db.commit()
        self.db.rollback()

    def test_crea_las_cuatro_tablas(self):
        self.assertTrue(TABLAS_SUBCONTRATOS.issubset(set(inspect(self.engine).get_table_names())))

    def test_fks_tienen_reglas_aprobadas(self):
        inspector = inspect(self.engine)

        fks_subcontratos = {fk["constrained_columns"][0]: fk for fk in inspector.get_foreign_keys("subcontratos")}
        self.assertEqual(fks_subcontratos["proyecto_id"]["options"].get("ondelete"), "CASCADE")

        fks_rubros = {fk["constrained_columns"][0]: fk for fk in inspector.get_foreign_keys("subcontrato_rubros")}
        self.assertEqual(fks_rubros["subcontrato_id"]["options"].get("ondelete"), "CASCADE")
        self.assertEqual(fks_rubros["nodo_presupuesto_id"]["options"].get("ondelete"), "SET NULL")
        self.assertEqual(fks_rubros["apu_id_snapshot"]["options"].get("ondelete"), "SET NULL")

        fks_recursos = {
            fk["constrained_columns"][0]: fk
            for fk in inspector.get_foreign_keys("subcontrato_rubro_recursos_snapshot")
        }
        self.assertEqual(fks_recursos["subcontrato_rubro_id"]["options"].get("ondelete"), "CASCADE")
        self.assertEqual(fks_recursos["recurso_id"]["options"].get("ondelete"), "SET NULL")

    def test_estados_subcontrato_permitidos(self):
        for indice, estado in enumerate(("BORRADOR", "CONFIRMADO", "ANULADO"), start=1):
            self.crear_subcontrato(codigo=f"SC-{indice:03d}", estado=estado)
        self.db.commit()
        self.assertEqual(self.db.query(Subcontrato).count(), 3)

    def test_rechaza_estado_subcontrato_invalido(self):
        self.assert_integrity_error(lambda: self.crear_subcontrato(estado="CERRADO"))

    def test_estados_revision_permitidos(self):
        subcontrato = self.crear_subcontrato()
        for indice, estado in enumerate(
            ("ACTUALIZADO", "DESACTUALIZADO", "PENDIENTE_REVISION", "ERROR"),
            start=1,
        ):
            self.crear_asignacion(
                subcontrato,
                nodo_presupuesto_id=None,
                firma_calculo=str(indice) * 64,
                estado_revision=estado,
            )
        self.db.commit()
        self.assertEqual(self.db.query(SubcontratoRubro).count(), 4)

    def test_rechaza_estado_revision_invalido(self):
        subcontrato = self.crear_subcontrato()
        self.assert_integrity_error(
            lambda: self.crear_asignacion(subcontrato, estado_revision="IGNORADO")
        )

    def test_presets_permitidos_con_configuracion_exacta(self):
        subcontrato = self.crear_subcontrato()
        presets = [
            ("COMPLETO", True, True, True, True),
            ("SOLO_MATERIALES", True, False, False, False),
            ("SOLO_MANO_OBRA", False, True, False, False),
            ("MANO_OBRA_EQUIPOS", False, True, True, False),
            ("MATERIALES_TRANSPORTE", True, False, False, True),
            ("PERSONALIZADO", False, False, True, True),
        ]
        for indice, (preset, materiales, mano_obra, equipos, transporte) in enumerate(presets):
            self.crear_asignacion(
                subcontrato,
                nodo_presupuesto_id=None,
                firma_calculo=f"{indice:x}" * 64,
                preset=preset,
                incluye_materiales=materiales,
                incluye_mano_obra=mano_obra,
                incluye_equipos=equipos,
                incluye_transporte=transporte,
            )
        self.db.commit()
        self.assertEqual(self.db.query(SubcontratoRubro).count(), 6)

    def test_rechaza_preset_invalido(self):
        subcontrato = self.crear_subcontrato()
        self.assert_integrity_error(lambda: self.crear_asignacion(subcontrato, preset="SOLO_OTROS"))

    def test_rechaza_configuracion_vacia(self):
        subcontrato = self.crear_subcontrato()
        self.assert_integrity_error(
            lambda: self.crear_asignacion(
                subcontrato,
                preset="PERSONALIZADO",
                incluye_materiales=False,
                incluye_mano_obra=False,
                incluye_equipos=False,
                incluye_transporte=False,
            )
        )

    def test_rechaza_configuracion_que_no_coincide_con_preset(self):
        subcontrato = self.crear_subcontrato()
        self.assert_integrity_error(
            lambda: self.crear_asignacion(
                subcontrato,
                preset="SOLO_MATERIALES",
                incluye_materiales=True,
                incluye_equipos=True,
            )
        )

    def test_codigo_es_unico_por_proyecto(self):
        self.crear_subcontrato(codigo="SC-001")
        self.db.commit()
        self.assert_integrity_error(lambda: self.crear_subcontrato(codigo="SC-001"))

        otro_proyecto = Proyecto(nombre="Otro proyecto", codigo="SC-OTRO")
        self.db.add(otro_proyecto)
        self.db.flush()
        self.db.add(
            Subcontrato(
                proyecto_id=otro_proyecto.id,
                codigo="SC-001",
                nombre="Código permitido en otro proyecto",
            )
        )
        self.db.commit()

    def test_set_null_conserva_snapshot_al_eliminar_nodo_apu_y_recurso(self):
        subcontrato = self.crear_subcontrato()
        asignacion = self.crear_asignacion(subcontrato)
        snapshot = self.crear_snapshot_recurso(asignacion)
        asignacion_id = asignacion.id
        snapshot_id = snapshot.id
        self.db.commit()

        self.db.delete(self.nodo)
        self.db.delete(self.apu)
        self.db.delete(self.recurso)
        self.db.commit()

        conservada = self.db.get(SubcontratoRubro, asignacion_id)
        recurso_conservado = self.db.get(SubcontratoRubroRecursoSnapshot, snapshot_id)
        self.assertIsNone(conservada.nodo_presupuesto_id)
        self.assertIsNone(conservada.apu_id_snapshot)
        self.assertEqual(conservada.nodo_descripcion_snapshot, "Rubro de prueba")
        self.assertEqual(conservada.apu_nombre_snapshot, "APU subcontrato")
        self.assertIsNone(recurso_conservado.recurso_id)
        self.assertEqual(recurso_conservado.recurso_descripcion_snapshot, "Material subcontrato")

    def test_eliminar_subcontrato_cascada_asignaciones_y_snapshots(self):
        subcontrato = self.crear_subcontrato()
        asignacion = self.crear_asignacion(subcontrato)
        snapshot = self.crear_snapshot_recurso(asignacion)
        asignacion_id = asignacion.id
        snapshot_id = snapshot.id
        self.db.commit()

        self.db.delete(subcontrato)
        self.db.commit()

        self.assertIsNone(self.db.get(SubcontratoRubro, asignacion_id))
        self.assertIsNone(self.db.get(SubcontratoRubroRecursoSnapshot, snapshot_id))

    def test_eliminar_proyecto_cascada_subcontrato_y_secuencia(self):
        subcontrato = self.crear_subcontrato()
        secuencia = SubcontratoCodigoSecuencia(proyecto_id=self.proyecto.id, ultimo_numero=1)
        self.db.add(secuencia)
        self.db.commit()
        subcontrato_id = subcontrato.id
        proyecto_id = self.proyecto.id

        self.db.delete(self.proyecto)
        self.db.commit()

        self.assertIsNone(self.db.get(Subcontrato, subcontrato_id))
        self.assertIsNone(self.db.get(SubcontratoCodigoSecuencia, proyecto_id))


class SubcontratosMigracionTest(unittest.TestCase):
    def test_upgrade_y_downgrade_en_base_temporal(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "subcontratos_migracion.db"
            engine = create_engine(f"sqlite:///{db_path.as_posix()}")
            tablas_previas = [
                tabla
                for tabla in Base.metadata.sorted_tables
                if tabla.name not in TABLAS_SUBCONTRATOS
            ]
            Base.metadata.create_all(bind=engine, tables=tablas_previas)
            with engine.begin() as connection:
                connection.execute(
                    text("CREATE TABLE alembic_version (version_num VARCHAR(64) NOT NULL PRIMARY KEY)")
                )
                connection.execute(
                    text(
                        "INSERT INTO alembic_version (version_num) "
                        "VALUES ('0017_uso_recursos_configuraciones')"
                    )
                )
            engine.dispose()

            config = Config(str(BACKEND / "alembic.ini"))
            config.set_main_option("script_location", str(BACKEND / "alembic"))
            config.set_main_option("sqlalchemy.url", f"sqlite:///{db_path.as_posix()}")

            command.upgrade(config, "0018_subcontratos")
            engine = create_engine(f"sqlite:///{db_path.as_posix()}")
            self.assertTrue(TABLAS_SUBCONTRATOS.issubset(set(inspect(engine).get_table_names())))
            with engine.connect() as connection:
                version = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            self.assertEqual(version, "0018_subcontratos")
            engine.dispose()

            command.downgrade(config, "0017_uso_recursos_configuraciones")
            engine = create_engine(f"sqlite:///{db_path.as_posix()}")
            self.assertTrue(TABLAS_SUBCONTRATOS.isdisjoint(set(inspect(engine).get_table_names())))
            with engine.connect() as connection:
                version = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            self.assertEqual(version, "0017_uso_recursos_configuraciones")
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
