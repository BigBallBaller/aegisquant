from regime import build_baseline_regime, save_regime, latest_regime_file, read_latest_regime
from features import read_latest_features
import pandas as pd

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from quality import quality_report

from features import build_features, save_features

from features import latest_features_file, read_latest_features

from data import pull_prices, latest_raw_file, read_latest_prices

app = FastAPI(title="AegisQuant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True, "service": "aegisquant-api"}

@app.get("/metrics/summary")
def metrics_summary():
    return {
        "symbol": "SPY",
        "cagr": 0.134,
        "sharpe": 1.12,
        "max_drawdown": -0.187,
        "updated_at": "local-dev"
    }

@app.post("/data/pull")
def data_pull(symbol: str = "SPY", start: str = "2010-01-01"):
    try:
        r = pull_prices(symbol=symbol, start=start)
        return r.__dict__
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/data/status")
def data_status(symbol: str = "SPY"):
    try:
        fp = latest_raw_file(symbol)
        if fp is None:
            return {"symbol": symbol.upper(), "cached": False}

        df = read_latest_prices(symbol)
        return {
            "symbol": symbol.upper(),
            "cached": True,
            "rows": int(len(df)),
            "start": str(df["date"].min().date()),
            "end": str(df["date"].max().date()),
            "latest_file": str(fp),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/data/quality")
def data_quality(symbol: str = "SPY"):
    try:
        df = read_latest_prices(symbol)
        return {"symbol": symbol.upper(), **quality_report(df)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/data/process")
def data_process(symbol: str = "SPY"):
    try:
        df = read_latest_prices(symbol)
        feats = build_features(df)
        r = save_features(symbol, feats)
        return r.__dict__
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/data/features/status")
def features_status(symbol: str = "SPY"):
    try:
        fp = latest_features_file(symbol)
        if fp is None:
            return {"symbol": symbol.upper(), "cached": False}

        df = read_latest_features(symbol)
        return {
            "symbol": symbol.upper(),
            "cached": True,
            "rows": int(len(df)),
            "start": str(pd.to_datetime(df["date"]).min().date()),
            "end": str(pd.to_datetime(df["date"]).max().date()),
            "latest_file": str(fp),
            "columns": list(df.columns),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/data/features/preview")
def features_preview(symbol: str = "SPY", n: int = 5):
    try:
        df = read_latest_features(symbol)
        n = max(1, min(int(n), 25))
        head = df.head(n).to_dict(orient="records")
        tail = df.tail(n).to_dict(orient="records")
        return {"symbol": symbol.upper(), "n": n, "head": head, "tail": tail}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/regime/run")
def regime_run(symbol: str = "SPY"):
    try:
        feats = read_latest_features(symbol)
        reg = build_baseline_regime(feats, vol_col="vol_20", z_window=252, k=1.25)
        r = save_regime(symbol, "baseline", reg)
        return r.__dict__
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/regime/status")
def regime_status(symbol: str = "SPY", model: str = "baseline"):
    try:
        fp = latest_regime_file(symbol, model=model)
        if fp is None:
            return {"symbol": symbol.upper(), "model": model, "cached": False}

        df = read_latest_regime(symbol, model=model)
        return {
            "symbol": symbol.upper(),
            "model": model,
            "cached": True,
            "rows": int(len(df)),
            "start": str(pd.to_datetime(df["date"]).min().date()),
            "end": str(pd.to_datetime(df["date"]).max().date()),
            "latest_file": str(fp),
            "columns": list(df.columns),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/regime/preview")
def regime_preview(symbol: str = "SPY", model: str = "baseline", n: int = 5):
    try:
        df = read_latest_regime(symbol, model=model)
        n = max(1, min(int(n), 25))
        return {
            "symbol": symbol.upper(),
            "model": model,
            "n": n,
            "head": df.head(n).to_dict(orient="records"),
            "tail": df.tail(n).to_dict(orient="records"),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/regime/series")
def regime_series(symbol: str = "SPY", model: str = "baseline", limit: int = 1500):
    try:
        df = read_latest_regime(symbol, model=model).copy()
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values("date")

        limit = max(50, min(int(limit), 5000))
        df = df.tail(limit)

        # send clean JSON types
        out = df.assign(date=df["date"].dt.strftime("%Y-%m-%d")).to_dict(orient="records")
        return {"symbol": symbol.upper(), "model": model, "rows": len(out), "data": out}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/features/series")
def features_series(symbol: str = "SPY", limit: int = 1500):
    try:
        df = read_latest_features(symbol).copy()
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values("date")

        limit = max(1, min(int(limit), 5000))
        df = df.tail(limit)

        keep = ["date", "close", "drawdown", "vol_20", "mom_60"]
        keep = [c for c in keep if c in df.columns]
        out = df[keep].assign(date=df["date"].dt.strftime("%Y-%m-%d")).to_dict(orient="records")

        return {"symbol": symbol.upper(), "rows": len(out), "data": out}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))