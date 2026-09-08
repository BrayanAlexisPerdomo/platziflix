# Import all schemas to make them available when importing from schemas package

from .rating import RatingCreate

__all__ = [
    'RatingCreate',
]
