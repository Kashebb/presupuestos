"""agrega dominio y snapshots del modulo subcontratos

Revision ID: 0018_subcontratos
Revises: 0017_uso_recursos_configuraciones
Create Date: 2026-07-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0018_subcontratos"
down_revision: Union[str, None] = "0017_uso_recursos_configuraciones"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subcontratos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("proyecto_id", sa.Integer(), nullable=False),
        sa.Column("codigo", sa.String(length=30), nullable=False),
        sa.Column("nombre", sa.String(length=200), nullable=False),
        sa.Column("contratista", sa.String(length=250), nullable=True),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="BORRADOR"),
        sa.Column("fecha_confirmacion", sa.DateTime(), nullable=True),
        sa.Column("fecha_anulacion", sa.DateTime(), nullable=True),
        sa.Column("fecha_creacion", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column("fecha_actualizacion", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.CheckConstraint(
            "estado IN ('BORRADOR', 'CONFIRMADO', 'ANULADO')",
            name="ck_subcontratos_estado",
        ),
        sa.ForeignKeyConstraint(["proyecto_id"], ["proyectos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("proyecto_id", "codigo", name="uq_subcontratos_proyecto_codigo"),
    )
    op.create_index("ix_subcontratos_id", "subcontratos", ["id"], unique=False)
    op.create_index("ix_subcontratos_proyecto_id", "subcontratos", ["proyecto_id"], unique=False)
    op.create_index("ix_subcontratos_proyecto_estado", "subcontratos", ["proyecto_id", "estado"], unique=False)
    op.create_index(
        "ix_subcontratos_proyecto_fecha_actualizacion",
        "subcontratos",
        ["proyecto_id", "fecha_actualizacion"],
        unique=False,
    )

    op.create_table(
        "subcontrato_codigo_secuencias",
        sa.Column("proyecto_id", sa.Integer(), nullable=False),
        sa.Column("ultimo_numero", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint(
            "ultimo_numero >= 0",
            name="ck_subcontrato_codigo_secuencias_no_negativo",
        ),
        sa.ForeignKeyConstraint(["proyecto_id"], ["proyectos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("proyecto_id"),
    )

    op.create_table(
        "subcontrato_rubros",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("subcontrato_id", sa.Integer(), nullable=False),
        sa.Column("nodo_presupuesto_id", sa.Integer(), nullable=True),
        sa.Column("apu_id_snapshot", sa.Integer(), nullable=True),
        sa.Column("nodo_item_snapshot", sa.String(length=60), nullable=True),
        sa.Column("nodo_descripcion_snapshot", sa.String(length=500), nullable=False),
        sa.Column("nodo_unidad_snapshot", sa.String(length=20), nullable=True),
        sa.Column("apu_codigo_snapshot", sa.String(), nullable=True),
        sa.Column("apu_nombre_snapshot", sa.String(), nullable=False),
        sa.Column("preset", sa.String(length=30), nullable=False),
        sa.Column("incluye_materiales", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("incluye_mano_obra", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("incluye_equipos", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("incluye_transporte", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("metrado_snapshot", sa.Float(), nullable=False),
        sa.Column("pu_materiales_snapshot", sa.Float(), nullable=False, server_default="0"),
        sa.Column("pu_mano_obra_snapshot", sa.Float(), nullable=False, server_default="0"),
        sa.Column("pu_herramientas_snapshot", sa.Float(), nullable=False, server_default="0"),
        sa.Column("pu_equipos_snapshot", sa.Float(), nullable=False, server_default="0"),
        sa.Column("pu_transporte_snapshot", sa.Float(), nullable=False, server_default="0"),
        sa.Column("pu_seleccionado_snapshot", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_snapshot", sa.Float(), nullable=False, server_default="0"),
        sa.Column("firma_calculo", sa.String(length=64), nullable=False),
        sa.Column("estado_revision", sa.String(length=30), nullable=False, server_default="ACTUALIZADO"),
        sa.Column("fecha_creacion", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column("fecha_actualizacion", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.CheckConstraint(
            "preset IN ('COMPLETO', 'SOLO_MATERIALES', 'SOLO_MANO_OBRA', "
            "'MANO_OBRA_EQUIPOS', 'MATERIALES_TRANSPORTE', 'PERSONALIZADO')",
            name="ck_subcontrato_rubros_preset",
        ),
        sa.CheckConstraint(
            "estado_revision IN ('ACTUALIZADO', 'DESACTUALIZADO', 'PENDIENTE_REVISION', 'ERROR')",
            name="ck_subcontrato_rubros_estado_revision",
        ),
        sa.CheckConstraint(
            "incluye_materiales OR incluye_mano_obra OR "
            "incluye_equipos OR incluye_transporte",
            name="ck_subcontrato_rubros_categoria_seleccionada",
        ),
        sa.CheckConstraint(
            "(preset = 'COMPLETO' AND incluye_materiales AND incluye_mano_obra "
            "AND incluye_equipos AND incluye_transporte) OR "
            "(preset = 'SOLO_MATERIALES' AND incluye_materiales AND NOT incluye_mano_obra "
            "AND NOT incluye_equipos AND NOT incluye_transporte) OR "
            "(preset = 'SOLO_MANO_OBRA' AND NOT incluye_materiales AND incluye_mano_obra "
            "AND NOT incluye_equipos AND NOT incluye_transporte) OR "
            "(preset = 'MANO_OBRA_EQUIPOS' AND NOT incluye_materiales AND incluye_mano_obra "
            "AND incluye_equipos AND NOT incluye_transporte) OR "
            "(preset = 'MATERIALES_TRANSPORTE' AND incluye_materiales AND NOT incluye_mano_obra "
            "AND NOT incluye_equipos AND incluye_transporte) OR "
            "preset = 'PERSONALIZADO'",
            name="ck_subcontrato_rubros_configuracion_preset",
        ),
        sa.CheckConstraint("metrado_snapshot >= 0", name="ck_subcontrato_rubros_metrado_no_negativo"),
        sa.CheckConstraint(
            "pu_materiales_snapshot >= 0 AND pu_mano_obra_snapshot >= 0 "
            "AND pu_herramientas_snapshot >= 0 AND pu_equipos_snapshot >= 0 "
            "AND pu_transporte_snapshot >= 0 AND pu_seleccionado_snapshot >= 0 "
            "AND total_snapshot >= 0",
            name="ck_subcontrato_rubros_importes_no_negativos",
        ),
        sa.ForeignKeyConstraint(["apu_id_snapshot"], ["apus.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["nodo_presupuesto_id"], ["nodos_presupuesto.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["subcontrato_id"], ["subcontratos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_subcontrato_rubros_id", "subcontrato_rubros", ["id"], unique=False)
    op.create_index("ix_subcontrato_rubros_subcontrato_id", "subcontrato_rubros", ["subcontrato_id"], unique=False)
    op.create_index("ix_subcontrato_rubros_nodo_presupuesto_id", "subcontrato_rubros", ["nodo_presupuesto_id"], unique=False)
    op.create_index("ix_subcontrato_rubros_apu_id_snapshot", "subcontrato_rubros", ["apu_id_snapshot"], unique=False)
    op.create_index("ix_subcontrato_rubros_firma_calculo", "subcontrato_rubros", ["firma_calculo"], unique=False)
    op.create_index(
        "ix_subcontrato_rubros_subcontrato_estado",
        "subcontrato_rubros",
        ["subcontrato_id", "estado_revision"],
        unique=False,
    )

    op.create_table(
        "subcontrato_rubro_recursos_snapshot",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("subcontrato_rubro_id", sa.Integer(), nullable=False),
        sa.Column("recurso_id", sa.Integer(), nullable=True),
        sa.Column("recurso_codigo_snapshot", sa.String(), nullable=True),
        sa.Column("recurso_descripcion_snapshot", sa.String(), nullable=False),
        sa.Column("recurso_unidad_snapshot", sa.String(), nullable=True),
        sa.Column("recurso_categoria_snapshot", sa.String(length=30), nullable=False),
        sa.Column("cantidad_unitaria_snapshot", sa.Float(), nullable=False),
        sa.Column("metrado_snapshot", sa.Float(), nullable=False),
        sa.Column("cantidad_total_snapshot", sa.Float(), nullable=False),
        sa.Column("incluido_subcontrato", sa.Boolean(), nullable=False),
        sa.Column("fecha_creacion", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.CheckConstraint(
            "recurso_categoria_snapshot IN ('material', 'mano_de_obra', 'equipo', 'transporte')",
            name="ck_subcontrato_rubro_recursos_categoria",
        ),
        sa.CheckConstraint(
            "cantidad_unitaria_snapshot >= 0 AND metrado_snapshot >= 0 "
            "AND cantidad_total_snapshot >= 0",
            name="ck_subcontrato_rubro_recursos_cantidades_no_negativas",
        ),
        sa.ForeignKeyConstraint(["recurso_id"], ["recursos.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["subcontrato_rubro_id"],
            ["subcontrato_rubros.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_subcontrato_rubro_recursos_snapshot_id",
        "subcontrato_rubro_recursos_snapshot",
        ["id"],
        unique=False,
    )
    op.create_index(
        "ix_subcontrato_rubro_recursos_snapshot_subcontrato_rubro_id",
        "subcontrato_rubro_recursos_snapshot",
        ["subcontrato_rubro_id"],
        unique=False,
    )
    op.create_index(
        "ix_subcontrato_rubro_recursos_snapshot_recurso_id",
        "subcontrato_rubro_recursos_snapshot",
        ["recurso_id"],
        unique=False,
    )
    op.create_index(
        "ix_subcontrato_rubro_recursos_asignacion_categoria_incluido",
        "subcontrato_rubro_recursos_snapshot",
        ["subcontrato_rubro_id", "recurso_categoria_snapshot", "incluido_subcontrato"],
        unique=False,
    )
    op.create_index(
        "ix_subcontrato_rubro_recursos_recurso_unidad",
        "subcontrato_rubro_recursos_snapshot",
        ["recurso_id", "recurso_unidad_snapshot"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_subcontrato_rubro_recursos_recurso_unidad",
        table_name="subcontrato_rubro_recursos_snapshot",
    )
    op.drop_index(
        "ix_subcontrato_rubro_recursos_asignacion_categoria_incluido",
        table_name="subcontrato_rubro_recursos_snapshot",
    )
    op.drop_index(
        "ix_subcontrato_rubro_recursos_snapshot_recurso_id",
        table_name="subcontrato_rubro_recursos_snapshot",
    )
    op.drop_index(
        "ix_subcontrato_rubro_recursos_snapshot_subcontrato_rubro_id",
        table_name="subcontrato_rubro_recursos_snapshot",
    )
    op.drop_index(
        "ix_subcontrato_rubro_recursos_snapshot_id",
        table_name="subcontrato_rubro_recursos_snapshot",
    )
    op.drop_table("subcontrato_rubro_recursos_snapshot")

    op.drop_index("ix_subcontrato_rubros_subcontrato_estado", table_name="subcontrato_rubros")
    op.drop_index("ix_subcontrato_rubros_firma_calculo", table_name="subcontrato_rubros")
    op.drop_index("ix_subcontrato_rubros_apu_id_snapshot", table_name="subcontrato_rubros")
    op.drop_index("ix_subcontrato_rubros_nodo_presupuesto_id", table_name="subcontrato_rubros")
    op.drop_index("ix_subcontrato_rubros_subcontrato_id", table_name="subcontrato_rubros")
    op.drop_index("ix_subcontrato_rubros_id", table_name="subcontrato_rubros")
    op.drop_table("subcontrato_rubros")

    op.drop_table("subcontrato_codigo_secuencias")

    op.drop_index("ix_subcontratos_proyecto_fecha_actualizacion", table_name="subcontratos")
    op.drop_index("ix_subcontratos_proyecto_estado", table_name="subcontratos")
    op.drop_index("ix_subcontratos_proyecto_id", table_name="subcontratos")
    op.drop_index("ix_subcontratos_id", table_name="subcontratos")
    op.drop_table("subcontratos")
