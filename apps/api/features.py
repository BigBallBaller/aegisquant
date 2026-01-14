from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd


DATA_DIR = Path(__file__).resolve().parents[2] / "data"
PROCESSED_DIR = DATA_DIR / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


@dataclass(frozen=True)
class FeatureResult:
    symbol: str
    rows: int
    start: str
    end: str
    features_path: str


def _utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def build_features(
    df: pd.DataFrame,
    vol_window: int = 20,
    mom_window: int = 60,
) -> pd.DataFrame:
    """
    Input: raw OHLCV with at least ['date', 'close'] (optionally 'volume').
    Output: processed feature table:
      - log_ret: log(close_t / close_{t-1})
      - vol_20: rolling std of log_ret over 20 trading days
      - mom_60: log(close_t / close_{t-60})
      - drawdown: close / running_max(close) - 1
    """

    if "date" not in df.columns or "close" not in df.columns:
        raise ValueError(f"Expected columns ['date','close'], got: {list(df.columns)}")

    d = df.copy()
    d["date"] = pd.to_datetime(d["date"])
    d = d.sort_values("date").reset_index(drop=True)

    close = d["close"].astype(float)

    # log return
    d["log_ret"] = np.log(close / close.shift(1))

    # rolling volatility
    d[f"vol_{vol_window}"] = d["log_ret"].rolling(vol_window).std()

    # momentum
    d[f"mom_{mom_window}"] = np.log(close / close.shift(mom_window))

    # drawdown
    run_max = close.cummax()
    d["drawdown"] = close / run_max - 1.0

    # select tidy output columns
    out_cols = ["date", "close"]
    if "volume" in d.columns:
        out_cols.append("volume")

    out_cols += ["log_ret", f"vol_{vol_window}", f"mom_{mom_window}", "drawdown"]
    out = d[out_cols].copy()

    # drop rows that don't have enough history for rolling windows
    out = out.dropna(subset=["log_ret", f"vol_{vol_window}", f"mom_{mom_window}"]).reset_index(drop=True)
    return out


def latest_features_file(symbol: str) -> Optional[Path]:
    symbol = symbol.upper().strip()
    files = sorted(PROCESSED_DIR.glob(f"{symbol}_features_*.parquet"))
    return files[-1] if files else None


def save_features(symbol: str, features: pd.DataFrame) -> FeatureResult:
    stamp = _utc_stamp()
    fp = PROCESSED_DIR / f"{symbol.upper()}_features_{stamp}.parquet"
    features.to_parquet(fp, index=False)

    return FeatureResult(
        symbol=symbol.upper(),
        rows=int(len(features)),
        start=str(pd.to_datetime(features["date"]).min().date()),
        end=str(pd.to_datetime(features["date"]).max().date()),
        features_path=str(fp),
    )


def read_latest_features(symbol: str) -> pd.DataFrame:
    fp = latest_features_file(symbol)
    if fp is None:
        raise FileNotFoundError(f"No cached features parquet found for {symbol}. Run /data/process first.")
    return pd.read_parquet(fp)