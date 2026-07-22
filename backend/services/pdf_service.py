"""HTML → PDF conversion via WeasyPrint."""

from __future__ import annotations

from weasyprint import HTML, default_url_fetcher

from backend.utils.logger import logger


def _restricted_url_fetcher(url: str, timeout: int = 10, ssl_context=None):
    """Block network/file fetches to avoid SSRF; allow data: URLs only."""
    if url.startswith("data:"):
        return default_url_fetcher(url, timeout=timeout, ssl_context=ssl_context)
    raise ValueError(f"Remote or local URL fetches are not allowed: {url}")


def html_to_pdf(html: str) -> bytes:
    """Render HTML string to PDF bytes. Raises ValueError on render failure."""
    try:
        document = HTML(
            string=html,
            url_fetcher=_restricted_url_fetcher,
        )
        return document.write_pdf()
    except Exception as exc:
        logger.exception("WeasyPrint HTML→PDF failed")
        raise ValueError(f"Failed to render PDF: {exc}") from exc
