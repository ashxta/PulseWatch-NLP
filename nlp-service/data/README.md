# nlp-service/data/

Sample datasets shipped so the service runs out of the box. See
`../../DATASETS.md` for full provenance (source, purpose, fields, label
definitions) of each file, and `../../DATASET_SETUP.md` for how to
replace these with real datasets.

- `sample_phrasebank.csv` — 75 hand-written sentiment-labeled sentences
  (Financial PhraseBank-style: `text,label` with `positive`/`neutral`/
  `negative`). Used by `app/pipeline/sentiment.py`.
- `sample_news_categories.csv` — 40 hand-labeled news snippets across 9
  categories. Used by `app/pipeline/classification.py`.
- `sample_news.csv` — 15 short financial news articles across 4 tickers
  (TCS, RELIANCE, INFY, HDFC), used by every corpus-dependent module
  (NER demo, topic modeling, embeddings, clustering, event extraction,
  RAG retrieval).

None of these are large — safe to keep in version control. Do not add
scraped/licensed datasets here directly; point `NEWS_CORPUS_PATH` at an
external location instead (see DATASET_SETUP.md).
