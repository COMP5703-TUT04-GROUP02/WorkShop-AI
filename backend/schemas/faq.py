from typing import Literal

from pydantic import BaseModel, Field


FaqAudience = Literal["customer"]


class FaqItemResponse(BaseModel):
    id: str
    question: str
    answer: str


class FaqCategoryResponse(BaseModel):
    title: str
    items: list[FaqItemResponse] = Field(default_factory=list)


class FaqResponse(BaseModel):
    audience: FaqAudience
    categories: list[FaqCategoryResponse] = Field(default_factory=list)
