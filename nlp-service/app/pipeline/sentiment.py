"""
Financial sentiment classification.

Two implementations, matching the project's "classical vs modern NLP"
requirement:

1. `ClassicalSentimentModel` — TF-IDF + Logistic Regression, trained on
   `data/sample_phrasebank.csv` (a small Financial-PhraseBank-style sample
   shipped in this repo). Metrics reported by `evaluate()` are REAL,
   computed on a held-out split of whatever CSV is loaded — never
   hardcoded. Swap in the full Financial PhraseBank (see
   DATASET_SETUP.md) for research-grade numbers; the ~45-row sample here
   is for demonstration/CI only and will overfit.

2. `TransformerSentimentModel` — optional. If the `transformers` package
   and a local/cached FinBERT checkpoint (default:
   `ProsusAI/finbert`) are available, uses it. This sandbox cannot reach
   huggingface.co to download weights, so this path is disabled by
   default here and documented in NLP_SETUP.md for local use. When
   unavailable, `get_sentiment_model()` transparently falls back to the
   classical model and reports which model actually served the request.
"""
from __future__ import annotations

import csv
import os
from dataclasses import dataclass
from pathlib import Path

from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_recall_fscore_support, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer

from .preprocessing import preprocess_for_vectorizer

LABELS = ["negative", "neutral", "positive"]
DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "sample_phrasebank.csv"


def _load_dataset(path: Path = DATA_PATH) -> tuple[list[str], list[str]]:
    texts, labels = [], []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            texts.append(row["text"])
            labels.append(row["label"].strip().lower())
    return texts, labels


@dataclass
class SentimentResult:
    sentiment: str
    confidence: float
    probabilities: dict
    modelUsed: str


class ClassicalSentimentModel:
    """TF-IDF + Logistic Regression baseline. Real training, real metrics."""

    def __init__(self, dataset_path: Path = DATA_PATH, random_state: int = 42):
        self.dataset_path = dataset_path
        self.random_state = random_state
        self.pipeline: Pipeline | None = None
        self._metrics: dict | None = None
        self._fit()

    def _fit(self):
        texts, labels = _load_dataset(self.dataset_path)
        cleaned = [preprocess_for_vectorizer(t) for t in texts]

        X_train, X_test, y_train, y_test = train_test_split(
            cleaned, labels, test_size=0.25, random_state=self.random_state, stratify=labels,
        )

        pipeline = Pipeline([
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1)),
            ("clf", LogisticRegression(max_iter=1000, class_weight="balanced")),
        ])
        pipeline.fit(X_train, y_train)

        preds = pipeline.predict(X_test)
        precision, recall, f1, _ = precision_recall_fscore_support(
            y_test, preds, labels=LABELS, average=None, zero_division=0,
        )
        acc = accuracy_score(y_test, preds)
        macro_f1 = f1_score(y_test, preds, average="macro", zero_division=0)
        cm = confusion_matrix(y_test, preds, labels=LABELS)

        self._metrics = {
            "modelType": "TF-IDF + Logistic Regression",
            "trainSize": len(X_train),
            "testSize": len(X_test),
            "accuracy": round(float(acc), 4),
            "macroF1": round(float(macro_f1), 4),
            "perClass": {
                label: {
                    "precision": round(float(p), 4),
                    "recall": round(float(r), 4),
                    "f1": round(float(f), 4),
                }
                for label, p, r, f in zip(LABELS, precision, recall, f1)
            },
            "confusionMatrix": {"labels": LABELS, "matrix": cm.tolist()},
            "note": (
                "Metrics computed on a held-out split of the small sample "
                f"dataset ({self.dataset_path.name}, {len(texts)} rows total). "
                "Not representative of production accuracy — replace with the "
                "full Financial PhraseBank per DATASET_SETUP.md for meaningful numbers."
            ),
        }

        # Refit on the FULL dataset for the model actually served in
        # predictions (train/test split above is only for evaluation).
        pipeline_full = Pipeline([
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1)),
            ("clf", LogisticRegression(max_iter=1000, class_weight="balanced")),
        ])
        pipeline_full.fit(cleaned, labels)
        self.pipeline = pipeline_full

    def predict(self, text: str) -> SentimentResult:
        cleaned = preprocess_for_vectorizer(text)
        proba = self.pipeline.predict_proba([cleaned])[0]
        classes = list(self.pipeline.classes_)
        prob_map = {c: float(p) for c, p in zip(classes, proba)}
        for lbl in LABELS:
            prob_map.setdefault(lbl, 0.0)
        best_label = max(prob_map, key=prob_map.get)
        return SentimentResult(
            sentiment=best_label.upper(),
            confidence=round(prob_map[best_label], 4),
            probabilities={k: round(v, 4) for k, v in prob_map.items()},
            modelUsed="classical-tfidf-logreg",
        )

    def evaluate(self) -> dict:
        return self._metrics


class TransformerSentimentModel:
    """Optional FinBERT-backed sentiment model.

    Requires `pip install -r requirements-transformers.txt` and network
    access to huggingface.co to download `ProsusAI/finbert` (~440MB) on
    first run. Not usable inside this sandbox (huggingface.co is not on
    the allowed egress list here) — see NLP_SETUP.md for local setup.
    """

    MODEL_NAME = os.environ.get("FINBERT_MODEL", "ProsusAI/finbert")

    def __init__(self):
        try:
            from transformers import AutoTokenizer, AutoModelForSequenceClassification
            import torch
        except ImportError as e:
            raise RuntimeError(
                "transformers/torch not installed. Run: "
                "pip install -r requirements-transformers.txt"
            ) from e

        self._torch = torch
        self.tokenizer = AutoTokenizer.from_pretrained(self.MODEL_NAME)
        self.model = AutoModelForSequenceClassification.from_pretrained(self.MODEL_NAME)
        self.model.eval()
        # FinBERT label order per ProsusAI/finbert config
        self.id2label = self.model.config.id2label

    def predict(self, text: str) -> SentimentResult:
        torch = self._torch
        inputs = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=256)
        with torch.no_grad():
            logits = self.model(**inputs).logits
        probs = torch.softmax(logits, dim=-1)[0].tolist()
        prob_map = {self.id2label[i].lower(): p for i, p in enumerate(probs)}
        best_label = max(prob_map, key=prob_map.get)
        return SentimentResult(
            sentiment=best_label.upper(),
            confidence=round(prob_map[best_label], 4),
            probabilities={k: round(v, 4) for k, v in prob_map.items()},
            modelUsed=f"transformer-finbert:{self.MODEL_NAME}",
        )


_classical_singleton: ClassicalSentimentModel | None = None
_transformer_singleton: TransformerSentimentModel | None = None
_transformer_unavailable = False


def get_classical_model() -> ClassicalSentimentModel:
    global _classical_singleton
    if _classical_singleton is None:
        _classical_singleton = ClassicalSentimentModel()
    return _classical_singleton


def get_transformer_model() -> TransformerSentimentModel | None:
    global _transformer_singleton, _transformer_unavailable
    if _transformer_unavailable:
        return None
    if _transformer_singleton is None:
        try:
            _transformer_singleton = TransformerSentimentModel()
        except RuntimeError:
            _transformer_unavailable = True
            return None
    return _transformer_singleton


def predict_sentiment(text: str, prefer_transformer: bool = True) -> SentimentResult:
    """Predicts sentiment, preferring FinBERT if available, else classical.

    This is the graceful-fallback path required by the project spec:
    NLP must work even when heavy transformer deps aren't installed.
    """
    if prefer_transformer:
        model = get_transformer_model()
        if model is not None:
            return model.predict(text)
    return get_classical_model().predict(text)
