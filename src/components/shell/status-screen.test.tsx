import { fireEvent, render, screen } from "@testing-library/react";
import { Bell } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import ErrorPage from "@/app/error";
import NotFound from "@/app/not-found";
import { PageColumn, PageHeader } from "./PageHeader";

describe("pages de secours", () => {
  it("« introuvable » a un titre et ramène au tableau de bord", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "Page introuvable" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Revenir au tableau de bord" }).getAttribute("href")).toBe("/");
  });

  it("« erreur » propose de réessayer et n'affiche aucun détail technique", () => {
    const reset = vi.fn();
    render(<ErrorPage error={Object.assign(new Error("secret interne"), { digest: "abc" })} reset={reset} />);
    expect(screen.queryByText(/secret interne|abc/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});

describe("PageHeader et PageColumn", () => {
  it("le titre est l'unique h1, l'icône est décorative, la colonne est centrée", () => {
    const { container } = render(
      <PageColumn width="lg">
        <PageHeader icon={Bell} title="Alertes" description="Une phrase." />
      </PageColumn>,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.firstElementChild?.className).toContain("mx-auto");
    expect(screen.getByText("Une phrase.")).toBeTruthy();
  });
});
