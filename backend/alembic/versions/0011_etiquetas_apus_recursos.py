"""agrega etiquetas controladas a apus y recursos

Revision ID: 0011_etiquetas_apus_recursos
Revises: 0010_variantes_apu
Create Date: 2026-07-07
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0011_etiquetas_apus_recursos"
down_revision: Union[str, None] = "0010_variantes_apu"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("apus") as batch_op:
        batch_op.add_column(sa.Column("etiquetas", sa.JSON(), nullable=False, server_default="[]"))

    with op.batch_alter_table("recursos") as batch_op:
        batch_op.add_column(sa.Column("etiquetas", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    with op.batch_alter_table("recursos") as batch_op:
        batch_op.drop_column("etiquetas")

    with op.batch_alter_table("apus") as batch_op:
        batch_op.drop_column("etiquetas")
