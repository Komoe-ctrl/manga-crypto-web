import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthState } from "@/lib/auth/auth-provider";
import { tokenStore } from "@/lib/auth";
import { WS_URL } from "@/lib/config";

let authState: AuthState = { status: "anonymous" };
vi.mock("@/lib/auth/auth-provider", () => ({ useAuth: () => ({ state: authState, login: vi.fn(), logout: vi.fn() }) }));

import { RealtimeProvider, useRealtimeStatus } from "./realtime-provider";

const USER = {
  id: "u1",
  email: "a@example.com",
  displayName: null,
  timezone: "UTC",
  baseCurrency: "USD",
  tradingMode: "PAPER" as const,
  killSwitchActive: false,
};
const session = (token: string) => ({ accessToken: token, expiresAt: Date.now() + 900_000, user: USER });

/** `WebSocket` du navigateur remplacé par un faux qu'on pilote depuis le test. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  sent: unknown[] = [];
  closed = false;
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
  }
  serverSends(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }
}

function Status() {
  return <output data-testid="direct">{useRealtimeStatus()}</output>;
}

let queryClient: QueryClient;
let invalidate: ReturnType<typeof vi.spyOn>;

const renderProvider = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>
        <Status />
      </RealtimeProvider>
    </QueryClientProvider>,
  );

const invalidatedKeys = () =>
  invalidate.mock.calls.map((call: unknown[]) => (call[0] as { queryKey: string[] }).queryKey[0]);

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  authState = { status: "anonymous" };
  tokenStore.clear();
  queryClient = new QueryClient();
  invalidate = vi.spyOn(queryClient, "invalidateQueries");
});
afterEach(() => {
  tokenStore.clear();
  vi.unstubAllGlobals();
});

describe("RealtimeProvider", () => {
  it("n'ouvre aucune connexion tant que personne n'est connecté", () => {
    renderProvider();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(screen.getByTestId("direct").textContent).toBe("idle");
  });

  it("connecté : ouvre le WebSocket de l'API, s'authentifie et relit toutes les données à l'ouverture", () => {
    authState = { status: "authenticated", user: USER };
    tokenStore.set(session("t1"));
    renderProvider();

    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toBe(WS_URL);
    expect(socket.url).toMatch(/\/api\/ws$/);
    act(() => socket.onopen?.({} as Event));
    expect(socket.sent).toEqual([{ event: "auth", data: { token: "t1" } }]);

    act(() => socket.serverSends({ event: "ready", data: { expiresAt: null } }));

    expect(screen.getByTestId("direct").textContent).toBe("open");
    // Aucun événement n'est rejoué : à chaque ouverture, tout est relu.
    expect(invalidatedKeys().sort()).toEqual(["notifications", "orders", "portfolio", "risk"]);
  });

  it("un ordre exécuté relit les ordres et le portefeuille, rien d'autre", () => {
    authState = { status: "authenticated", user: USER };
    tokenStore.set(session("t1"));
    renderProvider();
    const socket = FakeWebSocket.instances[0];
    act(() => socket.onopen?.({} as Event));
    act(() => socket.serverSends({ event: "ready", data: { expiresAt: null } }));
    invalidate.mockClear();

    act(() => socket.serverSends({ event: "order", data: { id: "o1", status: "FILLED" } }));

    expect(invalidatedKeys().sort()).toEqual(["orders", "portfolio"]);
  });

  it("l'état du robot et les notifications relisent leurs propres données", () => {
    authState = { status: "authenticated", user: USER };
    tokenStore.set(session("t1"));
    renderProvider();
    const socket = FakeWebSocket.instances[0];
    act(() => socket.onopen?.({} as Event));
    act(() => socket.serverSends({ event: "ready", data: { expiresAt: null } }));
    invalidate.mockClear();

    act(() => socket.serverSends({ event: "risk", data: { killSwitchActive: true } }));
    expect(invalidatedKeys()).toEqual(["risk"]);

    invalidate.mockClear();
    act(() => socket.serverSends({ event: "notification", data: { id: "n1" } }));
    expect(invalidatedKeys()).toEqual(["notifications"]);
  });

  it("à la déconnexion de l'application (démontage), ferme proprement la connexion", () => {
    authState = { status: "authenticated", user: USER };
    tokenStore.set(session("t1"));
    const { unmount } = renderProvider();
    const socket = FakeWebSocket.instances[0];

    unmount();

    expect(socket.closed).toBe(true);
  });

  it("une session qui disparaît coupe le direct", () => {
    authState = { status: "authenticated", user: USER };
    tokenStore.set(session("t1"));
    renderProvider();
    const socket = FakeWebSocket.instances[0];
    act(() => socket.onopen?.({} as Event));
    act(() => socket.serverSends({ event: "ready", data: { expiresAt: null } }));

    act(() => tokenStore.clear());

    expect(socket.closed).toBe(true);
    expect(screen.getByTestId("direct").textContent).toBe("idle");
  });
});
