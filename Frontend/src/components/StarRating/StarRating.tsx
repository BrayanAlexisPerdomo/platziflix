import styles from "./StarRating.module.scss";
import { RatingSummary } from "@/types";

const TOTAL_STARS = 5;

export const StarRating = ({ rating_average, rating_count }: RatingSummary) => {
  const hasRatings = rating_average !== null;

  return (
    <div className={styles.starRating}>
      <span className={styles.stars} aria-hidden="true">
        {Array.from({ length: TOTAL_STARS }, (_, index) => {
          const filled = hasRatings && index < Math.round(rating_average as number);
          return (
            <span key={index} className={filled ? styles.starFilled : styles.starEmpty}>
              ★
            </span>
          );
        })}
      </span>
      <span className={styles.count}>
        {hasRatings
          ? `${(rating_average as number).toFixed(1)} (${rating_count} ${rating_count === 1 ? "voto" : "votos"})`
          : "Sin votos aún"}
      </span>
    </div>
  );
};
