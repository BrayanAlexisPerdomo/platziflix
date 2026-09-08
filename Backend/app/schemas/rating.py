from pydantic import BaseModel, Field


class RatingCreate(BaseModel):
    """
    Request body for POST /courses/{slug}/ratings.
    """
    stars: int = Field(ge=1, le=5)
