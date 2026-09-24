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
    amount: float,
    created_at: datetime.datetime | None,
    description: str = "Detention",
    doc_id: int = 1,
) -> AdditionalLineItem:
    return AdditionalLineItem(
        doc_id=doc_id,
        enquiry_id=42,
        description=description,
        amount_inr=amount,
        created_at=created_at,
    )


class SplitLaterMonthExtrasTests(unittest.TestCase):
    def test_same_month_extra_stays_on_job(self):
        extras = [_item(amount=5000, created_at=datetime.datetime(2026, 7, 20))]
        later_total, later = split_later_month_extras(extras, "2026-07")
        self.assertEqual(later_total, 0.0)
        self.assertEqual(later, [])

    def test_later_month_extra_is_separated(self):
        extras = [_item(amount=3000, created_at=datetime.datetime(2026, 8, 4))]
        later_total, later = split_later_month_extras(extras, "2026-07")
        self.assertEqual(later_total, 3000.0)
        self.assertEqual(len(later), 1)
        self.assertEqual(later[0].description, "Detention")

    def test_earlier_month_extra_stays_on_job(self):
        extras = [_item(amount=1200, created_at=datetime.datetime(2026, 6, 15))]
        later_total, later = split_later_month_extras(extras, "2026-07")
        self.assertEqual(later_total, 0.0)
        self.assertEqual(later, [])

    def test_missing_upload_date_stays_on_job(self):
        extras = [_item(amount=900, created_at=None)]
        later_total, later = split_later_month_extras(extras, "2026-07")
        self.assertEqual(later_total, 0.0)
        self.assertEqual(later, [])

    def test_missing_attribution_month_keeps_all_on_job(self):
        extras = [_item(amount=900, created_at=datetime.datetime(2026, 9, 1))]
        later_total, later = split_later_month_extras(extras, None)
        self.assertEqual(later_total, 0.0)
        self.assertEqual(later, [])

    def test_job_row_minus_later_plus_later_equals_job_total(self):
        job_cost = 108000.0
        job_revenue = 108000.0
        extras = [
            _item(amount=5000, created_at=datetime.datetime(2026, 7, 10), doc_id=1),
            _item(
                amount=3000,
                created_at=datetime.datetime(2026, 8, 12),
                description="Detention",
                doc_id=2,
            ),
        ]
        later_total, later = split_later_month_extras(extras, "2026-07")
        month_job_cost = round(job_cost - later_total, 2)
        month_job_revenue = round(job_revenue - later_total, 2)
        extra_cost = sum(item.amount_inr for item in later)
        extra_revenue = extra_cost

        self.assertEqual(later_total, 3000.0)
        self.assertEqual(month_job_cost, 105000.0)
        self.assertEqual(month_job_revenue, 105000.0)
        self.assertEqual(month_job_cost + extra_cost, job_cost)
        self.assertEqual(month_job_revenue + extra_revenue, job_revenue)
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
        self.assertEqual(item.amount_inr, 1500.0)
        self.assertEqual(item.doc_id, 11)

    def test_usd_doc_uses_saved_roe(self):
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
        self.assertEqual(item.amount_inr, 8500.0)

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
        self.assertEqual(round(sum(i.amount_inr for i in items), 2), 8000.0)

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
