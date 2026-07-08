"""agrega plantillas para armar apus

Revision ID: 0014_plantillas_apu
Revises: 0013_recursos_proyecto
Create Date: 2026-07-08
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0014_plantillas_apu"
down_revision: Union[str, None] = "0013_recursos_proyecto"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "apu_plantillas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(), nullable=False),
        sa.Column("descripcion", sa.String(), nullable=True),
        sa.Column("tipo", sa.String(), nullable=False, server_default="mixta"),
        sa.Column("etiquetas", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("rendimiento_sugerido", sa.Float(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("origen_apu_id", sa.Integer(), nullable=True),
        sa.Column("fecha_creacion", sa.DateTime(), nullable=True),
        sa.Column("fecha_actualizacion", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["origen_apu_id"], ["apus.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_apu_plantillas_id"), "apu_plantillas", ["id"], unique=False)
    op.create_index(op.f("ix_apu_plantillas_nombre"), "apu_plantillas", ["nombre"], unique=False)

    op.create_table(
        "apu_plantilla_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("plantilla_id", sa.Integer(), nullable=False),
        sa.Column("recurso_id", sa.Integer(), nullable=True),
        sa.Column("categoria", sa.String(), nullable=False),
        sa.Column("cantidad", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("orden", sa.Integer(), nullable=True, server_default="0"),
        sa.ForeignKeyConstraint(["plantilla_id"], ["apu_plantillas.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recurso_id"], ["recursos.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_apu_plantilla_items_id"), "apu_plantilla_items", ["id"], unique=False)
    op.create_index("ix_apu_plantilla_items_plantilla_id", "apu_plantilla_items", ["plantilla_id"], unique=False)

    op.create_table(
        "apu_plantilla_usos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("apu_id", sa.Integer(), nullable=False),
        sa.Column("plantilla_id", sa.Integer(), nullable=True),
        sa.Column("modo", sa.String(), nullable=False, server_default="agregar"),
        sa.Column("usar_rendimiento", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("snapshot_json", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("fecha_uso", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.ForeignKeyConstraint(["apu_id"], ["apus.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["plantilla_id"], ["apu_plantillas.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_apu_plantilla_usos_id"), "apu_plantilla_usos", ["id"], unique=False)
    op.create_index("ix_apu_plantilla_usos_apu_id", "apu_plantilla_usos", ["apu_id"], unique=False)
    op.create_index("ix_apu_plantilla_usos_plantilla_id", "apu_plantilla_usos", ["plantilla_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_apu_plantilla_usos_plantilla_id", table_name="apu_plantilla_usos")
    op.drop_index("ix_apu_plantilla_usos_apu_id", table_name="apu_plantilla_usos")
    op.drop_index(op.f("ix_apu_plantilla_usos_id"), table_name="apu_plantilla_usos")
    op.drop_table("apu_plantilla_usos")

    op.drop_index("ix_apu_plantilla_items_plantilla_id", table_name="apu_plantilla_items")
    op.drop_index(op.f("ix_apu_plantilla_items_id"), table_name="apu_plantilla_items")
    op.drop_table("apu_plantilla_items")

    op.drop_index(op.f("ix_apu_plantillas_nombre"), table_name="apu_plantillas")
    op.drop_index(op.f("ix_apu_plantillas_id"), table_name="apu_plantillas")
    op.drop_table("apu_plantillas")
