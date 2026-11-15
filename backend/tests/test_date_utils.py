"""
test_date_utils.py — Regression and Validation Tests for LUNAR EDGE Date Handling

Covers Phase 1 Requirements:
- Zero-padded dates.
- UTC timestamps.
- Timestamps with timezone offsets.
- Leap days (valid in leap years, rejected in non-leap years).
- Invalid dates and malformed strings.
- Time-series generation.
- Pydantic schema validation and normalization.
"""

import pytest
from datetime import datetime, timezone, timedelta
from app.utils.date_utils import (
    parse_and_normalize_utc,
    normalize_to_iso_utc,
    normalize_to_spice_utc,
    validate_iso_utc_string,
    generate_epoch_time_series,
)
from app.models.schemas import GeometryTimeSeriesRequest, LandingSite


# ---------------------------------------------------------------------------
# 1. Zero-Padded & Canonical UTC Timestamps
# ---------------------------------------------------------------------------

def test_canonical_utc_timestamps():
    iso_str = "2026-07-01T00:00:00Z"
    dt = parse_and_normalize_utc(iso_str)
    assert dt == datetime(2026, 7, 1, 0, 0, 0, tzinfo=timezone.utc)
    assert normalize_to_iso_utc(iso_str) == "2026-07-01T00:00:00Z"
    assert normalize_to_spice_utc(iso_str) == "2026-07-01T00:00:00Z"


def test_space_separator_utc():
    iso_str = "2026-07-01 14:30:15"
    dt = parse_and_normalize_utc(iso_str)
    assert dt == datetime(2026, 7, 1, 14, 30, 15, tzinfo=timezone.utc)
    assert normalize_to_iso_utc(iso_str) == "2026-07-01T14:30:15Z"


def test_jpl_horizons_calendar_format():
    horizons_str = "2026-Jan-15 00:00"
    dt = parse_and_normalize_utc(horizons_str)
    assert dt == datetime(2026, 1, 15, 0, 0, 0, tzinfo=timezone.utc)
    assert normalize_to_iso_utc(horizons_str) == "2026-01-15T00:00:00Z"
    assert normalize_to_spice_utc(horizons_str) == "2026-01-15T00:00:00Z"


def test_microsecond_precision():
    iso_str = "2026-07-01T00:00:00.500000Z"
    dt = parse_and_normalize_utc(iso_str)
    assert dt.microsecond == 500000
    assert normalize_to_iso_utc(iso_str) == "2026-07-01T00:00:00.500000Z"


# ---------------------------------------------------------------------------
# 2. Unpadded Dates (Fix for 2027-1-01T00:00:00+00:00 error)
# ---------------------------------------------------------------------------

def test_unpadded_month_and_day():
    raw_str = "2027-1-01T00:00:00+00:00"
    dt = parse_and_normalize_utc(raw_str)
    assert dt == datetime(2027, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    assert normalize_to_iso_utc(raw_str) == "2027-01-01T00:00:00Z"


def test_unpadded_single_digit_month_and_day():
    raw_str = "2027-2-5T8:9:3Z"
    dt = parse_and_normalize_utc(raw_str)
    assert dt == datetime(2027, 2, 5, 8, 9, 3, tzinfo=timezone.utc)
    assert normalize_to_iso_utc(raw_str) == "2027-02-05T08:09:03Z"


def test_date_only_unpadded():
    raw_str = "2027-3-4"
    dt = parse_and_normalize_utc(raw_str)
    assert dt == datetime(2027, 3, 4, 0, 0, 0, tzinfo=timezone.utc)
    assert normalize_to_iso_utc(raw_str) == "2027-03-04T00:00:00Z"


# ---------------------------------------------------------------------------
# 3. Timestamps with Timezone Offsets (Shift to True UTC)
# ---------------------------------------------------------------------------

def test_positive_timezone_offset():
    # 05:30 ahead of UTC (IST)
    raw_str = "2027-01-01T05:30:00+05:30"
    dt = parse_and_normalize_utc(raw_str)
    assert dt == datetime(2027, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    assert normalize_to_iso_utc(raw_str) == "2027-01-01T00:00:00Z"


def test_negative_timezone_offset():
    # 05:00 behind UTC (EST)
    raw_str = "2027-01-01T00:00:00-05:00"
    dt = parse_and_normalize_utc(raw_str)
    assert dt == datetime(2027, 1, 1, 5, 0, 0, tzinfo=timezone.utc)
    assert normalize_to_iso_utc(raw_str) == "2027-01-01T05:00:00Z"


def test_timezone_across_day_boundary():
    # 23:00 with +02:00 -> 21:00 UTC same day
    dt1 = parse_and_normalize_utc("2026-07-01T23:00:00+02:00")
    assert dt1 == datetime(2026, 7, 1, 21, 0, 0, tzinfo=timezone.utc)

    # 01:00 with +02:00 -> 23:00 UTC previous day (June 30)
    dt2 = parse_and_normalize_utc("2026-07-01T01:00:00+02:00")
    assert dt2 == datetime(2026, 6, 30, 23, 0, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# 4. Leap Day Handling
# ---------------------------------------------------------------------------

def test_valid_leap_day_2028():
    raw_str = "2028-02-29T12:00:00Z"
    dt = parse_and_normalize_utc(raw_str)
    assert dt == datetime(2028, 2, 29, 12, 0, 0, tzinfo=timezone.utc)
    assert normalize_to_iso_utc(raw_str) == "2028-02-29T12:00:00Z"


def test_invalid_leap_day_non_leap_years():
    # 2026 and 2027 are not leap years
    with pytest.raises(ValueError, match="not a leap year"):
        parse_and_normalize_utc("2027-02-29T00:00:00Z")

    with pytest.raises(ValueError, match="not a leap year"):
        parse_and_normalize_utc("2026-02-29T00:00:00Z")


# ---------------------------------------------------------------------------
# 5. Invalid Dates & Meaningful Errors
# ---------------------------------------------------------------------------

def test_invalid_month():
    with pytest.raises(ValueError, match="month must be in 1..12"):
        parse_and_normalize_utc("2027-13-01T00:00:00Z")

    with pytest.raises(ValueError, match="month must be in 1..12"):
        parse_and_normalize_utc("2027-00-01T00:00:00Z")


def test_invalid_day_of_month():
    with pytest.raises(ValueError, match="day is out of range"):
        parse_and_normalize_utc("2027-01-32T00:00:00Z")

    with pytest.raises(ValueError, match="day is out of range"):
        parse_and_normalize_utc("2027-04-31T00:00:00Z")  # April has 30 days


def test_invalid_time_components():
    with pytest.raises(ValueError, match="hour must be in 0..23"):
        parse_and_normalize_utc("2027-01-01T25:00:00Z")

    with pytest.raises(ValueError, match="minute must be in 0..59"):
        parse_and_normalize_utc("2027-01-01T12:65:00Z")


def test_malformed_string():
    with pytest.raises(ValueError, match="Invalid ISO-8601"):
        parse_and_normalize_utc("not-a-valid-date")

    with pytest.raises(ValueError, match="cannot be empty"):
        parse_and_normalize_utc("")

    with pytest.raises(TypeError, match="Expected timestamp string"):
        parse_and_normalize_utc(12345)  # type: ignore


# ---------------------------------------------------------------------------
# 6. Time-Series Generation
# ---------------------------------------------------------------------------

def test_time_series_generation_hourly():
    start = "2026-07-01T00:00:00Z"
    series = generate_epoch_time_series(start, duration_days=1.0, step_minutes=60.0)
    # 24 hours / 1 hr step = 25 samples (t = 0h to t = 24h inclusive)
    assert len(series) == 25
    assert series[0] == datetime(2026, 7, 1, 0, 0, 0, tzinfo=timezone.utc)
    assert series[-1] == datetime(2026, 7, 2, 0, 0, 0, tzinfo=timezone.utc)
    assert series[1] - series[0] == timedelta(hours=1)


def test_time_series_generation_15min_steps():
    start = "2027-1-01T00:00:00+00:00"  # unpadded input
    series = generate_epoch_time_series(start, duration_days=14.0, step_minutes=15.0)
    # 14 days * 24 * 4 steps/hr + 1 = 1345 steps
    assert len(series) == 1345
    assert series[0] == datetime(2027, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    assert series[-1] == datetime(2027, 1, 15, 0, 0, 0, tzinfo=timezone.utc)


def test_time_series_negative_bounds():
    with pytest.raises(ValueError, match="duration must be positive"):
        generate_epoch_time_series("2026-07-01T00:00:00Z", duration_days=-1.0, step_minutes=15.0)

    with pytest.raises(ValueError, match="step must be positive"):
        generate_epoch_time_series("2026-07-01T00:00:00Z", duration_days=14.0, step_minutes=0.0)


# ---------------------------------------------------------------------------
# 7. Integration with Pydantic Schemas
# ---------------------------------------------------------------------------

def test_pydantic_schema_normalizes_unpadded_date():
    site = LandingSite(name="Test Site", latitude_deg=-89.0, longitude_deg=0.0)
    req = GeometryTimeSeriesRequest(
        site=site,
        start_utc="2027-1-01T00:00:00+00:00",
        duration_days=14.0,
        step_minutes=15.0,
    )
    assert req.start_utc == "2027-01-01T00:00:00Z"


def test_pydantic_schema_rejects_invalid_date():
    site = LandingSite(name="Test Site", latitude_deg=-89.0, longitude_deg=0.0)
    with pytest.raises(Exception):
        GeometryTimeSeriesRequest(
            site=site,
            start_utc="2027-02-29T00:00:00Z",  # non leap year
            duration_days=14.0,
            step_minutes=15.0,
        )
