"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface NlpIntelligenceCardProps {
  ticker: string;
}

interface NlpIntelligenceData {
  ticker: string;
  sentiment: {
    overallSentiment: string | null;
    articleCount: number;
    avgConfidence?: number;
  };
  topics: { topicId: number; label: string; relevance: number }[];
  events: { eventType?: string }[];
  summary: string | null;
  attention: {
    newsAttentionScore: number;
    maxScore: number;
    reasons: string[];
  };
}

type LoadState = "loading" | "ready" | "unavailable" | "empty";

// Renders the "NLP INTELLIGENCE" block described in PROJECT_SPEC's UI
// section: sentiment, top topics, key event, article count, attention,
// and an explanatory "Why?" line — for a single tracked stock. Degrades
// to a quiet "NLP intelligence unavailable" notice (never a crash/error
// screen) when the NLP service is down or disabled, per the "NLP must be
// optional" engineering rule.
export default function NlpIntelligenceCard({ ticker }: NlpIntelligenceCardProps) {
  const [data, setData] = useState<NlpIntelligenceData | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`/api/stocks/${encodeURIComponent(ticker)}/nlp-intelligence`)
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) setState("unavailable");
          return;
        }
        const json = (await res.json()) as NlpIntelligenceData;
        if (cancelled) return;
        if (!json.sentiment || json.sentiment.articleCount === 0) {
          setState("empty");
        } else {
          setData(json);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (state === "loading") {
    return (
      <div className="nlp-intel-card liquid-glass">
        <div className="skeleton skeleton-card" />
      </div>
    );
  }

  if (state === "unavailable") {
    return (
      <div className="nlp-intel-card liquid-glass nlp-intel-quiet">
        <p className="nlp-intel-eyebrow">NLP INTELLIGENCE</p>
        <p className="nlp-intel-muted">
          NLP intelligence is currently unavailable. The rest of PulseWatch is unaffected.
        </p>
      </div>
    );
  }

  if (state === "empty" || !data) {
    return (
      <div className="nlp-intel-card liquid-glass nlp-intel-quiet">
        <p className="nlp-intel-eyebrow">NLP INTELLIGENCE</p>
        <p className="nlp-intel-muted">No relevant news found for {ticker} yet.</p>
      </div>
    );
  }

  const topTopic = data.topics[0]?.label;
  const topEvent = data.events[0]?.eventType;
  const attentionLabel =
    data.attention.newsAttentionScore >= 7
      ? "HIGH"
      : data.attention.newsAttentionScore >= 4
        ? "MEDIUM"
        : "LOW";

  return (
    <div className="nlp-intel-card liquid-glass">
      <p className="nlp-intel-eyebrow">NLP INTELLIGENCE</p>

      <div className="nlp-intel-row">
        <span className="nlp-intel-label">Sentiment</span>
        <span className={`nlp-sentiment-badge nlp-sentiment-${(data.sentiment.overallSentiment ?? "neutral").toLowerCase()}`}>
          {data.sentiment.overallSentiment ?? "N/A"}
          {typeof data.sentiment.avgConfidence === "number" && (
            <span className="nlp-intel-confidence">
              {" "}
              {Math.round(data.sentiment.avgConfidence * 100)}%
            </span>
          )}
        </span>
      </div>

      {data.topics.length > 0 && (
        <div className="nlp-intel-row">
          <span className="nlp-intel-label">Top Topics</span>
          <span className="nlp-intel-chips">
            {data.topics.slice(0, 3).map((t) => (
              <span key={t.topicId} className="nlp-chip">
                {t.label}
              </span>
            ))}
          </span>
        </div>
      )}

      {topEvent && (
        <div className="nlp-intel-row">
          <span className="nlp-intel-label">Key Event</span>
          <span>{topEvent.replace(/_/g, " ")}</span>
        </div>
      )}

      <div className="nlp-intel-row">
        <span className="nlp-intel-label">News</span>
        <span>{data.sentiment.articleCount} relevant article{data.sentiment.articleCount === 1 ? "" : "s"}</span>
      </div>

      <div className="nlp-intel-row">
        <span className="nlp-intel-label">Attention</span>
        <span className={`nlp-attention-badge nlp-attention-${attentionLabel.toLowerCase()}`}>
          {attentionLabel} ({data.attention.newsAttentionScore.toFixed(1)}/10)
        </span>
      </div>

      {data.attention.reasons.length > 0 && (
        <p className="nlp-intel-why">
          <strong>Why?</strong> {data.attention.reasons.join(" ")}
        </p>
      )}

      {data.summary && <p className="nlp-intel-summary">{data.summary}</p>}

      <Link href={`/news?ticker=${encodeURIComponent(ticker)}`} className="nlp-intel-link">
        View full news intelligence →
      </Link>
    </div>
  );
}
