"""HTML → PDF conversion via WeasyPrint."""

from __future__ import annotations

from typing import Optional

from weasyprint import CSS, HTML

from backend.utils.logger import logger

try:
    from weasyprint.urls import URLFetcher as _WeasyURLFetcher
except ImportError:
    _WeasyURLFetcher = None

try:
    from weasyprint import default_url_fetcher as _legacy_url_fetcher
except ImportError:
    _legacy_url_fetcher = None


def _restricted_url_fetcher(url: str, timeout: int = 10, ssl_context=None):
    """Legacy WeasyPrint callable fetcher: data: URLs only."""
    if url.startswith("data:") and _legacy_url_fetcher is not None:
        return _legacy_url_fetcher(url, timeout=timeout, ssl_context=ssl_context)
    raise ValueError(f"Remote or local URL fetches are not allowed: {url}")


def _html_url_fetcher():
    """WeasyPrint 66+ wants a URLFetcher instance; older versions want a callable."""
    if _WeasyURLFetcher is not None:
        return _WeasyURLFetcher(allowed_protocols={"data"})
    return _restricted_url_fetcher


def _build_page_css(
    *,
    margin: Optional[str] = None,
    margin_top: Optional[str] = None,
    margin_right: Optional[str] = None,
    margin_bottom: Optional[str] = None,
    margin_left: Optional[str] = None,
    page_size: Optional[str] = None,
) -> Optional[str]:
    """Build @page CSS from optional margin / size overrides."""
    rules: list[str] = []
    if page_size:
        rules.append(f"size: {page_size};")
    if margin is not None:
        rules.append(f"margin: {margin};")
    if margin_top is not None:
        rules.append(f"margin-top: {margin_top};")
    if margin_right is not None:
        rules.append(f"margin-right: {margin_right};")
    if margin_bottom is not None:
        rules.append(f"margin-bottom: {margin_bottom};")
    if margin_left is not None:
        rules.append(f"margin-left: {margin_left};")
    if not rules:
        return None
    return "@page {\n  " + "\n  ".join(rules) + "\n}\nbody { margin: 0; padding: 0; }\n"


def html_to_pdf(
    html: str,
    *,
    margin: Optional[str] = None,
    margin_top: Optional[str] = None,
    margin_right: Optional[str] = None,
    margin_bottom: Optional[str] = None,
    margin_left: Optional[str] = None,
    page_size: Optional[str] = None,
    css: Optional[str] = None,
) -> bytes:
    """Render HTML string to PDF bytes. Raises ValueError on render failure."""
    try:
        stylesheets: list[CSS] = []
        page_css = _build_page_css(
            margin=margin,
            margin_top=margin_top,
            margin_right=margin_right,
            margin_bottom=margin_bottom,
            margin_left=margin_left,
            page_size=page_size,
        )
        if page_css:
            stylesheets.append(CSS(string=page_css))
        if css and css.strip():
            stylesheets.append(CSS(string=css))

        document = HTML(
            string=html,
            url_fetcher=_html_url_fetcher(),
        )
        return document.write_pdf(stylesheets=stylesheets or None)
    except Exception as exc:
        logger.exception("WeasyPrint HTML→PDF failed")
        raise ValueError(f"Failed to render PDF: {exc}") from exc
