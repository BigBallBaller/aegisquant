from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import pandas as pd
import yfinance as yf


DATA_DIR = Path(__file__).resolve().parents[2] / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


@dataclass(frozen=True)
class PullResult:
    symbol: str
    rows: int
    start: str
    end: str
    raw_path: str


def _utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _col_to_str(col) -> str:
    # Flatten tuple/MultiIndex columns safely
    if isinstance(col, tuple):
        col = "_".join(str(x) for x in col if x not in (None, ""))
    return str(col)


def _normalize_ohlcv_columns(df: pd.DataFrame, symbol: str) -> pd.DataFrame:
    """
    yfinance sometimes returns columns like open_spy, close_spy, etc.
    Convert those into open/close/high/low/adj_close/volume.
    """
    sym = symbol.lower()

    # Standardize columns to lowercase snake_case strings
    df.columns = [_col_to_str(c).lower().replace(" ", "_") for c in df.columns]

    expected = {"open", "high", "low", "close", "adj_close", "volume", "date"}

    # If we see ticker-suffixed columns (e.g., close_spy), rename them to base names.
    rename_map = {}
    suffix = f"_{sym}"
    for c in df.columns:
        if c.endswith(suffix):
            base = c[: -len(suffix)]
            if base in expected and base not in df.columns:
                rename_map[c] = base

    if rename_map:
        df = df.rename(columns=rename_map)

    return df


def pull_prices(symbol: str, start: str) -> PullResult:
    symbol = symbol.upper().strip()

    df = yf.download(
        symbol,
        start=start,
        interval="1d",
        auto_adjust=False,
        progress=False,
        group_by="column",
    )

    if df is None or df.empty:
        raise ValueError(f"No data returned for symbol={symbol} start={start}")

    df = df.reset_index()
    df = _normalize_ohlcv_columns(df, symbol=symbol)

    expected_order = ["date", "open", "high", "low", "close", "adj_close", "volume"]
    keep = [c for c in expected_order if c in df.columns]
    df = df[keep].copy()

    # Must have at least date + close to be usable
    if "date" not in df.columns or "close" not in df.columns:
        raise ValueError(
            f"Unexpected columns returned after normalization: {list(df.columns)}"
        )

    df = df.dropna(subset=["date", "close"])
    df["date"] = pd.to_datetime(df["date"]).dt.tz_localize(None)
    df = df.sort_values("date").reset_index(drop=True)

    stamp = _utc_stamp()
    raw_path = RAW_DIR / f"{symbol}_1d_{start}_{stamp}.parquet"
    df.to_parquet(raw_path, index=False)

    return PullResult(
        symbol=symbol,
        rows=int(len(df)),
        start=str(df["date"].min().date()),
        end=str(df["date"].max().date()),
        raw_path=str(raw_path),
    )


def latest_raw_file(symbol: str) -> Optional[Path]:
    symbol = symbol.upper().strip()
    files = sorted(RAW_DIR.glob(f"{symbol}_1d_*.parquet"))
    return files[-1] if files else None


def read_latest_prices(symbol: str) -> pd.DataFrame:
    fp = latest_raw_file(symbol)
    if fp is None:
        raise FileNotFoundError(
            f"No cached raw parquet found for {symbol}. Pull data first."
        )
    return pd.read_parquet(fp)