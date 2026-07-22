"""Generic HTML → PDF API for internal and external callers."""

from __future__ import annotations

import re
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel, Field

from backend.config import PDF_API_KEY, PDF_MAX_HTML_BYTES
from backend.services import pdf_service
from backend.utils.logger import logger

router = APIRouter(prefix="/pdf", tags=["PDF"])

_SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._-]+")


class HtmlToPdfRequest(BaseModel):
    html: str = Field(..., description="Full HTML document or fragment to render")
    filename: Optional[str] = Field(
        default="document.pdf",
        description="Download filename (must end with .pdf)",
    )


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
        "HTML→PDF request filename=%s html_bytes=%s",
        filename,
        html_bytes,
    )

    try:
        pdf_bytes = pdf_service.html_to_pdf(body.html)
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
