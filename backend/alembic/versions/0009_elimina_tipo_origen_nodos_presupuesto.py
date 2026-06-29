"""elimina tipo_origen de nodos_presupuesto

Revision ID: 0009_elimina_tipo_origen_nodos_presupuesto
Revises: 0008_nivel_dinamico_presupuesto
Create Date: 2026-06-29
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0009_elimina_tipo_origen_nodos_presupuesto"
down_revision: Union[str, None] = "0008_nivel_dinamico_presupuesto"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("nodos_presupuesto") as batch_op:
        batch_op.drop_column("tipo_origen")


def downgrade() -> None:
    with op.batch_alter_table("nodos_presupuesto") as batch_op:
        batch_op.add_column(sa.Column("tipo_origen", sa.String(length=20), nullable=True))

    op.execute("UPDATE nodos_presupuesto SET tipo_origen = tipo WHERE tipo_origen IS NULL")
