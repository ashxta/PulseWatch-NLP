import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client():
    from app.main import app
    return TestClient(app)


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


@pytest.mark.parametrize("text", ["a", "A B", "123", "!!!", "a a a a", "A. B. C. D. E."])
def test_text_endpoints_never_500_on_degenerate_input(client, text):
    """Every text-accepting endpoint must degrade gracefully (2xx with an
    empty/fallback result), never raise an unhandled 500, on short or
    degenerate pasted text — this is exactly the kind of input the
    /nlp-demo page's free-text box invites."""
    endpoints = [
        "/nlp/analyze", "/nlp/preprocess", "/nlp/sentiment", "/nlp/entities",
        "/nlp/classify", "/nlp/aspects", "/nlp/events", "/nlp/summarize",
        "/nlp/keyphrases",
    ]
    for ep in endpoints:
        res = client.post(ep, json={"text": text})
        assert res.status_code < 500, f"{ep} raised a server error on {text!r}: {res.text}"


def test_topics_normal_corpus_includes_num_topics(client):
    res = client.get("/nlp/topics")
    assert res.status_code == 200
    body = res.json()
    assert "numTopics" in body
    assert "topics" in body


def test_topics_empty_corpus(monkeypatch, tmp_path):
    """The empty-corpus branch of GET /nlp/topics must still include
    'numTopics', which the Next.js Zod schema (topicsResultSchema)
    requires as non-optional — otherwise a legitimate empty state gets
    reported to the frontend as 'NLP service unavailable' instead of
    'no articles yet'."""
    empty_csv = tmp_path / "empty.csv"
    empty_csv.write_text("id,headline,text,date,source,ticker\n")
    monkeypatch.setenv("NEWS_CORPUS_PATH", str(empty_csv))

    # Re-import app fresh so corpus.load_corpus() picks up the new env var
    # (module-level singletons elsewhere are per-request, not cached at
    # import time, so a plain re-import is sufficient here).
    import importlib
    import app.main as main_module
    importlib.reload(main_module)
    from fastapi.testclient import TestClient as TC
    fresh_client = TC(main_module.app)

    res = fresh_client.get("/nlp/topics")
    assert res.status_code == 200
    body = res.json()
    assert body["numTopics"] == 0
    assert body["topics"] == []
    assert "note" in body


def test_related_news_empty_corpus_returns_clean_404(monkeypatch, tmp_path):
    """The empty-corpus branch of GET /stocks/{ticker}/related-news must
    return a clean 404 rather than a 200 body missing the required
    'articleId' field that the Next.js Zod schema expects."""
    empty_csv = tmp_path / "empty.csv"
    empty_csv.write_text("id,headline,text,date,source,ticker\n")
    monkeypatch.setenv("NEWS_CORPUS_PATH", str(empty_csv))

    import importlib
    import app.main as main_module
    importlib.reload(main_module)
    from fastapi.testclient import TestClient as TC
    fresh_client = TC(main_module.app)

    res = fresh_client.get("/stocks/TCS/related-news")
    assert res.status_code == 404


def test_nlp_intelligence_unknown_ticker_matches_schema(client):
    """An unrecognized ticker must still return a well-formed body (zero
    counts, null summary) rather than an error, per the 'graceful
    empty/sample state' requirement."""
    res = client.get("/stocks/NOSUCHTICKER/nlp-intelligence")
    assert res.status_code == 200
    body = res.json()
    assert body["sentiment"]["articleCount"] == 0
    assert body["attention"]["newsAttentionScore"] == 0.0


def test_rag_query_endpoint(client):
    res = client.post("/rag/query", json={"query": "Why is TCS moving today?", "ticker": "TCS"})
    assert res.status_code == 200
    body = res.json()
    assert "answer" in body
    assert "sources" in body
