"""revision apu por rubro

Revision ID: 0015_revision_apu_por_rubro
Revises: 0014_plantillas_apu
Create Date: 2026-07-08
"""

from typing import Union

import sqlalchemy as sa
from alembic import op


revision: str = "0015_revision_apu_por_rubro"
down_revision: Union[str, None] = "0014_plantillas_apu"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.create_table(
        "nodo_apu_revisiones",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nodo_id", sa.Integer(), nullable=False),
        sa.Column("apu_id", sa.Integer(), nullable=True),
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="validado"),
        sa.Column("firma_revision", sa.String(length=64), nullable=False),
        sa.Column("snapshot_descripcion", sa.String(length=500), nullable=True),
        sa.Column("snapshot_unidad", sa.String(length=20), nullable=True),
        sa.Column("snapshot_apu_id", sa.Integer(), nullable=True),
        sa.Column("fecha_creacion", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.ForeignKeyConstraint(["apu_id"], ["apus.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["nodo_id"], ["nodos_presupuesto.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_nodo_apu_revisiones_id", "nodo_apu_revisiones", ["id"], unique=False)
    op.create_index("ix_nodo_apu_revisiones_nodo_id", "nodo_apu_revisiones", ["nodo_id"], unique=False)
    op.create_index("ix_nodo_apu_revisiones_apu_id", "nodo_apu_revisiones", ["apu_id"], unique=False)
    op.create_index("ix_nodo_apu_revisiones_firma_revision", "nodo_apu_revisiones", ["firma_revision"], unique=False)

    op.create_table(
        "nodo_apu_revision_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("revision_id", sa.Integer(), nullable=False),
        sa.Column("codigo_motivo", sa.String(length=80), nullable=False),
        sa.Column("descripcion_motivo", sa.Text(), nullable=False),
        sa.Column("aprobado", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("comentario", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["revision_id"], ["nodo_apu_revisiones.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_nodo_apu_revision_items_id", "nodo_apu_revision_items", ["id"], unique=False)
    op.create_index("ix_nodo_apu_revision_items_revision_id", "nodo_apu_revision_items", ["revision_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_nodo_apu_revision_items_revision_id", table_name="nodo_apu_revision_items")
    op.drop_index("ix_nodo_apu_revision_items_id", table_name="nodo_apu_revision_items")
    op.drop_table("nodo_apu_revision_items")

    op.drop_index("ix_nodo_apu_revisiones_firma_revision", table_name="nodo_apu_revisiones")
    op.drop_index("ix_nodo_apu_revisiones_apu_id", table_name="nodo_apu_revisiones")
    op.drop_index("ix_nodo_apu_revisiones_nodo_id", table_name="nodo_apu_revisiones")
    op.drop_index("ix_nodo_apu_revisiones_id", table_name="nodo_apu_revisiones")
    op.drop_table("nodo_apu_revisiones")
