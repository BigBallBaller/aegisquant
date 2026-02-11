# AegisQuant
## Volatility-Normalized Regime Detection & Risk Overlay Engine

AegisQuant is a research-grade regime detection framework designed to identify volatility-driven market states and evaluate systematic risk overlays under realistic execution assumptions.

The system implements a volatility-normalized signal architecture, maps regime probabilities through a logistic transformation, and measures performance impact across risk-adjusted metrics with explicit transaction cost modeling.

This project demonstrates end-to-end quantitative research infrastructure:  
data ingestion → feature engineering → regime modeling → forward-return evaluation → strategy simulation → interactive visualization.


---

## Research Objective

Volatility exhibits clustering behavior and state persistence.  
Elevated volatility regimes are often associated with deteriorating forward returns and drawdown acceleration.

This framework evaluates whether a volatility-normalized regime signal can:

- Improve risk-adjusted returns
- Compress drawdown
- Reduce tail exposure
- Maintain reasonable turnover under transaction costs


---

## Model Specification

Baseline Regime Model:

- 20-day realized volatility (`vol_20`)
- 252-day rolling mean and standard deviation
- Z-score normalization
- Logistic mapping via sigmoid function:

    risk_off_prob = 1 / (1 + exp(-k * z_vol))

Where:
- `k` controls transition sharpness
- `threshold` determines allocation regime

Allocation Rule:
- Long equity when `risk_off_prob < threshold`
- Move to cash when `risk_off_prob ≥ threshold`

Evaluation is conducted using forward returns to eliminate lookahead bias.


---

## Strategy Simulation

The system computes:

- Buy & Hold baseline
- Regime gross equity curve
- Regime net equity curve (transaction cost-adjusted)
- Trade detection
- Cost drag analysis
- Annualized metrics
- Maximum drawdown

Transaction costs are modeled in basis points per regime transition.


---

## Example Results (SPY, 2011–2026)

Buy & Hold:
- CAGR ≈ 11.9%
- Sharpe ≈ 0.74
- Max Drawdown ≈ -34%

Regime Gross:
- CAGR ≈ 7.9%
- Sharpe ≈ 0.97
- Max Drawdown ≈ -10%

Regime Net (5 bps per trade):
- CAGR ≈ 7.4%
- Sharpe ≈ 0.91
- Max Drawdown ≈ -11.8%
- ~9 trades per year

Observations:
- Material drawdown compression
- Sharpe improvement
- Moderate cost drag
- Low-to-moderate turnover

The signal improves risk profile meaningfully while sacrificing some terminal return.


---

## Architecture

Raw Market Data  
→ Feature Engineering (volatility, drawdown, momentum)  
→ Rolling Z-Score Normalization  
→ Logistic Regime Probability  
→ Allocation Engine  
→ Cost-Aware Simulation  
→ Performance Analytics  
→ Interactive Research Dashboard  


---

## API Endpoints

Data
- POST /data/pull
- POST /data/process
- GET /data/features/status

Regime
- POST /regime/run
- GET /regime/series
- GET /regime/stats
- GET /regime/equity


---

## Technology Stack

Backend:
- Python
- FastAPI
- Pandas / NumPy

Frontend:
- Next.js (App Router)
- TypeScript
- Recharts
- TailwindCSS
- shadcn/ui

The system is modular, API-driven, and built for extensibility.


---

## Design Principles

- Forward-return evaluation (no lookahead bias)
- Explicit transaction cost modeling
- Probability-based regime confidence
- Separation of gross vs net performance
- Modular router architecture
- Clean JSON interfaces for research UI integration
- Fully reproducible pipeline


---

## Extension Roadmap

- Hidden Markov regime models
- Multi-factor volatility surfaces
- Cross-asset validation
- Portfolio-level allocation engine
- Walk-forward validation framework
- Adaptive threshold optimization
- Risk parity within regime states
- Out-of-sample stress testing


---

## Purpose

AegisQuant was built to demonstrate:

- Systematic regime modeling
- Risk overlay design
- Cost-aware strategy simulation
- Quant research infrastructure engineering
- Full-stack research deployment

This repository reflects institutional-style research discipline applied in an end-to-end implementation.