import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Switch } from "./switch";
import { ToastProvider, useToast } from "./toast";

describe("Switch", () => {
  it("annonce son état et son libellé, et bascule au clic", () => {
    const onChange = vi.fn();
    const { rerender } = render(<Switch checked={false} onChange={onChange} label="Activer le Mode Nuit" />);
    const control = screen.getByRole("switch", { name: "Activer le Mode Nuit" });
    expect(control.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(<Switch checked onChange={onChange} label="Activer le Mode Nuit" />);
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("peut être nommé par un titre visible (aria-labelledby)", () => {
    render(
      <>
        <span id="titre">Rapport du matin</span>
        <Switch checked onChange={() => undefined} labelledBy="titre" />
      </>,
    );
    expect(screen.getByRole("switch", { name: "Rapport du matin" })).toBeTruthy();
  });

  it("désactivé : ne réagit pas", () => {
    const onChange = vi.fn();
    render(<Switch checked onChange={onChange} label="x" disabled />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("se manipule au clavier (c'est un vrai bouton)", () => {
    render(<Switch checked={false} onChange={() => undefined} label="x" />);
    expect(screen.getByRole("switch").tagName).toBe("BUTTON");
  });
});

function Notifier({ message, tone }: { message: string; tone?: "info" | "error" }) {
  const { notify } = useToast();
  return (
    <button type="button" onClick={() => notify(message, tone)}>
      notifier
    </button>
  );
}

describe("ToastProvider", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("affiche une confirmation annoncée comme « status », puis la retire au bout de quelques secondes", () => {
    render(
      <ToastProvider>
        <Notifier message="Mode Nuit activé" />
      </ToastProvider>,
    );
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.click(screen.getByText("notifier"));
    expect(screen.getByRole("status").textContent).toBe("Mode Nuit activé");

    act(() => vi.advanceTimersByTime(3_199));
    expect(screen.getByRole("status")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("une erreur est annoncée comme « alert » et reste plus longtemps", () => {
    render(
      <ToastProvider>
        <Notifier message="Impossible d'enregistrer" tone="error" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("notifier"));
    expect(screen.getByRole("alert").textContent).toBe("Impossible d'enregistrer");

    act(() => vi.advanceTimersByTime(5_999));
    expect(screen.getByRole("alert")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("un nouveau message remplace l'ancien et repart pour toute sa durée", () => {
    function Two() {
      const { notify } = useToast();
      return (
        <>
          <button type="button" onClick={() => notify("premier")}>
            un
          </button>
          <button type="button" onClick={() => notify("second")}>
            deux
          </button>
        </>
      );
    }
    render(
      <ToastProvider>
        <Two />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("un"));
    act(() => vi.advanceTimersByTime(3_000));
    fireEvent.click(screen.getByText("deux"));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("second");

    act(() => vi.advanceTimersByTime(3_000)); // l'ancien minuteur aurait déjà retiré le message
    expect(screen.getByRole("status").textContent).toBe("second");
  });

  it("sans fournisseur, notify ne fait rien et ne plante pas", () => {
    render(<Notifier message="x" />);
    expect(() => fireEvent.click(screen.getByText("notifier"))).not.toThrow();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("le démontage annule le minuteur", () => {
    const { unmount } = render(
      <ToastProvider>
        <Notifier message="x" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("notifier"));
    unmount();
    expect(() => act(() => vi.advanceTimersByTime(10_000))).not.toThrow();
  });
});
