import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { RatingForm } from "./RatingForm";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

describe("RatingForm Component", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    refreshMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envía el voto al backend y muestra el nuevo promedio en caso de éxito", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ rating_average: 4.2, rating_count: 5 }),
    });

    render(<RatingForm slug="curso-de-react" />);
    fireEvent.click(screen.getByRole("radio", { name: "Calificar con 4 estrellas" }));

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/courses/curso-de-react/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stars: 4 }),
    });

    await waitFor(() => {
      expect(screen.getByText(/Nuevo promedio: 4.2 \(5 votos\)/)).toBeInTheDocument();
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("muestra un error cuando el backend responde 404 (curso inexistente)", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });

    render(<RatingForm slug="curso-inexistente" />);
    fireEvent.click(screen.getByRole("radio", { name: "Calificar con 3 estrellas" }));

    await waitFor(() => {
      expect(screen.getByText("El curso no existe.")).toBeInTheDocument();
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("muestra un error cuando el backend responde con un valor inválido (422)", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: false, status: 422 });

    render(<RatingForm slug="curso-de-react" />);
    fireEvent.click(screen.getByRole("radio", { name: "Calificar con 1 estrella" }));

    await waitFor(() => {
      expect(screen.getByText("El valor de la calificación no es válido.")).toBeInTheDocument();
    });
  });

  it("muestra un error genérico cuando falla la petición de red", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    render(<RatingForm slug="curso-de-react" />);
    fireEvent.click(screen.getByRole("radio", { name: "Calificar con 5 estrellas" }));

    await waitFor(() => {
      expect(screen.getByText("No se pudo enviar la calificación. Intenta de nuevo.")).toBeInTheDocument();
    });
  });
});
