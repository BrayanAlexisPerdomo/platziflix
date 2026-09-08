"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./RatingForm.module.scss";
import { RatingSummary } from "@/types";

const TOTAL_STARS = 5;

type Status = "idle" | "submitting" | "success" | "error";

interface RatingFormProps {
  slug: string;
}

export const RatingForm = ({ slug }: RatingFormProps) => {
  const router = useRouter();
  const [selectedStars, setSelectedStars] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<RatingSummary | null>(null);

  const handleVote = async (stars: number) => {
    setSelectedStars(stars);
    setStatus("submitting");
    setErrorMessage(null);

    // Primer fetch client-side del proyecto (los GET existentes corren en Server Components).
    // Sigue el mismo estilo que esos GET: URL hardcodeada, sin capa de cliente HTTP.
    try {
      const res = await fetch(`http://localhost:8000/courses/${slug}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars }),
      });

      if (res.status === 404) {
        setStatus("error");
        setErrorMessage("El curso no existe.");
        return;
      }

      if (!res.ok) {
        setStatus("error");
        setErrorMessage("El valor de la calificación no es válido.");
        return;
      }

      const data: RatingSummary = await res.json();
      setResult(data);
      setStatus("success");
      // Padre es un Server Component con cache: "no-store"; refresh vuelve a
      // ejecutar su fetch para que el StarRating server-rendered quede al día.
      router.refresh();
    } catch {
      setStatus("error");
      setErrorMessage("No se pudo enviar la calificación. Intenta de nuevo.");
    }
  };

  return (
    <div className={styles.ratingForm}>
      <p className={styles.prompt}>Califica este curso</p>
      <div className={styles.stars} role="radiogroup" aria-label="Calificación en estrellas">
        {Array.from({ length: TOTAL_STARS }, (_, index) => {
          const value = index + 1;
          const isSelected = selectedStars !== null && value <= selectedStars;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selectedStars === value}
              aria-label={`Calificar con ${value} estrella${value === 1 ? "" : "s"}`}
              className={isSelected ? styles.starFilled : styles.starEmpty}
              disabled={status === "submitting"}
              onClick={() => handleVote(value)}
            >
              ★
            </button>
          );
        })}
      </div>
      {status === "submitting" && <p className={styles.status}>Enviando...</p>}
      {status === "success" && result && (
        <p className={styles.success}>
          ¡Gracias por tu voto! Nuevo promedio: {result.rating_average?.toFixed(1)} ({result.rating_count}{" "}
          votos)
        </p>
      )}
      {status === "error" && <p className={styles.error}>{errorMessage}</p>}
    </div>
  );
};
