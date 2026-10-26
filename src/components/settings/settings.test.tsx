import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationSettingsDto } from "@/lib/api/types.gen";

let current: NotificationSettingsDto;
const getSettings = vi.fn();
const updateSettings = vi.fn();
const sendTest = vi.fn();
const pushStatus = vi.fn();
const addPush = vi.fn();
const removePush = vi.fn();

vi.mock("@/lib/api/sdk.gen", () => ({
  notificationsControllerGetSettings: (...a: unknown[]) => getSettings(...a),
  notificationsControllerUpdateSettings: (...a: unknown[]) => updateSettings(...a),
  notificationsControllerTest: (...a: unknown[]) => sendTest(...a),
  notificationsControllerPushStatus: (...a: unknown[]) => pushStatus(...a),
  notificationsControllerAddPushSubscription: (...a: unknown[]) => addPush(...a),
  notificationsControllerRemovePushSubscription: (...a: unknown[]) => removePush(...a),
}));
vi.mock("@/lib/auth/auth-provider", () => ({
  useAuth: () => ({
    state: { status: "authenticated", user: { id: "u1", email: "client@example.com", timezone: "Europe/Paris" } },
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

import { installPushEnv } from "@/lib/push/push-env";
import { renderWithProviders } from "@/test-utils";
import { settings } from "@/test-fixtures";
import { SettingsPage } from "./SettingsPage";

let env: ReturnType<typeof installPushEnv> | undefined;
let devices = 0;
const KEY = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 9)]).toString("base64url");

beforeEach(() => {
  current = settings();
  getSettings.mockReset().mockImplementation(async () => ({ data: { ...current } }));
  updateSettings.mockReset().mockImplementation(async ({ body }: { body: Partial<NotificationSettingsDto> }) => {
    current = { ...current, ...body };
    return { data: { ...current } };
  });
  sendTest.mockReset();
  devices = 0;
  pushStatus.mockReset().mockImplementation(async () => ({ data: { configured: true, publicKey: KEY, subscriptions: devices } }));
  addPush.mockReset().mockImplementation(async () => {
    devices = 1;
    return { data: { configured: true, publicKey: KEY, subscriptions: devices } };
  });
  removePush.mockReset().mockImplementation(async () => {
    devices = 0;
    return { data: { configured: true, publicKey: KEY, subscriptions: devices } };
  });
  env = installPushEnv();
});
afterEach(() => env?.remove());

const show = async () => {
  const view = renderWithProviders(<SettingsPage />);
  await screen.findByRole("heading", { name: "Mode Nuit / Tranquillité" });
  return view;
};
const patches = () => updateSettings.mock.calls.map(([arg]) => (arg as { body: unknown }).body);
const switchOf = (name: string | RegExp) => screen.getByRole("switch", { name });

describe("SettingsPage : chargement", () => {
  it("affiche les réglages du serveur", async () => {
    await show();
    expect(screen.getByText(/22:00 → 07:00 · rapport unique à 08:00/)).toBeTruthy();
    expect((screen.getByLabelText("Début de la nuit") as HTMLInputElement).value).toBe("22:00");
    expect((screen.getByLabelText("Fin de la nuit") as HTMLInputElement).value).toBe("07:00");
    expect((screen.getByLabelText("Heure du rapport") as HTMLInputElement).value).toBe("08:00");
  });

  it("annonce le chargement, puis une erreur avec un bouton pour réessayer", async () => {
    getSettings.mockRejectedValueOnce(new TypeError("réseau coupé"));
    renderWithProviders(<SettingsPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("Impossible de charger vos réglages");

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await screen.findByRole("heading", { name: "Mode Nuit / Tranquillité" });
  });
});

describe("SettingsPage : Mode Nuit", () => {
  it("l'interrupteur réagit tout de suite, avant la réponse du serveur (optimiste)", async () => {
    let answer: () => void = () => undefined;
    updateSettings.mockImplementationOnce(
      ({ body }: { body: Partial<NotificationSettingsDto> }) =>
        new Promise((resolve) => {
          answer = () => {
            current = { ...current, ...body };
            resolve({ data: { ...current } });
          };
        }),
    );
    await show();
    expect(switchOf(/Mode Nuit/).getAttribute("aria-checked")).toBe("true");

    fireEvent.click(switchOf(/Mode Nuit/));

    await waitFor(() => expect(switchOf(/Mode Nuit/).getAttribute("aria-checked")).toBe("false")); // le serveur n'a pas encore répondu
    expect(screen.getByText(/envoyées immédiatement, y compris la nuit/)).toBeTruthy();
    answer();
    await waitFor(() => expect(patches()).toEqual([{ nightModeEnabled: false }]));
  });

  it("si le serveur refuse, l'ancienne valeur revient et son message s'affiche", async () => {
    updateSettings.mockRejectedValueOnce({ statusCode: 422, message: "La plage du Mode Nuit doit avoir une durée (début et fin différents)" });
    await show();

    fireEvent.click(switchOf(/Mode Nuit/));

    expect((await screen.findByRole("alert")).textContent).toContain("La plage du Mode Nuit doit avoir une durée");
    await waitFor(() => expect(switchOf(/Mode Nuit/).getAttribute("aria-checked")).toBe("true")); // rétabli
  });

  it("changer le début de la nuit envoie le nombre de minutes", async () => {
    await show();
    fireEvent.change(screen.getByLabelText("Début de la nuit"), { target: { value: "23:30" } });
    await waitFor(() => expect(patches()).toEqual([{ nightStartMinute: 1410 }]));
    expect(await screen.findByText(/23:30 → 07:00/)).toBeTruthy();
  });

  it("changer la fin de la nuit envoie le nombre de minutes", async () => {
    await show();
    fireEvent.change(screen.getByLabelText("Fin de la nuit"), { target: { value: "06:15" } });
    await waitFor(() => expect(patches()).toEqual([{ nightEndMinute: 375 }]));
  });

  it("début égal à la fin : message avant d'envoyer, rien n'est envoyé (l'API le refuserait)", async () => {
    await show();
    fireEvent.change(screen.getByLabelText("Début de la nuit"), { target: { value: "07:00" } });
    expect((await screen.findByRole("alert")).textContent).toContain("doivent être différents");
    expect(patches()).toEqual([]);
  });

  it("le message d'erreur disparaît dès qu'une plage valide est choisie", async () => {
    await show();
    fireEvent.change(screen.getByLabelText("Début de la nuit"), { target: { value: "07:00" } });
    await screen.findByRole("alert");
    fireEvent.change(screen.getByLabelText("Début de la nuit"), { target: { value: "22:30" } });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("un champ vidé en cours de saisie est ignoré (pas d'envoi d'une heure incomplète)", async () => {
    await show();
    fireEvent.change(screen.getByLabelText("Début de la nuit"), { target: { value: "" } });
    expect(patches()).toEqual([]);
  });

  it("Mode Nuit désactivé : les heures disparaissent, le texte l'explique", async () => {
    current = settings({ nightModeEnabled: false });
    await show();
    expect(screen.queryByLabelText("Début de la nuit")).toBeNull();
    expect(screen.getByText(/envoyées immédiatement, y compris la nuit/)).toBeTruthy();
  });
});

describe("SettingsPage : rapport du matin", () => {
  it("désactiver le rapport masque son heure", async () => {
    await show();
    fireEvent.click(switchOf("Rapport du matin"));
    await waitFor(() => expect(screen.queryByLabelText("Heure du rapport")).toBeNull());
    expect(patches()).toEqual([{ digestEnabled: false }]);
  });

  it("changer l'heure envoie les minutes et met le résumé à jour", async () => {
    await show();
    fireEvent.change(screen.getByLabelText("Heure du rapport"), { target: { value: "07:45" } });
    await waitFor(() => expect(patches()).toEqual([{ digestMinute: 465 }]));
    expect(await screen.findByText(/rapport unique à 07:45/)).toBeTruthy();
  });
});

describe("SettingsPage : Telegram", () => {
  it("activer Telegram sans identifiant : message clair, rien n'est envoyé", async () => {
    await show();
    fireEvent.click(switchOf("Telegram"));
    expect((await screen.findByRole("alert")).textContent).toContain("Renseignez d'abord votre identifiant");
    expect(patches()).toEqual([]);
  });

  it("l'identifiant est enregistré quand on quitte le champ, puis Telegram s'active", async () => {
    await show();
    const field = screen.getByLabelText("Identifiant de conversation");
    fireEvent.change(field, { target: { value: "123456789" } });
    fireEvent.blur(field);
    await waitFor(() => expect(patches()).toEqual([{ telegramChatId: "123456789" }]));

    fireEvent.click(switchOf("Telegram"));
    await waitFor(() => expect(patches()).toContainEqual({ telegramEnabled: true }));
  });

  it("Entrée enregistre aussi", async () => {
    await show();
    const field = screen.getByLabelText("Identifiant de conversation");
    fireEvent.change(field, { target: { value: "42" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(patches()).toEqual([{ telegramChatId: "42" }]));
  });

  it.each(["abc", "12 34", "1.5", "@robot"])("« %s » n'est pas un identifiant : erreur, rien n'est envoyé", async (value) => {
    await show();
    const field = screen.getByLabelText("Identifiant de conversation");
    fireEvent.change(field, { target: { value } });
    fireEvent.blur(field);
    expect(await screen.findByText("L'identifiant est un nombre.")).toBeTruthy();
    expect(patches()).toEqual([]);
  });

  it("accepte l'identifiant négatif d'un groupe", async () => {
    await show();
    const field = screen.getByLabelText("Identifiant de conversation");
    fireEvent.change(field, { target: { value: "-1001234567890" } });
    fireEvent.blur(field);
    await waitFor(() => expect(patches()).toEqual([{ telegramChatId: "-1001234567890" }]));
  });

  it("vider le champ efface l'identifiant (null)", async () => {
    current = settings({ telegramChatId: "42" });
    await show();
    const field = screen.getByLabelText("Identifiant de conversation");
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.blur(field);
    await waitFor(() => expect(patches()).toEqual([{ telegramChatId: null }]));
  });

  it("ne renvoie rien si la valeur n'a pas changé", async () => {
    current = settings({ telegramChatId: "42" });
    await show();
    fireEvent.blur(screen.getByLabelText("Identifiant de conversation"));
    expect(patches()).toEqual([]);
  });
});

describe("SettingsPage : Email et Push", () => {
  it("l'adresse de destination est facultative : l'aide indique l'adresse du compte", async () => {
    await show();
    expect(screen.getByText(/adresse de votre compte \(client@example.com\)/)).toBeTruthy();
  });

  it("enregistre une adresse valide, refuse une adresse invalide, et vider revient à l'adresse du compte", async () => {
    await show();
    let field = screen.getByLabelText("Adresse de destination");

    fireEvent.change(field, { target: { value: "pas-une-adresse" } });
    fireEvent.blur(field);
    expect(await screen.findByText("Saisissez une adresse e-mail valide.")).toBeTruthy();
    expect(patches()).toEqual([]);

    fireEvent.change(field, { target: { value: "alertes@example.org" } });
    fireEvent.blur(field);
    await waitFor(() => expect(patches()).toEqual([{ notificationEmail: "alertes@example.org" }]));

    // Le champ est recréé avec la valeur enregistrée : on le relit.
    await waitFor(() => expect((screen.getByLabelText("Adresse de destination") as HTMLInputElement).value).toBe("alertes@example.org"));
    field = screen.getByLabelText("Adresse de destination");
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.blur(field);
    await waitFor(() => expect(patches()).toContainEqual({ notificationEmail: null }));
  });

  it("chaque canal a son interrupteur", async () => {
    await show();
    fireEvent.click(switchOf("Push"));
    fireEvent.click(switchOf("Email"));
    await waitFor(() => expect(patches()).toEqual([{ pushEnabled: false }, { emailEnabled: true }]));
  });

  it("Push : l'état de l'appareil et le bouton pour l'activer", async () => {
    await show();
    expect(await screen.findByText("Pas encore activé sur cet appareil.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Activer sur cet appareil" }));

    await waitFor(() => expect(screen.getByText("Activé sur cet appareil.")).toBeTruthy());
    expect(addPush).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Désactiver sur cet appareil" })).toBeTruthy();
  });

  it("Push : le serveur sans clés est annoncé, sans bouton qui ne mènerait nulle part", async () => {
    pushStatus.mockResolvedValue({ data: { configured: false, publicKey: null, subscriptions: 0 } });
    await show();
    expect(await screen.findByText(/pas encore configuré pour le Push/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Activer sur cet appareil/ })).toBeNull();
  });

  it("Push : notifications bloquées dans le navigateur", async () => {
    env?.remove();
    env = installPushEnv({ permission: "denied" });
    await show();
    expect(await screen.findByText(/Notifications bloquées dans ce navigateur/)).toBeTruthy();
  });

  it("Push : navigateur sans Push (iPhone hors écran d'accueil, par exemple)", async () => {
    env?.remove();
    env = installPushEnv({ pushManager: false });
    await show();
    expect(await screen.findByText(/Ce navigateur ne gère pas les notifications Push/)).toBeTruthy();
    expect(screen.getByText(/écran d'accueil/)).toBeTruthy();
  });

  it("Push : connexion non sécurisée", async () => {
    env?.remove();
    env = installPushEnv({ secure: false });
    await show();
    expect(await screen.findByText(/connexion sécurisée \(https\)/)).toBeTruthy();
  });
});

describe("SettingsPage : message de test", () => {
  const delivery = (channel: "PUSH" | "TELEGRAM" | "EMAIL", status: "SENT" | "FAILED", reason?: string) => ({ channel, status, reason });
  const reply = (deliveries: unknown[]) => ({ data: { id: "n1", title: "Notification de test", body: "", critical: false, status: "DISPATCHED", deliveries } });

  it("dit, canal par canal, ce qui a marché et pourquoi le reste a échoué", async () => {
    sendTest.mockResolvedValue(
      reply([delivery("PUSH", "SENT"), delivery("EMAIL", "FAILED", "email_unreachable"), delivery("TELEGRAM", "FAILED", "telegram_no_chat")]),
    );
    await show();

    fireEvent.click(screen.getByRole("button", { name: "Envoyer un message de test" }));

    const list = await screen.findByRole("list", { name: "Résultat du message de test" });
    const items = within(list).getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("Push envoyé");
    expect(items[1]).toContain("Email");
    expect(items[1]).toContain("serveur de messagerie est injoignable");
    expect(items[2]).toContain("Aucune conversation Telegram renseignée");
    // jamais le code brut
    expect(list.textContent).not.toMatch(/email_unreachable|telegram_no_chat/);
  });

  it("aucun canal activé : invite à en activer un", async () => {
    sendTest.mockResolvedValue(reply([]));
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Envoyer un message de test" }));
    expect(await screen.findByText(/Aucun canal activé/)).toBeTruthy();
  });

  it("trop de messages de test (limite de l'API) : message clair", async () => {
    sendTest.mockRejectedValue({ statusCode: 429, message: "ThrottlerException: Too Many Requests" });
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Envoyer un message de test" }));
    const alert = await screen.findByText(/Patientez une minute/);
    expect(alert.textContent).not.toContain("Throttler");
  });

  it("le bouton est inactif pendant l'envoi", async () => {
    let finish: () => void = () => undefined;
    sendTest.mockReturnValue(new Promise((resolve) => (finish = () => resolve(reply([delivery("PUSH", "SENT")])))));
    await show();

    fireEvent.click(screen.getByRole("button", { name: "Envoyer un message de test" }));

    const busy = await screen.findByRole("button", { name: "Envoi…" });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    finish();
    await screen.findByRole("button", { name: "Envoyer un message de test" });
    expect(sendTest).toHaveBeenCalledTimes(1);
  });
});
