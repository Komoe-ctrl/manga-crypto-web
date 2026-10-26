import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./modal";

function Harness({ onClose = () => undefined }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        ouvrir
      </button>
      {open && (
        <Modal
          titleId="t"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        >
          <h2 id="t">Titre</h2>
          <button type="button">premier</button>
          <button type="button">dernier</button>
        </Modal>
      )}
    </>
  );
}

const open = () => {
  fireEvent.click(screen.getByRole("button", { name: "ouvrir" }));
  return screen.getByRole("dialog", { name: "Titre" });
};

describe("Modal", () => {
  it("rôle dialog modal nommé par son titre, focus sur le premier élément", () => {
    render(<Harness />);
    const dialog = open();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "premier" }));
  });

  it("Tab boucle dans la fenêtre : du dernier au premier, et Maj+Tab du premier au dernier", () => {
    render(<Harness />);
    const dialog = open();
    const first = screen.getByRole("button", { name: "premier" });
    const last = screen.getByRole("button", { name: "dernier" });

    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("Échap ferme et rend le focus à l'élément d'origine", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = screen.getByRole("button", { name: "ouvrir" });
    opener.focus();
    const dialog = open();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("un clic sur le fond ferme, un clic dans la fenêtre non", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const dialog = open();

    fireEvent.mouseDown(screen.getByRole("button", { name: "premier" }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Modal : rendu dans <body>", () => {
  it("n'est pas enfermée dans la carte qui l'ouvre (un parent avec backdrop-filter piège les éléments fixed)", () => {
    render(
      <section data-testid="carte" className="backdrop-blur-xl">
        <Harness />
      </section>,
    );
    const dialog = open();
    expect(screen.getByTestId("carte").contains(dialog)).toBe(false);
    expect(dialog.closest("section")).toBeNull();
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("disparaît du document à la fermeture", () => {
    render(<Harness />);
    const dialog = open();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(document.querySelector("[role='dialog']")).toBeNull();
  });
});
