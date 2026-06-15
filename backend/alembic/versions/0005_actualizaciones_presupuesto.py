"""actualizaciones presupuesto

Revision ID: 0005_actualizaciones_presupuesto
Revises: 0004_add_individualizado
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_actualizaciones_presupuesto"
down_revision = "0004_add_individualizado"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "actualizaciones_presupuesto_lotes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("proyecto_id", sa.Integer(), nullable=False),
        sa.Column("archivo", sa.String(length=260), nullable=True),
        sa.Column("hoja", sa.String(length=120), nullable=False),
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="aplicado"),
        sa.Column("total_nodos_excel", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("total_rubros_excel", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("total_nodos_antes", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("total_rubros_antes", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("total_nodos_creados", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("total_rubros_actualizados", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("total_obsoletos_marcados", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("total_excepciones", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("resumen_json", sa.Text(), nullable=True),
        sa.Column("fecha_creacion", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["proyecto_id"], ["proyectos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_actualizaciones_presupuesto_lotes_id"),
        "actualizaciones_presupuesto_lotes",
        ["id"],
        unique=False,
    )
    op.create_index(
        "ix_actualizaciones_presupuesto_lotes_proyecto",
        "actualizaciones_presupuesto_lotes",
        ["proyecto_id"],
        unique=False,
    )

    op.add_column(
        "nodos_presupuesto",
        sa.Column("estado_actualizacion", sa.String(length=20), nullable=True, server_default="activo"),
    )
    op.add_column("nodos_presupuesto", sa.Column("actualizacion_lote_id", sa.Integer(), nullable=True))
    op.add_column("nodos_presupuesto", sa.Column("excel_fila", sa.Integer(), nullable=True))
    op.add_column("nodos_presupuesto", sa.Column("excel_hoja", sa.String(length=120), nullable=True))
    op.add_column("nodos_presupuesto", sa.Column("excel_archivo", sa.String(length=260), nullable=True))
    op.add_column("nodos_presupuesto", sa.Column("fecha_actualizacion_fuente", sa.DateTime(), nullable=True))
    op.create_index(
        "ix_nodos_presupuesto_actualizacion_lote",
        "nodos_presupuesto",
        ["actualizacion_lote_id"],
        unique=False,
    )
    op.create_index(
        "ix_nodos_presupuesto_estado_actualizacion",
        "nodos_presupuesto",
        ["estado_actualizacion"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_nodos_presupuesto_estado_actualizacion", table_name="nodos_presupuesto")
    op.drop_index("ix_nodos_presupuesto_actualizacion_lote", table_name="nodos_presupuesto")
    op.drop_column("nodos_presupuesto", "fecha_actualizacion_fuente")
    op.drop_column("nodos_presupuesto", "excel_archivo")
    op.drop_column("nodos_presupuesto", "excel_hoja")
    op.drop_column("nodos_presupuesto", "excel_fila")
    op.drop_column("nodos_presupuesto", "actualizacion_lote_id")
    op.drop_column("nodos_presupuesto", "estado_actualizacion")
    op.drop_index("ix_actualizaciones_presupuesto_lotes_proyecto", table_name="actualizaciones_presupuesto_lotes")
    op.drop_index(op.f("ix_actualizaciones_presupuesto_lotes_id"), table_name="actualizaciones_presupuesto_lotes")
    op.drop_table("actualizaciones_presupuesto_lotes")
