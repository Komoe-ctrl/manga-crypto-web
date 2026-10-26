import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacyProvider, resetPrivacyForTests, usePrivacy } from "./privacy";

function Probe() {
  const { hidden, toggle, mask } = usePrivacy();
  return (
    <>
      <button type="button" onClick={toggle}>
        bascule
      </button>
      <output data-testid="etat">{hidden ? "masqué" : "visible"}</output>
      <output data-testid="montant">{mask("1 234,00 $")}</output>
    </>
  );
}

const renderProbe = () =>
  render(
    <PrivacyProvider>
      <Probe />
    </PrivacyProvider>,
  );

beforeEach(() => {
  window.localStorage.clear();
  resetPrivacyForTests();
});
afterEach(() => vi.restoreAllMocks());

describe("PrivacyProvider", () => {
  it("affiche les montants par défaut", () => {
    renderProbe();
    expect(screen.getByTestId("etat").textContent).toBe("visible");
    expect(screen.getByTestId("montant").textContent).toBe("1 234,00 $");
  });

  it("masque puis réaffiche à chaque clic", () => {
    renderProbe();
    fireEvent.click(screen.getByText("bascule"));
    expect(screen.getByTestId("montant").textContent).toBe("•••••");
    fireEvent.click(screen.getByText("bascule"));
    expect(screen.getByTestId("montant").textContent).toBe("1 234,00 $");
  });

  it("mémorise le choix dans le navigateur et le retrouve au chargement suivant", () => {
    const first = renderProbe();
    fireEvent.click(screen.getByText("bascule"));
    expect(window.localStorage.getItem("veille.hideAmounts")).toBe("1");
    first.unmount();

    resetPrivacyForTests(); // « nouvelle page » : seule la mémoire du navigateur reste
    renderProbe();
    expect(screen.getByTestId("etat").textContent).toBe("masqué");
  });

  it("stockage indisponible (navigation privée) : le masquage fonctionne quand même, en mémoire", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("bloqué", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("bloqué", "SecurityError");
    });

    renderProbe();
    expect(screen.getByTestId("etat").textContent).toBe("visible");
    fireEvent.click(screen.getByText("bascule"));
    expect(screen.getByTestId("etat").textContent).toBe("masqué");
  });

  it("suit un changement fait dans une autre fenêtre", () => {
    renderProbe();
    window.localStorage.setItem("veille.hideAmounts", "1");
    fireEvent(window, new StorageEvent("storage", { key: "veille.hideAmounts", newValue: "1" }));
    expect(screen.getByTestId("etat").textContent).toBe("masqué");
  });

  it("ignore un changement d'une autre clé", () => {
    renderProbe();
    window.localStorage.setItem("veille.hideAmounts", "1");
    fireEvent(window, new StorageEvent("storage", { key: "autre", newValue: "1" }));
    expect(screen.getByTestId("etat").textContent).toBe("visible");
  });

  it("sans fournisseur, les montants restent visibles (valeur par défaut sûre)", () => {
    render(<Probe />);
    expect(screen.getByTestId("montant").textContent).toBe("1 234,00 $");
  });
});
