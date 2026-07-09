"""agrega precio subcontratado a nodos

Revision ID: 0016_precio_subcontratado_nodos
Revises: 0015_revision_apu_por_rubro
Create Date: 2026-07-09 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0016_precio_subcontratado_nodos"
down_revision: Union[str, None] = "0015_revision_apu_por_rubro"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "nodos_presupuesto",
        sa.Column("precio_unitario_subcontratado", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("nodos_presupuesto", "precio_unitario_subcontratado")
