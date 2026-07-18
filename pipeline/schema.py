"""Pydantic models validating the single structured story JSON document
returned by the shortform story prompt (see docs/superpowers/specs/
2026-07-18-v3-cinematic-shortform-platform.md and
2026-07-18-cost-optimization-architecture.md).
"""
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

Importance = Literal["HIGH", "MEDIUM", "LOW"]
Quality = Literal["Low", "Medium", "High"]
MotionType = Literal["static", "ken_burns", "zoom", "pan", "motion_crop", "ai_animation"]


class ScenePrompt(BaseModel):
    subject: str
    environment: str
    camera: str
    lens: str
    lighting: str
    color_grade: str
    expression: str
    emotion: str
    motion_direction: str
    sfx_cue: str
    music_cue: str


class Scene(BaseModel):
    seq: int = Field(ge=0)
    start_sec: float = Field(ge=0)
    end_sec: float = Field(ge=0)
    narration: str = Field(min_length=1)
    subtitle: str = Field(min_length=1)
    importance: Importance
    importance_score: float = Field(ge=0.0, le=1.0)
    new_asset_required: bool
    existing_asset_allowed: bool
    animation_required: bool
    recommended_quality: Quality
    motion_type: MotionType
    asset_query: str
    prompt: ScenePrompt

    @model_validator(mode="after")
    def _end_after_start(self):
        if self.end_sec < self.start_sec:
            raise ValueError("scene.end_sec must be >= start_sec")
        return self


class Seo(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1)
    tags: list[str] = Field(default_factory=list)


class StoryDoc(BaseModel):
    title: str = Field(min_length=1)
    logline: str = Field(min_length=1)
    moral: str = Field(min_length=1)
    language: str = Field(min_length=1)
    total_seconds: float = Field(ge=30, le=60)
    characters_used: list[str] = Field(default_factory=list)
    scenes: list[Scene] = Field(min_length=5, max_length=8)
    thumbnail_prompt: str = Field(min_length=1)
    seo: Seo

    @field_validator("scenes")
    @classmethod
    def _seqs_are_contiguous(cls, scenes: list[Scene]) -> list[Scene]:
        seqs = [s.seq for s in scenes]
        if seqs != sorted(seqs):
            raise ValueError("scenes must be ordered by seq")
        return scenes

    @model_validator(mode="after")
    def _duration_matches_scenes(self):
        if self.scenes:
            last_end = self.scenes[-1].end_sec
            if abs(last_end - self.total_seconds) > 1:
                raise ValueError(
                    f"total_seconds ({self.total_seconds}) does not match "
                    f"last scene end_sec ({last_end})"
                )
        return self
