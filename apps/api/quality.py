import pandas as pd


def quality_report(df: pd.DataFrame) -> dict:
    if "date" not in df.columns:
        return {"ok": False, "error": "missing date column"}

    d = df.copy()
    d["date"] = pd.to_datetime(d["date"])
    d = d.sort_values("date").reset_index(drop=True)

    # duplicates
    dup_dates = int(d["date"].duplicated().sum())

    # gaps in business days
    # expected business-day index from min to max
    full = pd.date_range(d["date"].min(), d["date"].max(), freq="B")
    actual = pd.DatetimeIndex(d["date"].unique())
    missing = full.difference(actual)

    # basic sanity
    close_missing = int(d["close"].isna().sum()) if "close" in d.columns else None
    volume_missing = int(d["volume"].isna().sum()) if "volume" in d.columns else None

    report = {
        "ok": True,
        "rows": int(len(d)),
        "start": str(d["date"].min().date()),
        "end": str(d["date"].max().date()),
        "duplicate_dates": dup_dates,
        "missing_business_days_count": int(len(missing)),
        "missing_business_days_sample": [str(x.date()) for x in missing[:10]],
        "close_missing": close_missing,
        "volume_missing": volume_missing,
    }
    return report