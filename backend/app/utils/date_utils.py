"""
date_utils.py — LUNAR EDGE Scientific Date & Epoch Utilities

Provides strict, deterministic ISO-8601 parsing, UTC normalization,
calendar validation (including leap-year checks), and epoch conversion
for SPICE and mission engines.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone, timedelta
from typing import Union, List

# Matches standard ISO-8601 strings, unpadded variants, and JPL Horizons/SPICE calendar formats:
# Examples:
#   2027-01-01T00:00:00Z
#   2027-1-01T00:00:00+00:00
#   2026-07-01 12:30:45
#   2027-01-01T05:30:00+05:30
#   2028-02-29T12:00:00Z
#   2026-Jan-15 00:00 (JPL Horizons calendar format)
ISO_8601_REGEX = re.compile(
    r"^(\d{4})[-/]([a-zA-Z]{3,9}|\d{1,2})[-/](\d{1,2})"
    r"(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d+))?)?)?"
    r"(?:(Z)|([+-]\d{1,2}(?::?\d{2})?))?$",
    re.IGNORECASE,
)

MONTH_NAME_MAP = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


def parse_and_normalize_utc(date_input: Union[str, datetime]) -> datetime:
    """
    Parses an ISO-8601 timestamp string or datetime, validates calendar correctness,
    and returns an aware datetime normalized to UTC (timezone.utc).

    Raises:
        TypeError: If input is neither a string nor a datetime.
        ValueError: If input is empty, malformed, or an invalid calendar date.
    """
    if isinstance(date_input, datetime):
        if date_input.tzinfo is None:
            # Naive datetime: assume UTC
            return date_input.replace(tzinfo=timezone.utc)
        return date_input.astimezone(timezone.utc)

    if not isinstance(date_input, str):
        raise TypeError(f"Expected timestamp string or datetime, got {type(date_input).__name__}")

    raw_str = date_input.strip()
    if not raw_str:
        raise ValueError("Timestamp string cannot be empty")

    match = ISO_8601_REGEX.match(raw_str)
    if not match:
        raise ValueError(f"Invalid ISO-8601 timestamp format: '{date_input}'")

    year_str, month_str, day_str, hour_str, min_str, sec_str, micro_str, z_flag, tz_offset = match.groups()

    year = int(year_str)
    if month_str.isdigit():
        month = int(month_str)
    else:
        month = MONTH_NAME_MAP.get(month_str.lower())
        if month is None:
            raise ValueError(f"Invalid month name: '{month_str}'")

    day = int(day_str)
    hour = int(hour_str) if hour_str is not None else 0
    minute = int(min_str) if min_str is not None else 0
    second = int(sec_str) if sec_str is not None else 0

    microsecond = 0
    if micro_str:
        microsecond = int(micro_str.ljust(6, "0")[:6])

    # Timezone offset handling
    tz = timezone.utc
    if tz_offset:
        sign = 1 if tz_offset[0] == "+" else -1
        offset_body = tz_offset[1:].replace(":", "")
        if len(offset_body) == 2:
            tz_h = int(offset_body)
            tz_m = 0
        elif len(offset_body) == 4:
            tz_h = int(offset_body[:2])
            tz_m = int(offset_body[2:])
        else:
            raise ValueError(f"Malformed timezone offset: '{tz_offset}'")

        if tz_h > 23 or tz_m > 59:
            raise ValueError(f"Timezone offset out of range: '{tz_offset}'")

        tz = timezone(sign * timedelta(hours=tz_h, minutes=tz_m))
    elif z_flag:
        tz = timezone.utc
    else:
        # Default naive strings to UTC
        tz = timezone.utc

    try:
        dt = datetime(year, month, day, hour, minute, second, microsecond, tzinfo=tz)
    except ValueError as err:
        if month == 2 and day == 29:
            raise ValueError(
                f"Invalid calendar date '{year:04d}-{month:02d}-{day:02d}': {year} is not a leap year"
            ) from err
        raise ValueError(f"Invalid calendar date or time in '{date_input}': {err}") from err

    # Normalize to pure UTC
    return dt.astimezone(timezone.utc)


def normalize_to_iso_utc(date_input: Union[str, datetime]) -> str:
    """
    Normalizes a timestamp input to canonical ISO-8601 UTC format:
    'YYYY-MM-DDTHH:MM:SSZ' (or with microseconds if present).
    """
    dt = parse_and_normalize_utc(date_input)
    if dt.microsecond > 0:
        return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def normalize_to_spice_utc(date_input: Union[str, datetime]) -> str:
    """
    Normalizes timestamp input to a format natively accepted by CSPICE str2et_c:
    'YYYY-MM-DDTHH:MM:SSZ' or 'YYYY-MM-DDTHH:MM:SS.fffZ'.
    """
    return normalize_to_iso_utc(date_input)


def validate_iso_utc_string(value: str) -> str:
    """
    Validator for Pydantic schemas. Accepts ISO strings, validates, and returns canonical ISO UTC.
    """
    return normalize_to_iso_utc(value)


def generate_epoch_time_series(
    start_input: Union[str, datetime],
    duration_days: float,
    step_minutes: float,
) -> List[datetime]:
    """
    Generates a deterministic list of UTC datetimes spanning the mission window.
    """
    if duration_days <= 0:
        raise ValueError(f"Mission duration must be positive, got {duration_days}")
    if step_minutes <= 0:
        raise ValueError(f"Time step must be positive, got {step_minutes}")

    start_dt = parse_and_normalize_utc(start_input)
    total_seconds = duration_days * 86400.0
    step_seconds = step_minutes * 60.0
    n_steps = int(round(total_seconds / step_seconds)) + 1

    return [start_dt + timedelta(seconds=i * step_seconds) for i in range(n_steps)]
