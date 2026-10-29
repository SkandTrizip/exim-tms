from backend.utils.pdf_text import normalize_for_reportlab, pdf_paragraph_markup


def test_normalize_unicode_dashes_to_ascii_hyphen():
    raw = "A\u201317/1, GUJARAT\u2013394510"
    assert normalize_for_reportlab(raw) == "A-17/1, GUJARAT-394510"


def test_pdf_paragraph_markup_preserves_br():
    assert pdf_paragraph_markup("A\u2013B<br/>C") == "A-B<br/>C"
