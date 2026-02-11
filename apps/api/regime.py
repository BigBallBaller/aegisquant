from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

from features import read_latest_features

router = APIRouter()

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
    z_window: int = 252,
    k: float = 1.25,
) -> pd.DataFrame:
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

    out = pd.DataFrame({"date": d["date"], "z_vol": z, "risk_off_prob": risk_off_prob})
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
        raise FileNotFoundError(
            f"No cached regime parquet found for {symbol} model={model}. Run /regime/run first."
        )
    return pd.read_parquet(fp)


@router.get("/regime/equity")
def regime_equity(
    symbol: str = "SPY",
    threshold: float = 0.7,
    limit: int = 5000,
    cost_bps: float = 5.0,
    model: str = "baseline",
):
    """
    Equity curves:
      - bh: buy & hold equity curve
      - regime_gross: risk-on only (pos=1) equity curve, no costs
      - regime_net: risk-on only equity curve, with transaction costs applied on trade days

    Also returns summary stats for each curve for portfolio showcase use.
    """
    try:
        symbol_u = symbol.upper().strip()
        threshold = float(max(0.0, min(1.0, threshold)))
        limit = max(1, min(int(limit), 5000))
        cost_bps = float(max(0.0, min(200.0, cost_bps)))
        cost = cost_bps / 10000.0

        # load
        feats = read_latest_features(symbol_u).copy()
        regs = read_latest_regime(symbol_u, model=model).copy()

        # normalize dates for safe merge
        feats["date"] = pd.to_datetime(feats["date"]).dt.date
        regs["date"] = pd.to_datetime(regs["date"]).dt.date

        df = feats.merge(regs, on="date", how="inner").sort_values("date").reset_index(drop=True)
        if df.empty:
            raise ValueError("No overlapping dates between features and regime series.")

        if "close" not in df.columns or "risk_off_prob" not in df.columns:
            raise ValueError("Merged data missing required columns: close, risk_off_prob")

        # daily simple returns
        df["ret"] = df["close"].pct_change().fillna(0.0)

        # position: invest when risk_off_prob < threshold
        df["pos"] = (df["risk_off_prob"] < threshold).astype(int)

        # trade events when position flips
        df["trade"] = df["pos"].diff().abs().fillna(0.0)
        df["trade"] = (df["trade"] > 0).astype(int)

        # buy & hold equity
        df["bh"] = (1.0 + df["ret"]).cumprod()

        # gross regime returns and equity
        df["regime_gross_ret"] = df["ret"] * df["pos"]
        df["regime_gross"] = (1.0 + df["regime_gross_ret"]).cumprod()

        # costs applied on trade days
        df["tcost"] = df["trade"] * cost

        # net regime returns and equity
        df["regime_net_ret"] = df["regime_gross_ret"] - df["tcost"]
        df["regime_net"] = (1.0 + df["regime_net_ret"]).cumprod()

        # ---------- helpers ----------
        def _max_drawdown_from_equity(eq: pd.Series) -> float:
            eq = eq.astype(float)
            running_max = eq.cummax()
            dd = (eq / running_max) - 1.0
            return float(dd.min())

        def _perf_from_returns(ret: pd.Series) -> dict:
            r = ret.astype(float).dropna()
            n = int(len(r))
            if n < 5:
                return {
                    "n": n,
                    "cagr": None,
                    "ann_return": None,
                    "ann_vol": None,
                    "sharpe": None,
                }

            mean_d = float(r.mean())
            vol_d = float(r.std(ddof=1))
            ann_return = mean_d * 252.0
            ann_vol = vol_d * (252.0 ** 0.5)
            sharpe = (ann_return / ann_vol) if ann_vol > 0 else None

            # CAGR from realized equity
            eq = (1.0 + r).cumprod()
            years = max(1e-9, n / 252.0)
            cagr = float(eq.iloc[-1] ** (1.0 / years) - 1.0)

            return {
                "n": n,
                "cagr": cagr,
                "ann_return": ann_return,
                "ann_vol": ann_vol,
                "sharpe": sharpe,
            }

        def _summary(eq_col: str, ret_col: str) -> dict:
            eq = df[eq_col].astype(float)
            stats = _perf_from_returns(df[ret_col])
            stats["max_drawdown"] = _max_drawdown_from_equity(eq)
            stats["final_equity"] = float(eq.iloc[-1])
            return stats

        # strategy diagnostics
        trades = int(df["trade"].sum())
        years = max(1e-9, len(df) / 252.0)
        trades_per_year = float(trades / years)

        # cost impact: gross vs net final equity
        gross_final = float(df["regime_gross"].iloc[-1])
        net_final = float(df["regime_net"].iloc[-1])
        cost_drag = float(gross_final - net_final)

        summaries = {
            "buy_hold": _summary("bh", "ret"),
            "regime_gross": _summary("regime_gross", "regime_gross_ret"),
            "regime_net": _summary("regime_net", "regime_net_ret"),
        }

        # payload data (tail)
        out = df[["date", "bh", "regime_gross", "regime_net", "pos", "trade"]].copy()
        out["date"] = out["date"].astype(str)
        out = out.tail(limit)

        return {
            "debug": "REGIME_EQUITY_V3",
            "symbol": symbol_u,
            "model": model,
            "threshold": threshold,
            "cost_bps": cost_bps,
            "start": str(df["date"].min()),
            "end": str(df["date"].max()),
            "rows": int(len(out)),
            "trades": trades,
            "trades_per_year": trades_per_year,
            "cost_drag_final_equity": cost_drag,
            "summaries": summaries,
            "data": out.to_dict(orient="records"),
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))