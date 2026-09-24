"""Unit tests for month-wise additional-invoice split (no database)."""
from __future__ import annotations

import datetime
import unittest
from types import SimpleNamespace

from backend.services.analytics_service import split_later_month_extras
from backend.services.enquiry_economics_service import (
    AdditionalLineItem,
    additional_line_item_from_doc,
    list_additional_line_items,
)


def _item(
    *,
    cost: float,
    created_at: datetime.datetime | None,
    revenue: float | None = None,
    description: str = "Detention",
    doc_id: int = 1,
) -> AdditionalLineItem:
    rev = cost if revenue is None else revenue
    return AdditionalLineItem(
        doc_id=doc_id,
        enquiry_id=42,
        description=description,
        cost_inr=cost,
        revenue_inr=rev,
        created_at=created_at,
    )


class SplitLaterMonthExtrasTests(unittest.TestCase):
    def test_same_month_extra_stays_on_job(self):
        extras = [_item(cost=5000, created_at=datetime.datetime(2026, 7, 20))]
        later_cost, later_rev, later = split_later_month_extras(extras, "2026-07")
        self.assertEqual(later_cost, 0.0)
        self.assertEqual(later_rev, 0.0)
        self.assertEqual(later, [])

    def test_later_month_extra_is_separated(self):
        extras = [_item(cost=3000, created_at=datetime.datetime(2026, 8, 4))]
        later_cost, later_rev, later = split_later_month_extras(extras, "2026-07")
        self.assertEqual(later_cost, 3000.0)
        self.assertEqual(later_rev, 3000.0)
        self.assertEqual(len(later), 1)
        self.assertEqual(later[0].description, "Detention")

    def test_later_month_keeps_split_cost_and_revenue(self):
        extras = [
            _item(
                cost=1059095.0,
                revenue=1090701.5,
                created_at=datetime.datetime(2026, 8, 31),
                description="Demurrage Charges",
            )
        ]
        later_cost, later_rev, later = split_later_month_extras(extras, "2026-06")
        self.assertEqual(later_cost, 1059095.0)
        self.assertEqual(later_rev, 1090701.5)
        self.assertEqual(later[0].description, "Demurrage Charges")

    def test_earlier_month_extra_stays_on_job(self):
        extras = [_item(cost=1200, created_at=datetime.datetime(2026, 6, 15))]
        later_cost, later_rev, later = split_later_month_extras(extras, "2026-07")
        self.assertEqual(later_cost, 0.0)
        self.assertEqual(later, [])

    def test_missing_upload_date_stays_on_job(self):
        extras = [_item(cost=900, created_at=None)]
        later_cost, later_rev, later = split_later_month_extras(extras, "2026-07")
        self.assertEqual(later_cost, 0.0)
        self.assertEqual(later, [])

    def test_missing_attribution_month_keeps_all_on_job(self):
        extras = [_item(cost=900, created_at=datetime.datetime(2026, 9, 1))]
        later_cost, later_rev, later = split_later_month_extras(extras, None)
        self.assertEqual(later_cost, 0.0)
        self.assertEqual(later, [])

    def test_job_row_minus_later_plus_later_equals_job_total(self):
        job_cost = 1403567.0
        job_revenue = 1439979.0
        extras = [
            _item(cost=5000, created_at=datetime.datetime(2026, 6, 10), doc_id=1),
            _item(
                cost=1059095.0,
                revenue=1090701.5,
                created_at=datetime.datetime(2026, 8, 12),
                description="Demurrage Charges",
                doc_id=2,
            ),
        ]
        later_cost, later_rev, later = split_later_month_extras(extras, "2026-06")
        month_job_cost = round(job_cost - later_cost, 2)
        month_job_revenue = round(job_revenue - later_rev, 2)
        self.assertEqual(later_cost, 1059095.0)
        self.assertEqual(later_rev, 1090701.5)
        self.assertEqual(month_job_cost + later_cost, job_cost)
        self.assertEqual(month_job_revenue + later_rev, job_revenue)
        self.assertEqual(len(later), 1)


class AdditionalLineItemHelperTests(unittest.TestCase):
    def test_inr_doc_uses_charge_details_and_amount(self):
        doc = SimpleNamespace(
            id=11,
            enquiry_id=7,
            created_at=datetime.datetime(2026, 8, 2),
            metadata_info={
                "charge_details": "Telex Surrender",
                "amount": "1500",
                "currency": "INR",
            },
        )
        item = additional_line_item_from_doc(doc, containers=[])
        self.assertIsNotNone(item)
        self.assertEqual(item.description, "Telex Surrender")
        self.assertEqual(item.cost_inr, 1500.0)
        self.assertEqual(item.revenue_inr, 1500.0)
        self.assertEqual(item.doc_id, 11)

    def test_usd_doc_uses_saved_roe_without_quote(self):
        doc = SimpleNamespace(
            id=12,
            enquiry_id=7,
            created_at=datetime.datetime(2026, 8, 2),
            metadata_info={
                "charge_details": "SSR Request",
                "amount": 100,
                "currency": "USD",
                "roe": 85,
            },
        )
        item = additional_line_item_from_doc(doc, containers=[])
        self.assertIsNotNone(item)
        self.assertEqual(item.cost_inr, 8500.0)
        self.assertEqual(item.revenue_inr, 8500.0)

    def test_usd_doc_cost_uses_quote_vendor_roe_revenue_uses_invoice_roe(self):
        doc = SimpleNamespace(
            id=12,
            enquiry_id=83,
            created_at=datetime.datetime(2026, 8, 31),
            metadata_info={
                "charge_details": "Demurrage Charges",
                "amount": 11090,
                "currency": "USD",
                "roe": 98.35,
            },
        )
        ocean = SimpleNamespace(
            account_type="On Your Account",
            currency="USD",
            charge_description="Ocean Freight",
            exchange_rate=95.2,
            vendor_exchange_rate=95.5,
        )
        containers = [SimpleNamespace(charges=[ocean])]
        item = additional_line_item_from_doc(doc, containers=containers)
        self.assertIsNotNone(item)
        self.assertEqual(item.cost_inr, 1059095.0)
        self.assertEqual(item.revenue_inr, 1090701.5)

    def test_list_sum_matches_job_total_formula(self):
        docs = [
            SimpleNamespace(
                id=1,
                enquiry_id=7,
                created_at=datetime.datetime(2026, 7, 3),
                metadata_info={"charge_details": "A", "amount": 5000, "currency": "INR"},
            ),
            SimpleNamespace(
                id=2,
                enquiry_id=7,
                created_at=datetime.datetime(2026, 8, 3),
                metadata_info={"charge_details": "B", "amount": 3000, "currency": "INR"},
            ),
        ]
        items = list_additional_line_items(docs, containers=[])
        self.assertEqual(round(sum(i.cost_inr for i in items), 2), 8000.0)
        self.assertEqual(round(sum(i.revenue_inr for i in items), 2), 8000.0)

    def test_zero_or_blank_amount_skipped(self):
        doc = SimpleNamespace(
            id=13,
            enquiry_id=7,
            created_at=datetime.datetime(2026, 8, 2),
            metadata_info={"charge_details": "Empty", "amount": 0, "currency": "INR"},
        )
        self.assertIsNone(additional_line_item_from_doc(doc, containers=[]))


if __name__ == "__main__":
    unittest.main()
