# DATASET_SETUP.md

PulseWatch's NLP service ships with small sample datasets so it runs out
of the box. See DATASETS.md for the exact provenance, fields, and label
definitions of those shipped datasets. This document is about replacing
them with real, larger datasets for research-grade results.

## 1. Financial PhraseBank (sentiment)

Used by `app/pipeline/sentiment.py` and `app/pipeline/classification.py`
(the classification dataset is a separate, hand-labeled file — see §3).

1. Download from the official source (search "Financial PhraseBank
   Malo et al. 2014" — commonly distributed via Hugging Face Datasets
   `financial_phrasebank` or the original researchers' page). Respect
   its license/citation requirements.
2. Convert to CSV with exactly two columns: `text,label` where `label`
   is one of `positive`, `neutral`, `negative` (lowercase).
3. Save as `nlp-service/data/financial_phrasebank_full.csv`.
4. Point the service at it:

   ```python
   # nlp-service/app/pipeline/sentiment.py
   DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "financial_phrasebank_full.csv"
   ```

   or set an env var and read it in `_load_dataset` — either works;
   the current code favors an explicit constant for clarity in a
   student project.

## 2. Financial news corpus (NER, topics, embeddings, clustering, events, RAG)

Used by `app/pipeline/corpus.py`. Any CSV/JSON/JSONL matching this
schema:

```json
{
  "id": "n001",
  "headline": "TCS signs $2 billion AI partnership with Microsoft",
  "text": "Full article body...",
  "date": "2026-08-12",
  "source": "MarketWire",
  "ticker": "TCS"
}
```

Options:
- Kaggle financial news datasets (search "financial news headlines
  dataset" / "Reuters financial news").
- A scraper you control, respecting each source's terms of service —
  **do not** scrape paywalled content.
- Your own curated set (the shipped `sample_news.csv` is exactly this,
  just small).

Place the file at `nlp-service/data/` and point `NEWS_CORPUS_PATH` at
it:

```bash
export NEWS_CORPUS_PATH=/absolute/path/to/your_news.csv
```

If unset, the service defaults to `data/sample_news.csv`. If the file is
missing entirely, `corpus.load_corpus()` returns an empty list and every
downstream endpoint degrades gracefully (empty results + a `note` field)
rather than crashing — verified by
`tests/test_pipeline.py::test_attention_score_handles_unknown_ticker_gracefully`.

## 3. News category labels (optional, for classification.py)

`nlp-service/data/sample_news_categories.csv` — same idea as
PhraseBank: `text,label` where `label` is one of the categories in
`classification.CATEGORIES`. Label more articles from your real corpus
for a more reliable classifier; 40 rows (the shipped sample) is enough
to demonstrate the pipeline, not enough for production accuracy.

## 4. Do not commit large datasets

`.gitignore` already excludes common large-data patterns; add your
dataset paths there explicitly if they don't match. Keep only the small
sample files in version control.

## 5. If no dataset is present

Every pipeline module that depends on the corpus (`corpus.load_corpus()`
returning `[]`) has an explicit empty-state branch — checked by the test
suite — so the API starts and responds with `{"note": "No corpus
loaded..."}`-style payloads instead of 500ing. The sentiment/classification
models still work off their small bundled CSVs regardless of the news
corpus being present.
