"""agrega paquetes de presupuesto

Revision ID: 0012_paquetes_presupuesto
Revises: 0011_etiquetas_apus_recursos
Create Date: 2026-07-07
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0012_paquetes_presupuesto"
down_revision: Union[str, None] = "0011_etiquetas_apus_recursos"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "paquetes_presupuesto",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("proyecto_id", sa.Integer(), nullable=False),
        sa.Column("nodo_id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=240), nullable=False),
        sa.Column("estado", sa.String(length=30), nullable=False, server_default="activo"),
        sa.Column("observacion", sa.Text(), nullable=True),
        sa.Column("fecha_creacion", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column("fecha_liberacion", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["nodo_id"], ["nodos_presupuesto.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["proyecto_id"], ["proyectos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("proyecto_id", "nodo_id", name="uq_paquetes_presupuesto_proyecto_nodo"),
    )
    op.create_index(op.f("ix_paquetes_presupuesto_id"), "paquetes_presupuesto", ["id"], unique=False)
    op.create_index(op.f("ix_paquetes_presupuesto_nodo_id"), "paquetes_presupuesto", ["nodo_id"], unique=False)
    op.create_index(op.f("ix_paquetes_presupuesto_proyecto_id"), "paquetes_presupuesto", ["proyecto_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_paquetes_presupuesto_proyecto_id"), table_name="paquetes_presupuesto")
    op.drop_index(op.f("ix_paquetes_presupuesto_nodo_id"), table_name="paquetes_presupuesto")
    op.drop_index(op.f("ix_paquetes_presupuesto_id"), table_name="paquetes_presupuesto")
    op.drop_table("paquetes_presupuesto")
