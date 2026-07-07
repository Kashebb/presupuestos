"""agrega recursos especificos de proyecto

Revision ID: 0013_recursos_proyecto
Revises: 0012_paquetes_presupuesto
Create Date: 2026-07-07
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0013_recursos_proyecto"
down_revision: Union[str, None] = "0012_paquetes_presupuesto"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("recursos") as batch_op:
        batch_op.add_column(sa.Column("proyecto_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("recurso_base_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key("fk_recursos_proyecto_id", "proyectos", ["proyecto_id"], ["id"], ondelete="CASCADE")
        batch_op.create_foreign_key("fk_recursos_recurso_base_id", "recursos", ["recurso_base_id"], ["id"], ondelete="SET NULL")
        batch_op.create_index("ix_recursos_proyecto_id", ["proyecto_id"])
        batch_op.create_index("ix_recursos_recurso_base_id", ["recurso_base_id"])


def downgrade() -> None:
    with op.batch_alter_table("recursos") as batch_op:
        batch_op.drop_index("ix_recursos_recurso_base_id")
        batch_op.drop_index("ix_recursos_proyecto_id")
        batch_op.drop_constraint("fk_recursos_recurso_base_id", type_="foreignkey")
        batch_op.drop_constraint("fk_recursos_proyecto_id", type_="foreignkey")
        batch_op.drop_column("recurso_base_id")
        batch_op.drop_column("proyecto_id")
