"""nivel dinamico presupuesto

Revision ID: 0008_nivel_dinamico_presupuesto
Revises: 0007_edicion_manual_presupuesto
Create Date: 2026-06-20
"""
from alembic import op
import sqlalchemy as sa

revision = "0008_nivel_dinamico_presupuesto"
down_revision = "0007_edicion_manual_presupuesto"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("nodos_presupuesto", sa.Column("tipo_origen", sa.String(length=20), nullable=True))
    op.add_column("nodos_presupuesto", sa.Column("nivel", sa.Integer(), nullable=True))
    op.add_column(
        "nodos_presupuesto",
        sa.Column("activo_como_rubro", sa.Boolean(), nullable=True, server_default=sa.true()),
    )

    op.execute("UPDATE nodos_presupuesto SET tipo_origen = tipo WHERE tipo_origen IS NULL")
    op.execute(
        """
        UPDATE nodos_presupuesto
        SET nivel = CASE tipo
            WHEN 'FASE' THEN 0
            WHEN 'CATEGORIA' THEN 1
            WHEN 'SUBCATEGORIA' THEN 2
            WHEN 'CAPITULO' THEN 3
            WHEN 'SUBCAPITULO' THEN 4
            WHEN 'GRUPO' THEN 5
            WHEN 'RUBRO' THEN 6
            ELSE 0
        END
        WHERE nivel IS NULL
        """
    )
    op.execute(
        """
        UPDATE nodos_presupuesto
        SET activo_como_rubro = CASE
            WHEN EXISTS (
                SELECT 1
                FROM nodos_presupuesto hijos
                WHERE hijos.padre_id = nodos_presupuesto.id
            ) THEN 0
            ELSE 1
        END
        """
    )

    op.create_index("ix_nodos_presupuesto_nivel", "nodos_presupuesto", ["nivel"], unique=False)
    op.create_index(
        "ix_nodos_presupuesto_activo_como_rubro",
        "nodos_presupuesto",
        ["activo_como_rubro"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_nodos_presupuesto_activo_como_rubro", table_name="nodos_presupuesto")
    op.drop_index("ix_nodos_presupuesto_nivel", table_name="nodos_presupuesto")
    op.drop_column("nodos_presupuesto", "activo_como_rubro")
    op.drop_column("nodos_presupuesto", "nivel")
    op.drop_column("nodos_presupuesto", "tipo_origen")
