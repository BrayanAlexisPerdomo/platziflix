import styles from "./Course.module.scss";
import { Course as CourseType } from "@/types";
import { StarRating } from "@/components/StarRating/StarRating";

type CourseProps = Omit<CourseType, "slug">;

export const Course = ({ name, thumbnail, rating_average, rating_count }: CourseProps) => {
  return (
    <article className={styles.courseCard}>
      <div className={styles.thumbnailContainer}>
        <img src={thumbnail} alt={name} className={styles.thumbnail} />
      </div>
      <div className={styles.courseInfo}>
        <h2 className={styles.courseTitle}>{name}</h2>
        <StarRating rating_average={rating_average} rating_count={rating_count} />
      </div>
    </article>
  );
};
