import { FC } from "react";
import Link from "next/link";
import { CourseDetail } from "@/types";
import styles from "./CourseDetail.module.scss";
import { StarRating } from "@/components/StarRating/StarRating";
import { RatingForm } from "@/components/RatingForm/RatingForm";

interface CourseDetailComponentProps {
  course: CourseDetail;
}

export const CourseDetailComponent: FC<CourseDetailComponentProps> = ({ course }) => {
  return (
    <div className={styles.container}>
      <div className={styles.navigation}>
        <Link href="/" className={styles.backButton}>
          ← Volver a cursos
        </Link>
      </div>
      <div className={styles.header}>
        <div className={styles.thumbnailContainer}>
          <img src={course.thumbnail} alt={course.name} className={styles.thumbnail} />
        </div>
        <div className={styles.courseInfo}>
          <h1 className={styles.title}>{course.name}</h1>
          <p className={styles.description}>{course.description}</p>
          <div className={styles.stats}>
            <span className={styles.classCount}>{course.classes.length} clases</span>
          </div>
          <div className={styles.ratingSection}>
            <StarRating rating_average={course.rating_average} rating_count={course.rating_count} />
            <RatingForm slug={course.slug} />
          </div>
        </div>
      </div>

      <div className={styles.classesSection}>
        <h2 className={styles.sectionTitle}>Contenido del curso</h2>
        <div className={styles.classesList}>
          {course.classes.map((cls, index) => (
            <Link href={`/classes/${cls.id}`} key={cls.id} className={styles.classItem}>
              <div className={styles.classNumber}>{(index + 1).toString().padStart(2, "0")}</div>
              <div className={styles.classInfo}>
                <h3 className={styles.classTitle}>{cls.name}</h3>
                <p className={styles.classDescription}>{cls.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};
