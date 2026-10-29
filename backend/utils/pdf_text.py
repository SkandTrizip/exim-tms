"""ReportLab Paragraph helpers — built-in Helvetica only covers WinAnsi/Latin-1."""

from __future__ import annotations

import html
import re
import unicodedata

_BR_TAG = re.compile(r"<\s*br\s*/?\s*>", re.IGNORECASE)


def normalize_for_reportlab(text: str) -> str:
    """Map Unicode dashes and common paste artifacts to ASCII so Helvetica renders them."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text)
    out: list[str] = []
    for ch in text:
        if unicodedata.category(ch) == "Pd" or ch in "\u2212\u00ad":
            out.append("-")
        elif ch == "\u00a0":
            out.append(" ")
        else:
            out.append(ch)
    return "".join(out)


def pdf_paragraph_markup(value: str) -> str:
    """Escape user text for ReportLab Paragraph; preserves explicit ``<br/>`` line breaks."""
    raw = str(value) if value is not None else ""
    parts = _BR_TAG.split(raw)
    return "<br/>".join(
        html.escape(normalize_for_reportlab(part), quote=False) for part in parts
    )
