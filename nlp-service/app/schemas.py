from pydantic import BaseModel, Field


class TextIn(BaseModel):
    text: str = Field(min_length=1, max_length=20000)


class TickerNewsIn(BaseModel):
    ticker: str
    top_k: int = 5


class RagQueryIn(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    ticker: str | None = None
    top_k: int = 5


class AttentionSignalsIn(BaseModel):
    ticker: str
    percentChange: float
