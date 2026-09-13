"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface Article {
  id: string;
  headline: string;
  text: string;
  date: string;
  source: string;
  ticker: string;
}

interface StockSentiment {
  ticker: string;
  articleCount: number;
  overallSentiment: string | null;
  distribution?: { positive: number; neutral: number; negative: number };
  avgConfidence?: number;
  perArticle?: { articleId: string; headline: string; sentiment: string; confidence: number }[];
}

interface TopicItem {
  topicId: number;
  label: string;
  topWords: { term: string; weight: number }[];
  articleCount: number;
}

interface EventItem {
  articleId: string;
  headline: string;
  eventType: string;
  actor: string | null;
  target: string | null;
  value: string | null;
}

interface RagSource {
  rank: number;
  headline: string;
  source: string;
  date: string;
  ticker: string;
  similarity: number;
  sentiment: string;
  category: string;
}

function NewsIntelligenceContent() {
  const searchParams = useSearchParams();
  const ticker = searchParams.get("ticker") ?? "TCS";

  const [available, setAvailable] = useState<boolean | null>(null);
  const [news, setNews] = useState<Article[]>([]);
  const [sentiment, setSentiment] = useState<StockSentiment | null>(null);
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  const [ragQuery, setRagQuery] = useState("");
  const [ragAnswer, setRagAnswer] = useState<string | null>(null);
  const [ragSources, setRagSources] = useState<RagSource[]>([]);
  const [ragLoading, setRagLoading] = useState(false);
  const [ragConfidence, setRagConfidence] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [newsRes, sentimentRes, topicsRes, eventsRes, summaryRes] = await Promise.all([
          fetch(`/api/stocks/${encodeURIComponent(ticker)}/news`),
          fetch(`/api/stocks/${encodeURIComponent(ticker)}/sentiment`),
          fetch(`/api/nlp/topics?numTopics=5`),
          fetch(`/api/stocks/${encodeURIComponent(ticker)}/events`),
          fetch(`/api/stocks/${encodeURIComponent(ticker)}/summary`),
        ]);
        if (!newsRes.ok) {
          if (!cancelled) setAvailable(false);
          return;
        }
        const newsJson = await newsRes.json();
        const sentimentJson = sentimentRes.ok ? await sentimentRes.json() : null;
        const topicsJson = topicsRes.ok ? await topicsRes.json() : { topics: [] };
        const eventsJson = eventsRes.ok ? await eventsRes.json() : { events: [] };
        const summaryJson = summaryRes.ok ? await summaryRes.json() : { summary: null };
        if (cancelled) return;
        setNews(newsJson.articles ?? []);
        setSentiment(sentimentJson);
        setTopics(topicsJson.topics ?? []);
        setEvents(eventsJson.events ?? []);
        setSummary(summaryJson.summary ?? null);
        setAvailable(true);
      } catch {
        if (!cancelled) setAvailable(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  async function handleAskPulseWatch(e: React.FormEvent) {
    e.preventDefault();
    if (!ragQuery.trim()) return;
    setRagLoading(true);
    setRagAnswer(null);
    setRagSources([]);
    try {
      const res = await fetch("/api/rag/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: ragQuery, ticker }),
      });
      if (res.ok) {
        const json = await res.json();
        setRagAnswer(json.answer);
        setRagSources(json.sources ?? []);
        setRagConfidence(json.confidence ?? null);
      } else {
        setRagAnswer("NLP service is currently unavailable — please try again shortly.");
      }
    } catch {
      setRagAnswer("Could not reach the NLP service.");
    } finally {
      setRagLoading(false);
    }
  }

  if (available === false) {
    return (
      <div className="page-container">
        <div className="card liquid-glass">
          <p>News Intelligence is currently unavailable — the NLP service could not be reached.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1 className="page-title">News Intelligence</h1>
      <p className="page-subtitle">
        Ticker: <strong>{ticker.toUpperCase()}</strong> — try{" "}
        {["TCS", "RELIANCE", "INFY", "HDFC"].map((t) => (
          <a key={t} href={`/news?ticker=${t}`} style={{ marginRight: 8 }}>
            {t}
          </a>
        ))}
      </p>

      {summary && (
        <section className="card liquid-glass" style={{ marginBottom: 16 }}>
          <h2 className="section-title">Article Summary</h2>
          <p>{summary}</p>
        </section>
      )}

      <section className="card liquid-glass" style={{ marginBottom: 16 }}>
        <h2 className="section-title">Sentiment Distribution</h2>
        {sentiment && sentiment.distribution ? (
          <div style={{ display: "flex", gap: 16 }}>
            <span>Positive: {sentiment.distribution.positive}</span>
            <span>Neutral: {sentiment.distribution.neutral}</span>
            <span>Negative: {sentiment.distribution.negative}</span>
            <span>Overall: {sentiment.overallSentiment}</span>
          </div>
        ) : (
          <p className="nlp-intel-muted">No sentiment data available.</p>
        )}
      </section>

      <section className="card liquid-glass" style={{ marginBottom: 16 }}>
        <h2 className="section-title">Topic Distribution (corpus-wide)</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {topics.map((t) => (
            <span key={t.topicId} className="nlp-chip" title={t.topWords.map((w) => w.term).join(", ")}>
              {t.label} ({t.articleCount})
            </span>
          ))}
        </div>
      </section>

      <section className="card liquid-glass" style={{ marginBottom: 16 }}>
        <h2 className="section-title">Detected Events</h2>
        {events.length === 0 && <p className="nlp-intel-muted">No events detected.</p>}
        {events.map((ev, i) => (
          <div key={i} className="item-row">
            <div>
              <strong>{ev.eventType.replace(/_/g, " ")}</strong> — {ev.headline}
              {ev.actor && <div className="nlp-intel-muted">Actor: {ev.actor}{ev.target ? ` → Target: ${ev.target}` : ""}{ev.value ? ` · ${ev.value}` : ""}</div>}
            </div>
          </div>
        ))}
      </section>

      <section className="card liquid-glass" style={{ marginBottom: 16 }}>
        <h2 className="section-title">News Feed</h2>
        {news.map((a) => (
          <div key={a.id} className="item-row">
            <div>
              <strong>{a.headline}</strong>
              <div className="nlp-intel-muted">{a.source} · {a.date}</div>
              <p style={{ fontSize: "0.85rem", opacity: 0.85 }}>{a.text}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="card liquid-glass">
        <h2 className="section-title">Ask PulseWatch</h2>
        <p className="nlp-intel-muted">
          Ask a question grounded in retrieved articles — e.g. &ldquo;Why is {ticker.toUpperCase()} moving today?&rdquo;
        </p>
        <form onSubmit={handleAskPulseWatch} style={{ display: "flex", gap: 8, margin: "0.75rem 0" }}>
          <input
            type="text"
            value={ragQuery}
            onChange={(e) => setRagQuery(e.target.value)}
            placeholder={`Why is ${ticker.toUpperCase()} significant today?`}
            style={{ flex: 1 }}
          />
          <button className="btn" type="submit" disabled={ragLoading}>
            {ragLoading ? "Asking…" : "Ask"}
          </button>
        </form>
        {ragAnswer && (
          <div className="nlp-intel-why">
            <p>{ragAnswer}</p>
            {ragConfidence !== null && (
              <p className="nlp-intel-muted">Retrieval confidence: {Math.round(ragConfidence * 100)}%</p>
            )}
          </div>
        )}
        {ragSources.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p className="nlp-intel-eyebrow">Evidence</p>
            {ragSources.map((s) => (
              <div key={s.rank} className="item-row">
                <div>
                  {s.rank}. {s.headline} — relevance {s.similarity.toFixed(2)}
                  <div className="nlp-intel-muted">{s.source} · {s.date} · {s.sentiment} · {s.category}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function NewsIntelligencePage() {
  return (
    <Suspense fallback={<div className="page-container">Loading…</div>}>
      <NewsIntelligenceContent />
    </Suspense>
  );
}
