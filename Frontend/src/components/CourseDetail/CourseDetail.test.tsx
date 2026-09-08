import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CourseDetailComponent } from "./CourseDetail";
import { CourseDetail } from "@/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("CourseDetailComponent", () => {
  const mockCourse: CourseDetail = {
    id: 1,
    title: "React Fundamentals",
    teacher: "John Doe",
    duration: 120,
    thumbnail: "https://example.com/thumbnail.jpg",
    slug: "react-fundamentals",
    rating_average: 4.5,
    rating_count: 12,
    description: "Aprende React desde cero",
    classes: [
      {
        id: 1,
        title: "Clase 1",
        description: "Introducción",
        video: "https://example.com/video.mp4",
        duration: 600,
        slug: "clase-1",
      },
    ],
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renderiza el StarRating con el rating_average/rating_count del curso", () => {
    render(<CourseDetailComponent course={mockCourse} />);

    expect(screen.getByText("4.5 (12 votos)")).toBeInTheDocument();
  });

  it("renderiza el RatingForm con sus 5 estrellas seleccionables", () => {
    render(<CourseDetailComponent course={mockCourse} />);

    expect(screen.getByRole("radiogroup", { name: "Calificación en estrellas" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Calificar con 5 estrellas" })).toBeInTheDocument();
  });

  it("pasa el slug correcto del curso al RatingForm al votar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ rating_average: 5, rating_count: 13 }),
      })
    );

    render(<CourseDetailComponent course={mockCourse} />);
    fireEvent.click(screen.getByRole("radio", { name: "Calificar con 5 estrellas" }));

    expect(fetch).toHaveBeenCalledWith(
      `http://localhost:8000/courses/${mockCourse.slug}/ratings`,
      expect.objectContaining({ method: "POST" })
    );

    await waitFor(() => {
      expect(screen.getByText(/Nuevo promedio: 5.0 \(13 votos\)/)).toBeInTheDocument();
    });
  });
});
