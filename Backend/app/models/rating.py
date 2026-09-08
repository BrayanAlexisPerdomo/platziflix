from sqlalchemy import Column, Integer, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from .base import BaseModel


class Rating(BaseModel):
    """
    Rating model representing an individual 1-5 star vote for a course.
    """
    __tablename__ = 'ratings'

    course_id = Column(Integer, ForeignKey('courses.id'), nullable=False, index=True)
    stars = Column(Integer, nullable=False)

    __table_args__ = (
        CheckConstraint('stars >= 1 AND stars <= 5', name='ck_ratings_stars_range'),
    )

    course = relationship("Course", back_populates="ratings")

    def __repr__(self):
        return f"<Rating(id={self.id}, course_id={self.course_id}, stars={self.stars})>"
