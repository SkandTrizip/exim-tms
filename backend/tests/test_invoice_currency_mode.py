"""Unit tests for currency-split dual invoicing."""
from backend.services import invoice_quote_service


def test_line_currency_group():
    assert invoice_quote_service.line_currency_group("USD") == "usd"
    assert invoice_quote_service.line_currency_group("usd") == "usd"
    assert invoice_quote_service.line_currency_group("INR") == "inr"
    assert invoice_quote_service.line_currency_group(None) == "inr"


def test_belongs_to_currency_invoice():
    assert invoice_quote_service.belongs_to_currency_invoice("USD", "usd")
    assert not invoice_quote_service.belongs_to_currency_invoice("INR", "usd")
    assert invoice_quote_service.belongs_to_currency_invoice("INR", "inr")
    assert not invoice_quote_service.belongs_to_currency_invoice("USD", "inr")
