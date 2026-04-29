# P001 — Python 3.9 Union Type Hint Crash

**Date:** 2026-04  
**File affected:** `scripts/fetch/fetch_places.py`  
**Severity:** Build-breaking

## What Happened

Added a type hint using Python 3.10+ union syntax:
```python
def scrape(districts: dict | None = None) -> None:
```

This raised `TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'` at import time on Python 3.9.

## Fix

Remove the type annotation entirely — bare default is sufficient:
```python
def scrape(districts=None) -> None:
```

Or use `Optional` from `typing`:
```python
from typing import Optional
def scrape(districts: Optional[dict] = None) -> None:
```

## Rule

All scripts in this project target Python 3.9 (`.venv` interpreter). Never use `X | Y` union syntax in function signatures or type hints. Use `Optional[X]` or no annotation.
