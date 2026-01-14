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
class RegimeResult:
    symbol: str
    rows: int
    start: str
    end: str
    model: str
    output_path: str


def _utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _sigmoid(x: pd.Series) -> pd.Series:
    return 1.0 / (1.0 + np.exp(-x))


def build_baseline_regime(
    feats: pd.DataFrame,
    vol_col: str = "vol_20",
    z_window: int = 252,   # ~1 trading year
    k: float = 1.25,       # slope; higher = sharper transitions
) -> pd.DataFrame:
    """
    Baseline regime model:
      - compute rolling z-score of volatility
      - map z-score to risk_off_prob via sigmoid(k * z)
    Output columns:
      date, risk_off_prob, z_vol
    """
    if "date" not in feats.columns or vol_col not in feats.columns:
        raise ValueError(f"Expected columns ['date', '{vol_col}']")

    d = feats.copy()
    d["date"] = pd.to_datetime(d["date"])
    d = d.sort_values("date").reset_index(drop=True)

    vol = d[vol_col].astype(float)

    mu = vol.rolling(z_window).mean()
    sd = vol.rolling(z_window).std()

    z = (vol - mu) / sd
    risk_off_prob = _sigmoid(k * z)

    out = pd.DataFrame(
        {
            "date": d["date"],
            "z_vol": z,
            "risk_off_prob": risk_off_prob,
        }
    )

    out = out.dropna().reset_index(drop=True)
    return out


def save_regime(symbol: str, model: str, df: pd.DataFrame) -> RegimeResult:
    stamp = _utc_stamp()
    fp = PROCESSED_DIR / f"{symbol.upper()}_regime_{model}_{stamp}.parquet"
    df.to_parquet(fp, index=False)

    return RegimeResult(
        symbol=symbol.upper(),
        rows=int(len(df)),
        start=str(pd.to_datetime(df["date"]).min().date()),
        end=str(pd.to_datetime(df["date"]).max().date()),
        model=model,
        output_path=str(fp),
    )


def latest_regime_file(symbol: str, model: str = "baseline") -> Optional[Path]:
    symbol = symbol.upper().strip()
    files = sorted(PROCESSED_DIR.glob(f"{symbol}_regime_{model}_*.parquet"))
    return files[-1] if files else None


def read_latest_regime(symbol: str, model: str = "baseline") -> pd.DataFrame:
    fp = latest_regime_file(symbol, model=model)
    if fp is None:
        raise FileNotFoundError(f"No cached regime parquet found for {symbol} model={model}. Run /regime/run first.")
    return pd.read_parquet(fp)