"""Koneksi PostgreSQL baca-saja (user agent_ro). Agent tidak pernah menulis."""
from __future__ import annotations

import os

import psycopg


def get_db_url() -> str:
    return os.environ.get(
        "AGENT_DB_URL",
        "postgresql://agent_ro:ganti-sandi-agent@localhost:5432/invoice_agent",
    )


def connect() -> psycopg.Connection:
    return psycopg.connect(get_db_url(), autocommit=True)
