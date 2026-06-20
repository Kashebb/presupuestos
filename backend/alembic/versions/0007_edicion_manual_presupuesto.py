"""edicion manual presupuesto

Revision ID: 0007_edicion_manual_presupuesto
Revises: 0006_add_recurso_validacion
Create Date: 2026-06-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0007_edicion_manual_presupuesto"
down_revision = "0006_add_recurso_validacion"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "nodos_presupuesto",
        sa.Column("origen_edicion", sa.String(length=30), nullable=True, server_default="importado"),
    )
    op.add_column(
        "nodos_presupuesto",
        sa.Column("requiere_revision_apu", sa.Boolean(), nullable=True, server_default=sa.false()),
    )
    op.add_column(
        "nodos_presupuesto",
        sa.Column("fecha_edicion_manual", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_nodos_presupuesto_origen_edicion",
        "nodos_presupuesto",
        ["origen_edicion"],
        unique=False,
    )
    op.create_index(
        "ix_nodos_presupuesto_revision_apu",
        "nodos_presupuesto",
        ["requiere_revision_apu"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_nodos_presupuesto_revision_apu", table_name="nodos_presupuesto")
    op.drop_index("ix_nodos_presupuesto_origen_edicion", table_name="nodos_presupuesto")
    op.drop_column("nodos_presupuesto", "fecha_edicion_manual")
    op.drop_column("nodos_presupuesto", "requiere_revision_apu")
    op.drop_column("nodos_presupuesto", "origen_edicion")
