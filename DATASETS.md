# DATASETS.md

This document lists every dataset physically included in this
repository: its source, purpose, exact fields, label definitions, size,
and — most importantly — whether it is sample/demo data or a full
research-grade corpus. See DATASET_SETUP.md for how to replace any of
these with real, larger datasets.

**All three datasets below are hand-written sample/demo data created for
this project, not scraped or downloaded from an external source, and not
claimed to be the Financial PhraseBank or any other named public
dataset.** They exist so the service runs, trains, and evaluates
end-to-end with zero external downloads and zero licensing concerns.
Nothing in this repository claims these are production-scale or
third-party-sourced datasets.

---

## 1. `nlp-service/data/sample_phrasebank.csv`

- **Status**: Sample/demo data. **Not** the real Financial PhraseBank
  (Malo et al., 2014) — styled after it (short financial sentences
  labeled positive/neutral/negative) but hand-written for this project.
- **Source**: Hand-written for this repository.
- **Purpose**: Trains and evaluates the classical sentiment model
  (`app/pipeline/sentiment.py::ClassicalSentimentModel`).
- **Size**: 75 rows.
- **Fields**:
  | Field | Type | Description |
  |---|---|---|
  | `text` | string | A short financial sentence |
  | `label` | string | One of `positive`, `neutral`, `negative` (lowercase) |
- **Label definitions**: `positive` — the sentence describes a
  favorable financial outcome or expectation (e.g. revenue growth,
  earnings beat). `negative` — an unfavorable outcome (e.g. losses,
  layoffs, regulatory fines). `neutral` — factual/administrative
  statements with no clear favorable/unfavorable framing (e.g. meeting
  schedules, routine filings).
- **Class balance**: roughly even across the three labels (~25 rows
  each) by construction.
- **Known limitation**: too small for a statistically reliable accuracy
  estimate — see MODEL_EVALUATION.md. Swap in the real Financial
  PhraseBank per DATASET_SETUP.md for meaningful numbers.
- **License/attribution**: original text written for this project; no
  third-party license applies. If you replace this file with the real
  Financial PhraseBank, note that dataset's own citation/license
  requirements (see DATASET_SETUP.md).

## 2. `nlp-service/data/sample_news_categories.csv`

- **Status**: Sample/demo data, hand-written for this project.
- **Source**: Hand-written for this repository.
- **Purpose**: Trains and evaluates the news category classifier
  (`app/pipeline/classification.py::NewsClassifier`).
- **Size**: 40 rows.
- **Fields**:
  | Field | Type | Description |
  |---|---|---|
  | `text` | string | A short financial news sentence/snippet |
  | `label` | string | One of the 9 categories below |
- **Label definitions** (`classification.CATEGORIES`):
  `EARNINGS` (quarterly results, profit/revenue), `M&A` (mergers,
  acquisitions, takeovers), `PARTNERSHIP` (collaborations, alliances,
  tie-ups), `PRODUCT` (launches, new offerings), `REGULATION`
  (fines, lawsuits, regulatory scrutiny), `MANAGEMENT` (leadership
  changes, executive appointments/resignations), `AI_TECHNOLOGY`
  (AI/ML/cloud infrastructure investment), `MACROECONOMICS`
  (interest rates, inflation, GDP, central-bank policy), `OTHER`
  (administrative/no clear category).
- **Class balance**: roughly 4-5 rows per category (imbalanced test-fold
  behavior documented in MODEL_EVALUATION.md).
- **Known limitation**: too small for reliable per-class metrics — several
  classes will show 0 precision/recall on any given split purely from
  sample size. See MODEL_EVALUATION.md.
- **License/attribution**: original text written for this project.

## 3. `nlp-service/data/sample_news.csv`

- **Status**: Sample/demo data, hand-written for this project. **Not**
  real news wire content and not scraped from any publisher — headlines,
  sources (`MarketWire`, `FinNews`, `RegWatch`), and dates are fictional.
- **Source**: Hand-written for this repository. Ticker/company names
  (TCS, Reliance, Infosys, HDFC Bank) are real companies, but the
  specific articles describing them are fictional illustrative examples,
  not real reporting.
- **Purpose**: Backs every corpus-dependent NLP feature: NER demo, topic
  modeling, Word2Vec training, clustering, event extraction, and RAG
  retrieval (`app/pipeline/corpus.py::load_corpus`).
- **Size**: 15 articles across 4 tickers.
- **Fields**:
  | Field | Type | Description |
  |---|---|---|
  | `id` | string | Unique article id (e.g. `n001`) |
  | `headline` | string | Article headline |
  | `text` | string | Article body (1-3 sentences) |
  | `date` | string | ISO date (`YYYY-MM-DD`), fictional |
  | `source` | string | Fictional publication name |
  | `ticker` | string | Stock ticker the article is about |
- **Known limitation**: far too small and too clean (no noise, no
  duplicate/near-duplicate coverage beyond what's deliberately included
  for the clustering demo) to represent a real news feed. RAG answers,
  topic labels, and clustering results should be read as "the pipeline
  works correctly," not as real financial reporting or real market
  commentary. **The RAG system will only ever cite articles from this
  file** — see RAG_ARCHITECTURE.md's hallucination-mitigation section.
- **License/attribution**: original fictional text written for this
  project; no third-party license applies.

---

## What is NOT included in this repository

- The real Financial PhraseBank dataset (must be downloaded separately;
  see DATASET_SETUP.md §1).
- Any real scraped/licensed financial news corpus (see DATASET_SETUP.md §2).
- Any pretrained model weights (FinBERT, spaCy models, sentence-transformer
  models) — these are downloaded on demand by the optional transformer
  path, never bundled in this repo (see NLP_SETUP.md §3).

## Data collection & ethics note

No web scraping, API calls to third-party news providers, or PII
collection occurs anywhere in this codebase. All sample data was
authored directly for this project. If you connect a real news source
per DATASET_SETUP.md, you are responsible for complying with that
source's terms of service and any applicable copyright/licensing terms —
this project does not vet or endorse any particular data source.
