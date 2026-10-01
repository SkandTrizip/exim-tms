"""Unit tests for dual-currency invoice line presentation."""
from types import SimpleNamespace

from backend.services import invoice_quote_service


class _Charge:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


class _Container:
    def __init__(self, charges):
        self.charges = charges


def test_usd_mode_native_usd_line():
    charge = _Charge(
        currency="USD",
        quantity=2,
        vendor_exchange_rate=83.0,
        account_type="On Your Account",
    )
    rate, curr_amt, roe, disp_curr, taxable = invoice_quote_service.invoice_line_amounts(
        charge, 100.0, [], currency_mode="usd"
    )
    assert disp_curr == "USD"
    assert rate == 100.0
    assert curr_amt == 200.0
    assert roe == 1.0
    assert taxable == 200.0


def test_inr_mode_native_usd_line_uses_roe():
    charge = _Charge(
        currency="USD",
        quantity=1,
        vendor_exchange_rate=80.0,
        account_type="On Your Account",
    )
    containers = [_Container([charge])]
    rate, curr_amt, roe, disp_curr, taxable = invoice_quote_service.invoice_line_amounts(
        charge, 10.0, containers, currency_mode="inr"
    )
    assert disp_curr == "USD"
    assert curr_amt == 10.0
    assert roe == 80.0
    assert taxable == 800.0


def test_usd_mode_converts_inr_line():
    usd_line = _Charge(
        currency="USD",
        quantity=1,
        vendor_exchange_rate=80.0,
        account_type="On Your Account",
    )
    inr_line = _Charge(
        currency="INR",
        quantity=1,
        vendor_exchange_rate=1.0,
        account_type="On Your Account",
    )
    containers = [_Container([usd_line, inr_line])]
    rate, curr_amt, roe, disp_curr, taxable = invoice_quote_service.invoice_line_amounts(
        inr_line, 8000.0, containers, currency_mode="usd"
    )
    assert disp_curr == "USD"
    assert rate == 100.0
    assert curr_amt == 8000.0 / 80.0
    assert roe == 1.0
    assert taxable == 100.0
