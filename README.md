# AegisQuant
Probabilistic regime inference and uncertainty-aware allocation on real market data.

## Dev
### API
cd apps/api
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000