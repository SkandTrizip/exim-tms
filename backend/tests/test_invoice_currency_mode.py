"""Unit tests for currency-split dual invoicing."""
from types import SimpleNamespace

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


def test_taxable_usd_for_invoice_charge_no_roe_multiply():
    charge = SimpleNamespace(quantity=2.0, currency="USD", charge_description="Ocean Freight")
    curr_amt, roe, taxable = invoice_quote_service.taxable_usd_for_invoice_charge(
        charge, vendor_rate=100.0, api_roe=86.5
    )
    assert curr_amt == 200.0
    assert taxable == 200.0  # no ROE multiply
    assert roe == 86.5


def test_taxable_usd_for_additional_amount_no_roe_multiply():
    curr_amt, roe, taxable = invoice_quote_service.taxable_usd_for_additional_amount(
        150.0, api_roe=87.25
    )
    assert curr_amt == 150.0
    assert taxable == 150.0
    assert roe == 87.25
