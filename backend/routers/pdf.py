"""Generic HTML → PDF API for internal and external callers."""

from __future__ import annotations

import re
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator

from backend.config import PDF_API_KEY, PDF_MAX_HTML_BYTES
from backend.services import pdf_service
from backend.utils.logger import logger

router = APIRouter(prefix="/pdf", tags=["PDF"])

_SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._-]+")
# CSS length: 0, 1cm, 0.5in, 12pt, 10mm, 2%
_CSS_LENGTH = re.compile(
    r"^(?:0|(?:\d+(?:\.\d+)?)(?:cm|mm|in|pt|px|%))$",
    re.IGNORECASE,
)
# Shorthand: "1cm", "1cm 2cm", "1cm 2cm 1cm 2cm"
_CSS_MARGIN_SHORTHAND = re.compile(
    r"^(?:0|(?:\d+(?:\.\d+)?)(?:cm|mm|in|pt|px|%))"
    r"(?:\s+(?:0|(?:\d+(?:\.\d+)?)(?:cm|mm|in|pt|px|%))){0,3}$",
    re.IGNORECASE,
)
_PAGE_SIZE = re.compile(
    r"^(?:A[3-6]|Letter|Legal|(?:\d+(?:\.\d+)?)(?:cm|mm|in)\s+(?:\d+(?:\.\d+)?)(?:cm|mm|in))$",
    re.IGNORECASE,
)
_MAX_EXTRA_CSS_BYTES = 50_000


class HtmlToPdfRequest(BaseModel):
    html: str = Field(..., description="Full HTML document or fragment to render")
    filename: Optional[str] = Field(
        default="document.pdf",
        description="Download filename (must end with .pdf)",
    )
    # Spacing / page layout (optional — overrides @page margins)
    margin: Optional[str] = Field(
        default=None,
        description='Page margin shorthand, e.g. "1cm" or "1cm 1.5cm"',
    )
    margin_top: Optional[str] = Field(default=None, description='e.g. "1cm"')
    margin_right: Optional[str] = Field(default=None, description='e.g. "1cm"')
    margin_bottom: Optional[str] = Field(default=None, description='e.g. "1cm"')
    margin_left: Optional[str] = Field(default=None, description='e.g. "1cm"')
    page_size: Optional[str] = Field(
        default=None,
        description='e.g. "A4", "Letter", or "210mm 297mm"',
    )
    css: Optional[str] = Field(
        default=None,
        description="Extra CSS applied after page margins (max 50KB)",
    )

    @field_validator("margin")
    @classmethod
    def _validate_margin(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if not _CSS_MARGIN_SHORTHAND.match(cleaned):
            raise ValueError(
                'margin must look like "1cm" or "1cm 2cm 1cm 2cm" '
                "(units: cm, mm, in, pt, px, %)"
            )
        return cleaned

    @field_validator("margin_top", "margin_right", "margin_bottom", "margin_left")
    @classmethod
    def _validate_side_margin(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if not _CSS_LENGTH.match(cleaned):
            raise ValueError(
                'margin_* must look like "1cm" or "0.5in" '
                "(units: cm, mm, in, pt, px, %)"
            )
        return cleaned

    @field_validator("page_size")
    @classmethod
    def _validate_page_size(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if not _PAGE_SIZE.match(cleaned):
            raise ValueError('page_size must be e.g. "A4", "Letter", or "210mm 297mm"')
        return cleaned

    @field_validator("css")
    @classmethod
    def _validate_css(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        if len(value.encode("utf-8")) > _MAX_EXTRA_CSS_BYTES:
            raise ValueError(f"css exceeds {_MAX_EXTRA_CSS_BYTES} bytes")
        return value


def require_pdf_api_key(x_api_key: Optional[str] = Header(default=None, alias="X-API-Key")) -> None:
    if not PDF_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PDF API is not configured. Set PDF_API_KEY in the environment.",
        )
    if not x_api_key or not secrets.compare_digest(x_api_key, PDF_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key",
        )


def _sanitize_filename(name: Optional[str]) -> str:
    raw = (name or "document.pdf").strip() or "document.pdf"
    base = raw.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    cleaned = _SAFE_FILENAME.sub("_", base).strip("._") or "document"
    if not cleaned.lower().endswith(".pdf"):
        cleaned = f"{cleaned}.pdf"
    return cleaned[:200]


@router.post("/from-html")
def html_to_pdf(
    body: HtmlToPdfRequest,
    _: None = Depends(require_pdf_api_key),
):
    html_bytes = len(body.html.encode("utf-8"))
    if html_bytes > PDF_MAX_HTML_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"HTML exceeds size limit of {PDF_MAX_HTML_BYTES} bytes "
                f"({PDF_MAX_HTML_BYTES // 1024} KB). Received {html_bytes} bytes."
            ),
        )
    if not body.html.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="html must not be empty",
        )

    filename = _sanitize_filename(body.filename)
    logger.info(
        "HTML→PDF request filename=%s html_bytes=%s margin=%s margin_top=%s page_size=%s",
        filename,
        html_bytes,
        body.margin,
        body.margin_top,
        body.page_size,
    )

    try:
        pdf_bytes = pdf_service.html_to_pdf(
            body.html,
            margin=body.margin,
            margin_top=body.margin_top,
            margin_right=body.margin_right,
            margin_bottom=body.margin_bottom,
            margin_left=body.margin_left,
            page_size=body.page_size,
            css=body.css,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
