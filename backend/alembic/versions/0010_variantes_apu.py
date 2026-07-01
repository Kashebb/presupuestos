"""agrega variantes de apu por proyecto

Revision ID: 0010_variantes_apu
Revises: 0009_elimina_tipo_origen_nodos_presupuesto
Create Date: 2026-07-01
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0010_variantes_apu"
down_revision: Union[str, None] = "0009_elimina_tipo_origen_nodos_presupuesto"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("apus") as batch_op:
        batch_op.add_column(sa.Column("es_variante", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("apu_base_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("proyecto_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("variante_nombre", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("copiado_desde_apu_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key("fk_apus_apu_base_id", "apus", ["apu_base_id"], ["id"], ondelete="CASCADE")
        batch_op.create_foreign_key("fk_apus_copiado_desde_apu_id", "apus", ["copiado_desde_apu_id"], ["id"], ondelete="SET NULL")
        batch_op.create_foreign_key("fk_apus_proyecto_id", "proyectos", ["proyecto_id"], ["id"], ondelete="CASCADE")
        batch_op.create_index("ix_apus_base_proyecto", ["apu_base_id", "proyecto_id"])
        batch_op.create_unique_constraint("uq_apus_variante_proyecto_base_nombre", ["proyecto_id", "apu_base_id", "variante_nombre"])


def downgrade() -> None:
    with op.batch_alter_table("apus") as batch_op:
        batch_op.drop_constraint("uq_apus_variante_proyecto_base_nombre", type_="unique")
        batch_op.drop_index("ix_apus_base_proyecto")
        batch_op.drop_constraint("fk_apus_proyecto_id", type_="foreignkey")
        batch_op.drop_constraint("fk_apus_copiado_desde_apu_id", type_="foreignkey")
        batch_op.drop_constraint("fk_apus_apu_base_id", type_="foreignkey")
        batch_op.drop_column("copiado_desde_apu_id")
        batch_op.drop_column("variante_nombre")
        batch_op.drop_column("proyecto_id")
        batch_op.drop_column("apu_base_id")
        batch_op.drop_column("es_variante")
