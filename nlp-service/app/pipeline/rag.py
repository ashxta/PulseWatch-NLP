"""
Retrieval-Augmented Generation over the financial news corpus.

Pipeline (per RAG_ARCHITECTURE.md):
  query -> query embedding -> FAISS similarity search -> top-K articles
  -> context construction -> (optional) LLM generation -> grounded answer + sources

Retrieval is REAL vector search (FAISS, IndexFlatIP over normalized
vectors = cosine similarity), never a raw LLM call. Generation is
optional: if ANTHROPIC_API_KEY is not set, `answer_query()` returns a
templated extractive answer built directly from the retrieved snippets
(no hallucination possible, since nothing is generated) plus the same
sources/evidence a generation-backed answer would include. If the key IS
set, the LLM is instructed to answer ONLY from the provided context and
to say so explicitly when evidence is insufficient.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

import faiss
import numpy as np

from .corpus import Article, load_corpus
from .embeddings import get_default_embedder
from .sentiment import get_classical_model
from .classification import classify_text


@dataclass
class RetrievedDoc:
    article: Article
    similarity: float


class NewsVectorIndex:
    """FAISS-backed vector index over the article corpus. Rebuilt
    on-demand (small corpora); a production build would persist the
    index and update it incrementally as articles arrive."""

    def __init__(self, articles: list[Article]):
        self.articles = articles
        if not articles:
            # An empty corpus (e.g. NEWS_CORPUS_PATH unset/missing, or the
            # sample data was deleted) must not crash index construction —
            # get_default_embedder([]).fit on zero documents raises
            # ValueError from scikit-learn ("empty vocabulary"). Skip
            # straight to an empty, always-safe index; search() below
            # already short-circuits on `not self.articles`.
            self.embedder = None
            self.embedding_method = "none (empty corpus)"
            self.dim = 0
            self.index = None
            return
        texts = [a.full_text for a in articles]
        self.embedder, self.embedding_method = get_default_embedder(texts)
        vectors = np.asarray(self.embedder.embed_all(texts), dtype="float32")
        faiss.normalize_L2(vectors)
        self.dim = vectors.shape[1] if vectors.ndim == 2 else 0
        self.index = faiss.IndexFlatIP(self.dim)
        self.index.add(vectors)

    def search(self, query: str, top_k: int = 5, ticker: str | None = None) -> list[RetrievedDoc]:
        if not self.articles:
            return []
        q_vec = np.asarray([self.embedder.embed(query)], dtype="float32")
        faiss.normalize_L2(q_vec)
        # Over-fetch then filter by ticker, since FAISS IndexFlatIP has
        # no native metadata filtering.
        k = min(len(self.articles), max(top_k * 4, top_k))
        sims, idxs = self.index.search(q_vec, k)
        results = []
        for sim, idx in zip(sims[0], idxs[0]):
            if idx < 0:
                continue
            article = self.articles[idx]
            if ticker and article.ticker.upper() != ticker.upper():
                continue
            results.append(RetrievedDoc(article=article, similarity=float(sim)))
            if len(results) >= top_k:
                break
        return results


_index_singleton: NewsVectorIndex | None = None


def get_index(refresh: bool = False) -> NewsVectorIndex:
    global _index_singleton
    if _index_singleton is None or refresh:
        _index_singleton = NewsVectorIndex(load_corpus())
    return _index_singleton


MIN_RELEVANT_SIMILARITY = 0.12  # below this, we treat retrieval as "no real evidence"

SYSTEM_PROMPT = (
    "You are PulseWatch's financial news assistant. Answer the user's question "
    "using ONLY the numbered context articles provided below. "
    "Cite articles by their [n] marker when you use them. "
    "If the context does not contain enough information to answer confidently, "
    "say explicitly: 'There is insufficient evidence in the retrieved articles to answer this.' "
    "Never invent an article, statistic, date, source, or quotation that is not in the context."
)


def _build_context(docs: list[RetrievedDoc]) -> str:
    lines = []
    for i, d in enumerate(docs, start=1):
        lines.append(
            f"[{i}] ({d.article.date}, {d.article.source}, {d.article.ticker}) "
            f"{d.article.headline}: {d.article.text}"
        )
    return "\n".join(lines)


def _templated_extractive_answer(query: str, docs: list[RetrievedDoc]) -> str:
    """No-LLM fallback: a transparent, template-built answer directly
    from retrieved snippets. Always faithful by construction since
    nothing is generated beyond string concatenation."""
    if not docs:
        return "There is insufficient evidence in the retrieved articles to answer this."
    parts = [f"Based on {len(docs)} retrieved article(s):"]
    for i, d in enumerate(docs, start=1):
        parts.append(f"[{i}] {d.article.headline} ({d.article.date}, {d.article.source}).")
    return " ".join(parts)


def _call_anthropic(query: str, context: str) -> str | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    # Configurable so this doesn't need a code change when Anthropic
    # ships a new model; defaults to a current Claude model string.
    model = os.environ.get("ANTHROPIC_RAG_MODEL", "claude-sonnet-5")
    try:
        import requests
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 500,
                "system": SYSTEM_PROMPT,
                "messages": [{
                    "role": "user",
                    "content": f"Context articles:\n{context}\n\nQuestion: {query}",
                }],
            },
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        text_blocks = [b["text"] for b in data.get("content", []) if b.get("type") == "text"]
        return "\n".join(text_blocks) if text_blocks else None
    except Exception:
        return None


def answer_query(query: str, ticker: str | None = None, top_k: int = 5) -> dict:
    index = get_index()
    docs = index.search(query, top_k=top_k, ticker=ticker)
    relevant_docs = [d for d in docs if d.similarity >= MIN_RELEVANT_SIMILARITY]

    if not relevant_docs:
        return {
            "answer": "There is insufficient evidence in the retrieved articles to answer this.",
            "sources": [],
            "retrievedDocuments": [],
            "confidence": 0.0,
            "generation": "none (no sufficiently relevant documents retrieved)",
        }

    context = _build_context(relevant_docs)
    llm_answer = _call_anthropic(query, context)
    generation_mode = "llm-grounded" if llm_answer else "templated-extractive (no ANTHROPIC_API_KEY set)"
    answer = llm_answer or _templated_extractive_answer(query, relevant_docs)

    sentiment_model = get_classical_model()
    sources = []
    for i, d in enumerate(relevant_docs, start=1):
        sentiment = sentiment_model.predict(d.article.text)
        category = classify_text(d.article.text)
        sources.append({
            "rank": i,
            "articleId": d.article.id,
            "headline": d.article.headline,
            "source": d.article.source,
            "date": d.article.date,
            "ticker": d.article.ticker,
            "similarity": round(d.similarity, 4),
            "sentiment": sentiment.sentiment,
            "category": category["category"],
        })

    avg_similarity = sum(d.similarity for d in relevant_docs) / len(relevant_docs)

    return {
        "answer": answer,
        "sources": sources,
        "retrievedDocuments": sources,
        "confidence": round(float(avg_similarity), 4),
        "generation": generation_mode,
        "embeddingMethod": index.embedding_method,
    }
