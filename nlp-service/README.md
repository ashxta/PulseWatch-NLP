# PulseWatch NLP Service

Standalone FastAPI microservice implementing PulseWatch's NLP pipeline.
See `../NLP_ARCHITECTURE.md` for design, `../NLP_SETUP.md` to run it,
`../DATASET_SETUP.md` for datasets, and `../MODEL_EVALUATION.md` /
`../RAG_ARCHITECTURE.md` for evaluation and the RAG layer.

Quick start:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

```bash
python -m pytest tests/ -v
```
