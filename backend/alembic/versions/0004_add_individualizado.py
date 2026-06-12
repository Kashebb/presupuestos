"""add individualizado to nodos_presupuesto

Revision ID: 0004_add_individualizado
Revises: 0003_add_presupuestos
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_add_individualizado"
down_revision = "0003_add_presupuestos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "nodos_presupuesto",
        sa.Column("individualizado", sa.Boolean(), nullable=True, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("nodos_presupuesto", "individualizado")