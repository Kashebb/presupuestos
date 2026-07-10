"""agrega configuraciones guardadas para uso de recursos

Revision ID: 0017_uso_recursos_configuraciones
Revises: 0016_precio_subcontratado_nodos
Create Date: 2026-07-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0017_uso_recursos_configuraciones"
down_revision: Union[str, None] = "0016_precio_subcontratado_nodos"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "uso_recursos_configuraciones",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("proyecto_id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=160), nullable=False),
        sa.Column("configuracion_json", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("fecha_creacion", sa.DateTime(), nullable=False),
        sa.Column("fecha_actualizacion", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["proyecto_id"], ["proyectos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("proyecto_id", "nombre", name="uq_uso_recursos_configuracion_proyecto_nombre"),
    )
    op.create_index(op.f("ix_uso_recursos_configuraciones_id"), "uso_recursos_configuraciones", ["id"], unique=False)
    op.create_index("ix_uso_recursos_configuraciones_proyecto_id", "uso_recursos_configuraciones", ["proyecto_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_uso_recursos_configuraciones_proyecto_id", table_name="uso_recursos_configuraciones")
    op.drop_index(op.f("ix_uso_recursos_configuraciones_id"), table_name="uso_recursos_configuraciones")
    op.drop_table("uso_recursos_configuraciones")
