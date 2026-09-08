from typing import List, Optional, Dict, Any
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from app.models.course import Course
from app.models.lesson import Lesson
from app.models.teacher import Teacher
from app.models.rating import Rating


class CourseService:
    """
    Service class for handling course-related operations.
    Implements the contract specifications for course endpoints.
    """

    def __init__(self, db: Session):
        self.db = db

    def _get_ratings_summary(self, course_ids: List[int]) -> Dict[int, Dict[str, Any]]:
        """
        Get aggregated rating_average/rating_count for a set of course ids.

        Returns a dict keyed by course_id, defaulting to
        {"rating_average": None, "rating_count": 0} for courses with no ratings.
        """
        summary = {
            course_id: {"rating_average": None, "rating_count": 0}
            for course_id in course_ids
        }

        if not course_ids:
            return summary

        rows = (
            self.db.query(
                Rating.course_id,
                func.avg(Rating.stars),
                func.count(Rating.id)
            )
            .filter(Rating.course_id.in_(course_ids))
            .group_by(Rating.course_id)
            .all()
        )

        for course_id, avg, count in rows:
            summary[course_id] = {
                "rating_average": round(float(avg), 1),
                "rating_count": count
            }

        return summary

    def get_all_courses(self) -> List[Dict[str, Any]]:
        """
        Get all courses with basic information (no teachers or lessons).

        Returns:
            List of course dictionaries with: id, name, description, thumbnail, slug, rating_average, rating_count
        """
        courses = self.db.query(Course).filter(Course.deleted_at.is_(None)).all()
        ratings_summary = self._get_ratings_summary([course.id for course in courses])

        return [
            {
                "id": course.id,
                "name": course.name,
                "description": course.description,
                "thumbnail": course.thumbnail,
                "slug": course.slug,
                **ratings_summary[course.id]
            }
            for course in courses
        ]

    def get_course_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        """
        Get course details by slug including teachers and lessons.
        
        Args:
            slug: The course slug
            
        Returns:
            Course dictionary with teachers and lessons, or None if not found
        """
        course = (
            self.db.query(Course)
            .options(
                joinedload(Course.teachers),
                joinedload(Course.lessons)
            )
            .filter(Course.slug == slug)
            .filter(Course.deleted_at.is_(None))
            .first()
        )
        
        if not course:
            return None

        ratings_summary = self._get_ratings_summary([course.id])[course.id]

        return {
            "id": course.id,
            "name": course.name,
            "description": course.description,
            "thumbnail": course.thumbnail,
            "slug": course.slug,
            **ratings_summary,
            "teacher_id": [teacher.id for teacher in course.teachers],
            "classes": [
                {
                    "id": lesson.id,
                    "name": lesson.name,
                    "description": lesson.description,
                    "slug": lesson.slug
                }
                for lesson in course.lessons
                if lesson.deleted_at is None
            ]
        }

    def add_rating(self, slug: str, stars: int) -> Optional[Dict[str, Any]]:
        """
        Add a rating (1-5 stars) to the course identified by slug.

        Args:
            slug: The course slug
            stars: Number of stars (1-5)

        Returns:
            Updated rating_average/rating_count dict, or None if the course doesn't exist
        """
        course = (
            self.db.query(Course)
            .filter(Course.slug == slug)
            .filter(Course.deleted_at.is_(None))
            .first()
        )

        if not course:
            return None

        rating = Rating(course_id=course.id, stars=stars)
        self.db.add(rating)
        self.db.commit()

        return self._get_ratings_summary([course.id])[course.id] 