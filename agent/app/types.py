"""Tipe data bersama antar modul (dipisah agar tidak ada impor melingkar)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Field:
    key: str
    label: str
    value: str
    confidence: float


@dataclass
class InvLine:
    name: str
    quantity: int
    unit_price: int


@dataclass
class ExtractionResult:
    fields: list[Field] = field(default_factory=list)
    lines: list[InvLine] = field(default_factory=list)
    subtotal: Optional[int] = None
    ppn_pct: Optional[float] = None
    ppn_amount: Optional[int] = None
    total: Optional[int] = None
    raw_text: str = ""

    def get(self, key: str) -> Optional[str]:
        for f in self.fields:
            if f.key == key:
                return f.value
        return None
