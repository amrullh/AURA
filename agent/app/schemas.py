"""Kontrak request/response `POST /process`.

Bentuk sama dengan `InvoiceDetail` (bagian extraction..finding) di
docs/api/openapi.yaml dan contoh di docs/ai/examples/. Bagian yang tidak
relevan bernilai null, bukan dihilangkan.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------- Request ----------

class Settings(BaseModel):
    price_tolerance_pct: float
    confidence_threshold: float
    max_iterations: int


class ProcessRequest(BaseModel):
    invoice_id: str
    file_name: str
    content_type: str
    file_base64: str
    settings: Settings


# ---------- Bagian response ----------

class InvoiceInfo(BaseModel):
    invoice_number: Optional[str] = None
    vendor_id: Optional[str] = None
    vendor_name: Optional[str] = None
    po_number: Optional[str] = None
    invoice_date: Optional[str] = None
    total_amount: Optional[int] = None


class ExtractionField(BaseModel):
    key: str
    label: str
    value: str
    confidence: float


class Extraction(BaseModel):
    fields: list[ExtractionField]


class Diff(BaseModel):
    type: Literal["PRICE", "QUANTITY", "ITEM"]
    expected: int
    actual: int
    delta: int
    delta_pct: Optional[float] = None
    within_tolerance: bool


class PoSide(BaseModel):
    quantity: Optional[int] = None
    unit_price: Optional[int] = None


class GrnSide(BaseModel):
    quantity_received: Optional[int] = None


class InvoiceSide(BaseModel):
    quantity: int
    unit_price: int


class ComparisonLine(BaseModel):
    line_no: int
    item_name: str
    po: Optional[PoSide] = None
    grn: Optional[GrnSide] = None
    invoice: InvoiceSide
    status: Literal["MATCH", "MISMATCH"]
    diffs: list[Diff]


class ComparisonTotals(BaseModel):
    po_total: int
    grn_total_at_po_price: int
    invoice_total: int
    difference: int


class Comparison(BaseModel):
    tolerance_pct: float
    lines: list[ComparisonLine]
    totals: ComparisonTotals


class TaxItem(BaseModel):
    key: str
    label: str
    result: Literal["PASS", "FAIL", "NA"]
    detail: Optional[str] = None


class TaxCheck(BaseModel):
    items: list[TaxItem]


class Duplicate(BaseModel):
    original_invoice_id: str
    original_invoice_number: str
    original_total_amount: int
    original_created_at: str
    match_basis: list[str]


class InvestigationStep(BaseModel):
    step: int
    hypothesis: str
    tool: str
    tool_args_summary: Optional[str] = None
    result_summary: str
    duration_ms: Optional[int] = None


class Investigation(BaseModel):
    iterations: int
    max_iterations: int
    steps: list[InvestigationStep]


class Label(BaseModel):
    type: Literal["FACT", "HYPOTHESIS"]
    text: str


class Evidence(BaseModel):
    source_type: Literal["PO", "GRN", "CONTRACT", "INVOICE"]
    source_ref: str
    page: Optional[int] = None
    quote: str


class Finding(BaseModel):
    summary: str
    recommendation: str
    confidence: float
    labels: list[Label]
    evidence: list[Evidence]


# ---------- Response akhir ----------

class AgentResult(BaseModel):
    invoice: InvoiceInfo
    verdict: Literal["CLEAN", "EXCEPTION", "DUPLICATE", "NEEDS_REVIEW"]
    confidence: float = Field(ge=0, le=1)
    difference_amount: Optional[int] = None
    iterations: int = Field(ge=0, le=3)
    review_reason: Optional[str] = None
    extraction: Optional[Extraction] = None
    comparison: Optional[Comparison] = None
    tax_check: Optional[TaxCheck] = None
    duplicate: Optional[Duplicate] = None
    investigation: Optional[Investigation] = None
    finding: Optional[Finding] = None
