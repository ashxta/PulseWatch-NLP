# NLP_SETUP.md

## 0. Environment versions used for this build

Tested with:
- **Python**: 3.12 (3.11+ should work; the Dockerfile uses `python:3.11-slim`)
- **Node.js**: 22 (Next.js 14 requires 18.17+)
- **Next.js**: 14.2.x, **React**: 18.3.x, **TypeScript**: 5.6.x (see `package.json`)
- **Key Python packages** (pinned lower bounds in `requirements.txt`):
  `fastapi>=0.110`, `scikit-learn>=1.4`, `gensim>=4.3`, `faiss-cpu>=1.8`,
  `pandas>=2.2`, `numpy>=1.26`
- **PostgreSQL**: whatever version the base PulseWatch app already
  targets (unchanged by this work — see the root `README.md`)

Reproducibility notes:
- All model-training code paths use a fixed `random_state=42` (or an
  explicit `seed` parameter defaulting to 42) — see `sentiment.py`,
  `classification.py`, `topics.py`, `embeddings.py`. Re-running any
  evaluation script or the test suite reproduces the same numbers.
- The evaluation scripts (`evaluation/evaluate_sentiment.py`,
  `evaluation/evaluate_classification.py`) regenerate their Markdown
  reports from scratch each run — nothing in `MODEL_EVALUATION.md` is
  hand-edited independently of those scripts.

## 1. Run the Next.js app (unchanged)

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

PulseWatch's core watchlist/attention functionality works with **zero**
Python dependency. If `NLP_FEATURE_ENABLED=false` or the NLP service
isn't running, NLP panels show a quiet "unavailable" state instead of
breaking anything (see `src/server/modules/nlp/client.ts`).

## 2. Run the NLP service

```bash
cd nlp-service
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Verify it's up: `curl http://localhost:8000/health` → `{"status":"ok",...}`.

Set in your Next.js `.env`:

```
NLP_SERVICE_URL=http://localhost:8000
NLP_SERVICE_TIMEOUT_MS=8000
NLP_FEATURE_ENABLED=true
```

## 3. Optional: transformer models (FinBERT, spaCy, sentence-transformers)

Not installed by default — this repo's sandbox build couldn't reach
huggingface.co / spaCy's model host, and `torch` alone is >2GB. On a
machine with normal internet access:

```bash
cd nlp-service
pip install -r requirements.txt -r requirements-transformers.txt
python -m spacy download en_core_web_sm
```

First run will download:
- FinBERT (`ProsusAI/finbert`, ~440MB) — used automatically by
  `sentiment.predict_sentiment()` once available; falls back to the
  classical model if the download/import fails for any reason.
- `sentence-transformers/all-MiniLM-L6-v2` (~90MB) — used automatically
  by `embeddings.get_default_embedder()` for RAG/clustering/similarity.
- `en_core_web_sm` (~12MB) — used automatically by `ner.get_ner_engine()`.

No code changes needed — every one of these has a try/except-guarded
optional path in the pipeline modules and reports which implementation
actually served each request (`modelUsed` / `engine` / `embeddingMethod`
fields in API responses).

## 4. Optional: LLM-backed RAG generation

`rag.py`'s retrieval step is always real vector search. The final
answer-generation step is optional:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Set on the NLP service's environment (not the Next.js app — the Python
service is what calls the Anthropic API). Without it, `/rag/query`
returns a templated, zero-hallucination-risk extractive answer built
directly from retrieved snippets — still fully functional, just less
fluent.

## 5. Run both together

Two terminals:

```bash
# Terminal 1
cd nlp-service && uvicorn app.main:app --reload --port 8000

# Terminal 2
npm run dev
```

Visit `http://localhost:3000`, add a symbol like `TCS` to a watchlist,
and the NLP Intelligence card should populate. Visit `/news?ticker=TCS`
for the full News Intelligence page and `/nlp-demo` to paste arbitrary
text through the whole pipeline.

## 6. Run the tests

```bash
# Python NLP service
cd nlp-service
pip install -r requirements-dev.txt   # requirements.txt + pytest + httpx (TestClient dep)
python -m pytest tests/ -v

# Next.js
npm test          # vitest run
npm run typecheck # tsc --noEmit
npm run lint       # eslint
```

## 7. Run the evaluation scripts

```bash
cd nlp-service
python evaluation/evaluate_sentiment.py        # sentiment: classical vs optional FinBERT
python evaluation/evaluate_classification.py   # news category classifier
```

Writes real, measured metrics (train/test sizes, accuracy, precision,
recall, F1, confusion matrix) to `evaluation/metrics_report.md` and
`evaluation/classification_metrics_report.md` respectively. See
MODEL_EVALUATION.md for the current output of both, with methodology
notes (train/test split, no separate dev split and why, dataset-size
caveats).

## 8. Docker (optional)

```bash
cd nlp-service
docker build -t pulsewatch-nlp .
docker run -p 8000:8000 pulsewatch-nlp
```
