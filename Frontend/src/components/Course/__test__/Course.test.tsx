import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Course } from "../Course";

describe("Course Component", () => {
  const mockCourse = {
    id: 1,
    name: "React Fundamentals",
    description: "Aprende React desde cero",
    thumbnail: "https://example.com/thumbnail.jpg",
    rating_average: 4.5,
    rating_count: 12,
  };

  it("renders course information correctly", () => {
    render(<Course {...mockCourse} />);

    // Check if name is rendered
    expect(screen.getByText(mockCourse.name)).toBeDefined();

    // Check if the rating is rendered
    expect(screen.getByText(`${mockCourse.rating_average.toFixed(1)} (${mockCourse.rating_count} votos)`)).toBeDefined();
  });

  it("renders thumbnail with correct alt text", () => {
    render(<Course {...mockCourse} />);

    const thumbnail = screen.getByRole("img");
    expect(thumbnail).toHaveAttribute("src", mockCourse.thumbnail);
    expect(thumbnail).toHaveAttribute("alt", mockCourse.name);
  });

  it("renders with correct structure", () => {
    const { container } = render(<Course {...mockCourse} />);

    // Check if the main article exists
    expect(container.querySelector("article")).toBeDefined();

    // Check if the thumbnail container exists
    expect(container.querySelector("div > img")).toBeDefined();

    // Check if the course info section exists
    expect(container.querySelector("div > h2")).toBeDefined();
    expect(container.querySelector("div > p")).toBeDefined();
  });

  it("muestra 'Sin votos aún' cuando el curso no tiene ratings", () => {
    render(<Course {...mockCourse} rating_average={null} rating_count={0} />);

    expect(screen.getByText("Sin votos aún")).toBeInTheDocument();
  });
});
