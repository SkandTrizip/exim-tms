"""Unit tests for booking-cancelled economics rules (no database)."""
from __future__ import annotations

import unittest

from backend.services.enquiry_economics_service import merge_enquiry_economics_components


class BookingCancelledEconomicsTests(unittest.TestCase):
    def test_active_trip_includes_freight_and_overheads(self):
        cost, revenue = merge_enquiry_economics_components(
            booking_cancelled=False,
            quote_cost=100_000.0,
            quote_revenue=120_000.0,
            additional_cost=5_000.0,
            additional_revenue=6_000.0,
            overhead_cost=2_000.0,
            overhead_deduct=500.0,
        )
        self.assertEqual(cost, 107_000.0)
        self.assertEqual(revenue, 125_500.0)

    def test_cancelled_trip_excludes_freight_keeps_additional_and_overheads(self):
        cost, revenue = merge_enquiry_economics_components(
            booking_cancelled=True,
            quote_cost=100_000.0,
            quote_revenue=120_000.0,
            additional_cost=5_000.0,
            additional_revenue=6_000.0,
            overhead_cost=3_500.0,
            overhead_deduct=1_000.0,
        )
        self.assertEqual(cost, 8_500.0)
        self.assertEqual(revenue, 5_000.0)

    def test_cancelled_trip_with_no_overheads_is_zero(self):
        cost, revenue = merge_enquiry_economics_components(
            booking_cancelled=True,
            quote_cost=50_000.0,
            quote_revenue=60_000.0,
            additional_cost=0.0,
            additional_revenue=0.0,
            overhead_cost=0.0,
            overhead_deduct=0.0,
        )
        self.assertEqual(cost, 0.0)
        self.assertEqual(revenue, 0.0)


if __name__ == "__main__":
    unittest.main()
