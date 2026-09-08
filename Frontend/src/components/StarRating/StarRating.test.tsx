import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { StarRating } from "./StarRating";

describe("StarRating Component", () => {
  it("muestra el promedio y el conteo de votos cuando el curso tiene ratings", () => {
    render(<StarRating rating_average={4.5} rating_count={12} />);

    expect(screen.getByText("4.5 (12 votos)")).toBeInTheDocument();
  });

  it("usa el singular 'voto' cuando solo hay un voto", () => {
    render(<StarRating rating_average={5} rating_count={1} />);

    expect(screen.getByText("5.0 (1 voto)")).toBeInTheDocument();
  });

  it("muestra un mensaje de 'sin votos' cuando rating_average es null", () => {
    render(<StarRating rating_average={null} rating_count={0} />);

    expect(screen.getByText("Sin votos aún")).toBeInTheDocument();
  });

  it("siempre renderiza las 5 estrellas, con o sin votos", () => {
    render(<StarRating rating_average={3} rating_count={4} />);

    expect(screen.getAllByText("★")).toHaveLength(5);
  });
});
