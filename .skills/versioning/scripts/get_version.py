#!/usr/bin/env python3
"""
CalVer version generator
Format: YYYY.1MMDD.1HH[mm[ss]]

Usage:
  python get_version.py           # Default precision: hour
  python get_version.py minute    # Minute precision
  python get_version.py second    # Second precision
  python get_version.py month     # Monthly precision
  python get_version.py year      # Annual first release
"""

from datetime import datetime, timezone
import sys


def get_version(precision: str = "hour") -> str:
  """
  Generate CalVer version number

  Args:
    precision: Precision level
      - "year": Annual first release (YYYY.0.0)
      - "month": Monthly (YYYY.1MM.1HH)
      - "hour": Hourly (YYYY.1MMDD.1HH) [default]
      - "minute": Minute (YYYY.1MMDD.1HHmm)
      - "second": Second (YYYY.1MMDD.1HHmmss)

  Returns:
    Version string
  """
  now = datetime.now(timezone.utc)

  year = now.year
  month = now.month
  day = now.day
  hour = now.hour
  minute = now.minute
  second = now.second

  if precision == "year":
    return f"{year}.0.0"

  if precision == "month":
    # YYYY.1MM.1HH
    return f"{year}.1{month:02d}.1{hour:02d}"

  # Date segment: 1MMDD
  date_segment = f"1{month:02d}{day:02d}"

  if precision == "hour":
    # YYYY.1MMDD.1HH
    return f"{year}.{date_segment}.1{hour:02d}"

  if precision == "minute":
    # YYYY.1MMDD.1HHmm
    return f"{year}.{date_segment}.1{hour:02d}{minute:02d}"

  if precision == "second":
    # YYYY.1MMDD.1HHmmss
    return f"{year}.{date_segment}.1{hour:02d}{minute:02d}{second:02d}"

  raise ValueError(f"Unknown precision: {precision}")


def main():
  precision = sys.argv[1] if len(sys.argv) > 1 else "hour"
  print(get_version(precision))


if __name__ == "__main__":
  main()
