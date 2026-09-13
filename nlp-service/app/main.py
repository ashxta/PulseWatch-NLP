from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .schemas import TextIn, RagQueryIn
from .pipeline import preprocessing, tfidf, sentiment, ner, topics, embeddings
from .pipeline import classification, aspect_sentiment, events, summarization
from .pipeline import clustering, rag, attention, corpus

app = FastAPI(
    title="PulseWatch NLP Service",
    description="Standalone NLP microservice for PulseWatch financial market intelligence.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to the Next.js origin in production; see NLP_SETUP.md
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "pulsewatch-nlp"}


# ---------------------------------------------------------------- demo --
@app.post("/nlp/analyze")
def analyze(payload: TextIn):
    """Runs the full pipeline on one piece of text. Powers the NLP Demo page."""
    text = payload.text
    pre = preprocessing.preprocess(text)
    sent = sentiment.predict_sentiment(text)
    entities = ner.extract_entities(text)
    category = classification.classify_text(text)
    aspects = aspect_sentiment.analyze_aspects(text)
    event_result = events.extract_events(text)
    keyphrases = tfidf.extract_keyphrases(text, corpus_texts=[a.full_text for a in corpus.load_corpus()])

    background = [a.full_text for a in corpus.load_corpus()]
    similar = []
    if background:
        idx = tfidf.build_tfidf_index([a.id for a in corpus.load_corpus()], background)
        similar = idx.similar_to_text(text, top_k=3)

    embedder, method = embeddings.get_default_embedder(background or [text])

    return {
        "preprocessing": pre.to_dict(),
        "sentiment": sent.__dict__,
        "entities": entities,
        "category": category,
        "aspectSentiment": aspects,
        "event": event_result,
        "keyphrases": keyphrases,
        "similarArticles": similar,
        "embeddingInfo": {"method": method, "dimension": len(embedder.embed(text))},
    }


# ------------------------------------------------------------ per-part --
@app.post("/nlp/preprocess")
def api_preprocess(payload: TextIn):
    return preprocessing.preprocess(payload.text).to_dict()


@app.post("/nlp/sentiment")
def api_sentiment(payload: TextIn):
    return sentiment.predict_sentiment(payload.text).__dict__


@app.get("/nlp/sentiment/evaluate")
def api_sentiment_evaluate():
    return sentiment.get_classical_model().evaluate()


@app.post("/nlp/entities")
def api_entities(payload: TextIn):
    return ner.extract_entities(payload.text)


@app.post("/nlp/classify")
def api_classify(payload: TextIn):
    return classification.classify_text(payload.text)


@app.get("/nlp/classify/evaluate")
def api_classify_evaluate():
    return classification.get_classifier().evaluate()


@app.post("/nlp/aspects")
def api_aspects(payload: TextIn):
    return aspect_sentiment.analyze_aspects(payload.text)


@app.post("/nlp/events")
def api_events(payload: TextIn):
    return events.extract_events(payload.text)


@app.post("/nlp/summarize")
def api_summarize(payload: TextIn):
    return summarization.summarize_text(payload.text)


@app.post("/nlp/keyphrases")
def api_keyphrases(payload: TextIn):
    background = [a.full_text for a in corpus.load_corpus()]
    return {"keyphrases": tfidf.extract_keyphrases(payload.text, corpus_texts=background)}


@app.get("/nlp/topics")
def api_topics(num_topics: int = 5):
    articles = corpus.load_corpus()
    if not articles:
        return {"numTopics": 0, "topics": [], "note": "No corpus loaded. See DATASET_SETUP.md."}
    result = topics.run_lda([a.id for a in articles], [a.full_text for a in articles], num_topics=num_topics)
    return {
        "numTopics": result.num_topics,
        "topics": result.topics,
        "docTopics": dict(zip([a.id for a in articles], result.doc_topics)),
    }


@app.get("/nlp/clusters")
def api_clusters():
    articles = corpus.load_corpus()
    if not articles:
        return {"clusters": [], "note": "No corpus loaded. See DATASET_SETUP.md."}
    return clustering.cluster_articles([a.id for a in articles], [a.full_text for a in articles])


# ------------------------------------------------------------- per-ticker
@app.get("/stocks/{ticker}/news")
def stock_news(ticker: str):
    articles = corpus.articles_for_ticker(ticker)
    return {"ticker": ticker.upper(), "count": len(articles), "articles": [a.__dict__ for a in articles]}


@app.get("/stocks/{ticker}/sentiment")
def stock_sentiment(ticker: str):
    articles = corpus.articles_for_ticker(ticker)
    if not articles:
        return {"ticker": ticker.upper(), "articleCount": 0, "overallSentiment": None}
    model = sentiment.get_classical_model()
    results = [model.predict(a.text) for a in articles]
    positive = sum(1 for r in results if r.sentiment == "POSITIVE")
    negative = sum(1 for r in results if r.sentiment == "NEGATIVE")
    neutral = len(results) - positive - negative
    overall = "POSITIVE" if positive > negative and positive > neutral else (
        "NEGATIVE" if negative > positive and negative > neutral else "NEUTRAL"
    )
    return {
        "ticker": ticker.upper(),
        "articleCount": len(articles),
        "distribution": {"positive": positive, "neutral": neutral, "negative": negative},
        "overallSentiment": overall,
        "avgConfidence": round(sum(r.confidence for r in results) / len(results), 4),
        "perArticle": [
            {"articleId": a.id, "headline": a.headline, **r.__dict__}
            for a, r in zip(articles, results)
        ],
    }


@app.get("/stocks/{ticker}/topics")
def stock_topics(ticker: str):
    articles = corpus.articles_for_ticker(ticker)
    all_articles = corpus.load_corpus()
    if len(all_articles) < 2:
        return {"ticker": ticker.upper(), "topics": [], "note": "Not enough corpus data."}
    result = topics.run_lda([a.id for a in all_articles], [a.full_text for a in all_articles], num_topics=5)
    ids_for_ticker = {a.id for a in articles}
    id_list = [a.id for a in all_articles]
    relevant_topics = []
    for doc_id, dist in zip(id_list, result.doc_topics):
        if doc_id in ids_for_ticker and dist:
            relevant_topics.append(dist[0])
    return {"ticker": ticker.upper(), "topics": relevant_topics}


@app.get("/stocks/{ticker}/events")
def stock_events(ticker: str):
    articles = corpus.articles_for_ticker(ticker)
    out = []
    for a in articles:
        result = events.extract_events(a.full_text)
        if result["eventDetected"]:
            out.append({"articleId": a.id, "headline": a.headline, **result["events"][0]})
    return {"ticker": ticker.upper(), "events": out}


@app.get("/stocks/{ticker}/summary")
def stock_summary(ticker: str):
    articles = corpus.articles_for_ticker(ticker)
    if not articles:
        return {"ticker": ticker.upper(), "summary": None}
    return {"ticker": ticker.upper(), **summarization.summarize_articles([a.full_text for a in articles])}


@app.get("/stocks/{ticker}/related-news")
def stock_related_news(ticker: str, article_id: str | None = None):
    articles = corpus.load_corpus()
    if not articles:
        raise HTTPException(404, "No corpus loaded. See DATASET_SETUP.md.")
    idx = tfidf.build_tfidf_index([a.id for a in articles], [a.full_text for a in articles])
    target_id = article_id
    if target_id is None:
        ticker_articles = [a for a in articles if a.ticker.upper() == ticker.upper()]
        if not ticker_articles:
            raise HTTPException(404, "No articles found for ticker")
        target_id = ticker_articles[-1].id
    doc_index = [a.id for a in articles].index(target_id)
    return {"articleId": target_id, "related": idx.most_similar(doc_index, top_k=4)}


@app.get("/stocks/{ticker}/nlp-intelligence")
def stock_nlp_intelligence(ticker: str):
    """Aggregated endpoint powering the dashboard's NLP Intelligence panel."""
    sentiment_data = stock_sentiment(ticker)
    events_data = stock_events(ticker)
    attention_data = attention.compute_news_attention(ticker)
    topics_data = stock_topics(ticker)
    summary_data = stock_summary(ticker)
    return {
        "ticker": ticker.upper(),
        "sentiment": sentiment_data,
        "topics": topics_data["topics"],
        "events": events_data["events"],
        "summary": summary_data.get("summary"),
        "attention": attention_data,
    }


@app.get("/stocks/{ticker}/attention")
def stock_attention(ticker: str):
    return attention.compute_news_attention(ticker)


# --------------------------------------------------------------------- rag
@app.post("/rag/query")
def rag_query(payload: RagQueryIn):
    return rag.answer_query(payload.query, ticker=payload.ticker, top_k=payload.top_k)
