import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Eye, EyeOff, Plus, Moon, Smartphone, Send, Mail, Sparkles, X, Check, Bell,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";

/* ------------------------------------------------------------------
 * Veille — tableau de bord crypto « sans écran »
 * Composant unique : React + Tailwind CSS + lucide-react
 * Données de démonstration : brancher useLivePrices() sur une vraie API
 * (WebSocket Binance, CoinGecko…) en production.
 * ------------------------------------------------------------------ */

const POS = "#6EE7B7";
const NEG = "#F5A07A";

const ASSETS = [
  { sym: "BTC", name: "Bitcoin", short: "₿", qty: 0.842, price: 67250, cost: 52100, ch: 1.8, color: "#E8B86B", seed: 3 },
  { sym: "ETH", name: "Ethereum", short: "Ξ", qty: 6.15, price: 3412, cost: 2980, ch: -0.6, color: "#8FA8F0", seed: 7 },
  { sym: "SOL", name: "Solana", short: "SOL", qty: 85, price: 168.4, cost: 142, ch: 3.2, color: "#B49CF0", seed: 11 },
  { sym: "LINK", name: "Chainlink", short: "LN", qty: 420, price: 14.82, cost: 16.4, ch: -1.4, color: "#7DD3C0", seed: 17 },
  { sym: "USDC", name: "USD Coin", short: "$", qty: 4200, price: 1, cost: 1, ch: 0, color: "#8B95A5", seed: 23 },
];

const INITIAL_ALERTS = [
  { id: 1, title: "BTC −5 % en moins d’1 h", detail: "Chute rapide · fenêtre glissante de 60 min", channel: "Push", urgent: true, active: true },
  { id: 2, title: "ETH franchit 3 500 $", detail: "Seuil à la hausse · prix actuel ≈ 3 412 $", channel: "Telegram", urgent: false, active: true },
  { id: 3, title: "Portefeuille −10 % sur 7 jours", detail: "Protection globale du capital", channel: "Push", urgent: true, active: true },
  { id: 4, title: "SOL +8 % sur 24 h", detail: "Opportunité de prise de profit", channel: "Email", urgent: false, active: false },
];

const DIGESTS = {
  today: {
    meta: "Généré aujourd’hui à 08:00 · nuit du 22 au 23 oct.",
    summary:
      "Nuit calme. Votre portefeuille a progressé d’environ +1,2 %, porté par SOL. Aucune alerte critique ne s’est déclenchée. ETH reste à ~2,5 % de votre seuil de 3 500 $ : l’alerte Telegram est armée. Aucune action requise.",
    points: [
      "2 alertes non urgentes regroupées pendant la nuit (SOL +3 %, LINK −1,4 %).",
      "Volatilité du BTC sous sa moyenne des 30 derniers jours.",
      "LINK reste votre seule position en perte latente (≈ −10 %).",
    ],
  },
  yesterday: {
    meta: "Généré hier à 08:00 · nuit du 21 au 22 oct.",
    summary:
      "Légère baisse de −0,4 % pendant la nuit, sans mouvement brutal. Le BTC a oscillé dans une fourchette étroite. Aucune notification ne vous a été envoyée.",
    points: ["1 alerte non urgente regroupée (ETH −1,1 %).", "Stablecoins inchangés : 4 200 USDC disponibles.", "Aucun seuil critique approché."],
  },
  week: {
    meta: "Synthèse hebdomadaire · 16 → 23 oct.",
    summary:
      "Semaine positive : +4,8 % pour le portefeuille, principalement grâce à SOL et BTC. Une seule alerte critique a été envoyée, mardi à 14:12 (BTC −5 % en 50 min), suivie d’un rebond dans l’heure.",
    points: [
      "Meilleur actif : SOL (+11,6 %). Moins bon : LINK (−3,9 %).",
      "9 alertes non urgentes regroupées dans 7 rapports du matin.",
      "Allocation stable : BTC reste au-dessus de 50 % du portefeuille.",
    ],
  },
};

const HISTORY = [
  { date: "Jeu. 23 oct. · 08:00", text: "Nuit calme, aucune alerte critique", delta: 1.2 },
  { date: "Mer. 22 oct. · 08:00", text: "Légère baisse, aucune notification", delta: -0.4 },
  { date: "Mar. 21 oct. · 08:00", text: "1 alerte critique BTC, rebond rapide", delta: 0.9 },
  { date: "Lun. 20 oct. · 08:00", text: "Week-end porté par SOL", delta: 2.1 },
];

/* ---------------------------- helpers ---------------------------- */

const money = (n, d = 2) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const signed = (n, d = 2) => (n >= 0 ? "+" : "−") + money(Math.abs(n), d);
const pct = (n) => (n >= 0 ? "+" : "−") + Math.abs(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %";
const priceFmt = (p) => money(p, p < 10 ? 4 : 2);
const toNum = (v) => parseFloat(String(v).replace(",", "."));

function seededSeries(a) {
  let s = a.seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280), s / 233280);
  const flat = a.sym === "USDC";
  const drift = flat ? 0 : a.price >= a.cost ? 0.35 : -0.3;
  const pts = [];
  let v = 100;
  for (let i = 0; i < 28; i++) {
    v += drift + (rnd() - 0.5) * (flat ? 0.05 : 2.4);
    pts.push(v);
  }
  return pts;
}

/** Simulation de flux de prix. En prod : remplacer par un WebSocket. */
function useLivePrices() {
  const [state, setState] = useState(() => {
    const prices = {}, opens = {}, series = {};
    ASSETS.forEach((a) => {
      prices[a.sym] = a.price;
      opens[a.sym] = a.price / (1 + a.ch / 100);
      series[a.sym] = seededSeries(a);
    });
    return { prices, opens, series };
  });

  useEffect(() => {
    const id = setInterval(() => {
      setState((prev) => {
        const prices = { ...prev.prices };
        const series = { ...prev.series };
        ASSETS.forEach((a) => {
          if (a.sym === "USDC") return;
          const f = 1 + (Math.random() - 0.5) * 0.003; // ±0,15 % : mouvement doux
          prices[a.sym] *= f;
          const s = prev.series[a.sym];
          series[a.sym] = [...s.slice(1), s[s.length - 1] * f];
        });
        return { ...prev, prices, series };
      });
    }, 4000);
    return () => clearInterval(id);
  }, []);

  return state;
}

/* ------------------------- petits composants ------------------------- */

const Glass = ({ className = "", children, ...rest }) => (
  <section
    {...rest}
    className={`rounded-3xl border border-white/[0.08] bg-white/[0.035] backdrop-blur-xl ${className}`}
  >
    {children}
  </section>
);

function Switch({ checked, onChange, label, labelledBy }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={labelledBy}
      onClick={onChange}
      className={`relative h-8 w-[52px] shrink-0 rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7DD3C0] ${
        checked ? "bg-[#7DD3C0]" : "bg-white/15"
      }`}
    >
      <span
        className={`absolute top-1 h-6 w-6 rounded-full transition-all duration-200 ${
          checked ? "left-6 bg-[#06231D]" : "left-1 bg-[#C5CCD6]"
        }`}
      />
    </button>
  );
}

function Segmented({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-xl bg-white/[0.04] p-1">
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={`min-h-10 flex-1 rounded-[10px] px-3.5 text-[13px] font-bold transition-colors ${
            value === key ? "bg-white/[0.12] text-[#F2F5F8]" : "text-[#8B95A5] hover:text-[#C5CCD6]"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Chip({ active, onClick, children, className = "" }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 rounded-xl px-4 text-sm font-bold transition-colors ${
        active
          ? "border border-[#7DD3C0]/60 bg-[#7DD3C0]/[0.14] text-[#A7E8DA]"
          : "border border-white/[0.12] text-[#C5CCD6] hover:bg-white/[0.05]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function Sparkline({ data, color, label }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const points = data
    .map((v, i) => `${(2 + i * (100 / (data.length - 1))).toFixed(1)},${(30 - ((v - min) / span) * 26).toFixed(1)}`)
    .join(" ");
  return (
    <svg role="img" aria-label={label} width="104" height="34" viewBox="0 0 104 34" fill="none" className="mx-auto">
      <polyline points={points} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

const ChannelIcon = ({ channel, className }) =>
  channel === "Telegram" ? <Send className={className} /> : channel === "Email" ? <Mail className={className} /> : <Smartphone className={className} />;

const fieldCls =
  "h-12 w-full rounded-xl border border-white/[0.12] bg-[#0D1219] px-3.5 text-[15px] text-[#E8ECF1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7DD3C0]";

/* ------------------------------ composant ------------------------------ */

export default function CryptoDashboard() {
  const { prices, opens, series } = useLivePrices();

  const [view, setView] = useState("dashboard");
  const [hide, setHide] = useState(false);
  const [filter, setFilter] = useState("all");
  const [digestTab, setDigestTab] = useState("today");
  const [read, setRead] = useState(false);
  const [night, setNight] = useState(true);
  const [alerts, setAlerts] = useState(INITIAL_ALERTS);
  const [holdings, setHoldings] = useState(() =>
    Object.fromEntries(ASSETS.map((a) => [a.sym, { qty: a.qty, cost: a.cost }]))
  );
  const [modal, setModal] = useState(false);
  const [modalTab, setModalTab] = useState("alert");
  const [form, setForm] = useState({ asset: "BTC", cond: "drop", value: "5", channel: "Push", urgent: false, side: "buy", qty: "", price: "" });
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const notify = (msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Fermer la modale avec Échap
  useEffect(() => {
    if (!modal) return;
    const onKey = (e) => e.key === "Escape" && setModal(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  const mask = (s) => (hide ? "•••••" : s);
  const patch = (p) => setForm((f) => ({ ...f, ...p }));

  /* --------- calculs dérivés --------- */
  const { rows, total, changeAbs, changePct, pnlTotal } = useMemo(() => {
    let total = 0, open = 0, cost = 0;
    ASSETS.forEach((a) => {
      const h = holdings[a.sym];
      total += h.qty * prices[a.sym];
      open += h.qty * opens[a.sym];
      cost += h.qty * h.cost;
    });
    const rows = ASSETS.map((a) => {
      const h = holdings[a.sym];
      const price = prices[a.sym];
      const value = h.qty * price;
      const s = series[a.sym];
      return {
        ...a,
        qty: h.qty,
        price,
        value,
        pnl: value - h.qty * h.cost,
        pnlPct: h.cost ? (price / h.cost - 1) * 100 : 0,
        ch: (price / opens[a.sym] - 1) * 100,
        alloc: total ? (value / total) * 100 : 0,
        series: s,
        up: s[s.length - 1] >= s[0],
        flat: a.sym === "USDC",
      };
    });
    const changeAbs = total - open;
    return { rows, total, changeAbs, changePct: open ? (changeAbs / open) * 100 : 0, pnlTotal: total - cost };
  }, [prices, opens, series, holdings]);

  const visible = rows.filter((r) => (filter === "gain" ? r.pnl > 0.01 : filter === "loss" ? r.pnl < -0.01 : true));

  const market =
    changePct > 1.2
      ? { label: "Haussier", color: POS, bg: "rgba(110,231,183,0.12)", Icon: TrendingUp }
      : changePct < -1.2
      ? { label: "Baissier", color: NEG, bg: "rgba(245,160,122,0.12)", Icon: TrendingDown }
      : { label: "Stable", color: "#A9BCF5", bg: "rgba(169,188,245,0.12)", Icon: Minus };

  const queued = alerts.filter((a) => a.active && !a.urgent).length;
  const activeCount = alerts.filter((a) => a.active).length;
  const digest = DIGESTS[digestTab];
  const isAlert = modalTab === "alert";
  const pctCond = form.cond === "drop" || form.cond === "rise";

  /* --------- actions --------- */
  const toggleAlert = (id) => {
    const target = alerts.find((a) => a.id === id);
    setAlerts((list) => list.map((a) => (a.id === id ? { ...a, active: !a.active } : a)));
    notify(target.active ? "Alerte mise en pause" : "Alerte réactivée");
  };

  const toggleNight = () => {
    notify(night ? "Mode Nuit désactivé" : "Mode Nuit activé · bonne nuit");
    setNight((n) => !n);
  };

  const submit = () => {
    if (isAlert) {
      const v = toNum(form.value);
      if (!isFinite(v) || v <= 0) return notify("Indiquez une valeur valide");
      const t = v.toLocaleString("fr-FR");
      const titles = {
        drop: `${form.asset} −${t} % en moins d’1 h`,
        rise: `${form.asset} +${t} % sur 24 h`,
        above: `${form.asset} franchit ${t} $`,
        below: `${form.asset} passe sous ${t} $`,
      };
      const details = { drop: "Chute rapide · fenêtre de 60 min", rise: "Hausse sur 24 h glissantes", above: "Seuil à la hausse", below: "Seuil à la baisse" };
      setAlerts((list) => [
        { id: Date.now(), title: titles[form.cond], detail: details[form.cond], channel: form.channel, urgent: form.urgent, active: true },
        ...list,
      ]);
      setModal(false);
      notify("Alerte créée et armée");
    } else {
      const q = toNum(form.qty);
      const p = toNum(form.price);
      if (!isFinite(q) || q <= 0) return notify("Indiquez une quantité valide");
      setHoldings((h) => {
        const cur = h[form.asset];
        if (form.side === "buy") {
          const unit = isFinite(p) && p > 0 ? p : prices[form.asset];
          return { ...h, [form.asset]: { qty: cur.qty + q, cost: (cur.qty * cur.cost + q * unit) / (cur.qty + q) } };
        }
        return { ...h, [form.asset]: { ...cur, qty: Math.max(0, cur.qty - q) } };
      });
      patch({ qty: "", price: "" });
      setModal(false);
      notify(`${form.side === "buy" ? "Achat" : "Vente"} de ${q.toLocaleString("fr-FR")} ${form.asset} enregistré`);
    }
  };

  const tone = (n, flat) => (flat || Math.abs(n) < 0.01 ? "#C5CCD6" : n >= 0 ? POS : NEG);

  /* ------------------------------ rendu ------------------------------ */
  return (
    <div
      className="relative min-h-screen px-6 pb-16 pt-7 text-[#E8ECF1] antialiased"
      style={{
        fontFamily: "Manrope, Inter, system-ui, sans-serif",
        background:
          "radial-gradient(900px 520px at 12% -8%, rgba(125,211,192,0.10), transparent 60%), radial-gradient(800px 600px at 100% 10%, rgba(143,168,240,0.08), transparent 60%), #090C11",
      }}
    >
      <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
        {/* ============ HEADER ============ */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#7DD3C0]/35 bg-[#7DD3C0]/[0.14] text-[#7DD3C0]">
              <Eye className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-extrabold tracking-tight">Veille</span>
              <span className="text-xs text-[#8B95A5]">Votre portefeuille veille pour vous</span>
            </div>
          </div>

          <nav aria-label="Navigation principale" className="flex flex-wrap gap-1 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-1 backdrop-blur-xl">
            {[["dashboard", "Tableau de bord"], ["alerts", "Alertes"], ["reports", "Rapports"]].map(([k, l]) => (
              <button
                key={k}
                type="button"
                aria-pressed={view === k}
                onClick={() => setView(k)}
                className={`min-h-10 rounded-[10px] px-4 text-sm font-bold transition-colors ${
                  view === k ? "bg-white/[0.12] text-[#F2F5F8]" : "text-[#8B95A5] hover:text-[#C5CCD6]"
                }`}
              >
                {l}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setHide((h) => !h)}
              aria-label={hide ? "Afficher les montants" : "Masquer les montants"}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[#C5CCD6] hover:bg-white/[0.07]"
            >
              {hide ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
            </button>
            <button
              type="button"
              onClick={() => setModal(true)}
              className="flex h-11 items-center gap-2 rounded-xl bg-[#7DD3C0] px-[18px] text-sm font-bold text-[#06231D] hover:brightness-110"
            >
              <Plus className="h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden="true" />
              Transaction / alerte
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-start gap-6">
          {/* ============ COLONNE GAUCHE ============ */}
          {view === "dashboard" && (
            <div className="flex min-w-0 flex-col gap-6" style={{ flex: "999 1 620px" }}>
              {/* ---- GLOBAL WALLET ---- */}
              <Glass aria-labelledby="wallet-title" className="flex flex-col gap-6 p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex flex-col gap-2">
                    <h2 id="wallet-title" className="text-[13px] font-semibold uppercase tracking-wider text-[#8B95A5]">
                      Valeur totale du portefeuille
                    </h2>
                    <div className="text-5xl font-extrabold tabular-nums leading-tight tracking-tight">{mask(money(total))}</div>
                    <div className="flex flex-wrap items-center gap-2.5 text-sm">
                      <span
                        className="rounded-full px-2.5 py-1 font-bold tabular-nums"
                        style={{ color: changeAbs >= 0 ? POS : NEG, background: changeAbs >= 0 ? "rgba(110,231,183,0.12)" : "rgba(245,160,122,0.12)" }}
                      >
                        {pct(changePct)} · {mask(signed(changeAbs))}
                      </span>
                      <span className="text-[#8B95A5]">sur 24 h</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2.5">
                    <div className="flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold" style={{ color: market.color, background: market.bg }}>
                      <market.Icon className="h-4 w-4" aria-hidden="true" />
                      Marché : {market.label}
                    </div>
                    <span className="flex items-center gap-1.5 text-xs text-[#8B95A5]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#7DD3C0]" />
                      Prix en direct · mise à jour toutes les 4 s
                    </span>
                  </div>
                </div>

                {/* Allocation */}
                <div className="flex flex-col gap-3">
                  <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                    {rows.map((r) => (
                      <div key={r.sym} style={{ width: `${r.alloc}%`, background: r.color }} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {rows.map((r) => (
                      <span key={r.sym} className="flex items-center gap-2 text-[13px] text-[#C5CCD6]">
                        <span className="h-2 w-2 rounded-[3px]" style={{ background: r.color }} />
                        {r.sym} <span className="tabular-nums text-[#8B95A5]">{Math.round(r.alloc)} %</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {[
                    ["P&L total", <span key="pnl" style={{ color: pnlTotal >= 0 ? POS : NEG }}>{mask(signed(pnlTotal, 0))}</span>],
                    ["Alertes armées", `${activeCount} / ${alerts.length}`],
                    ["Prochain rapport", "Demain 08:00"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex flex-col gap-1 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5">
                      <span className="text-xs text-[#8B95A5]">{k}</span>
                      <span className="text-lg font-bold tabular-nums">{v}</span>
                    </div>
                  ))}
                </div>
              </Glass>

              {/* ---- PORTFOLIO BREAKDOWN ---- */}
              <Glass aria-labelledby="assets-title" className="flex flex-col gap-[18px] p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <h2 id="assets-title" className="text-lg font-bold">Mes actifs</h2>
                    <span className="text-[13px] text-[#8B95A5]">
                      {visible.length} actif{visible.length > 1 ? "s" : ""} · triés par valeur
                    </span>
                  </div>
                  <Segmented label="Filtrer les actifs" value={filter} onChange={setFilter} options={[["all", "Tous"], ["gain", "En gain"], ["loss", "En perte"]]} />
                </div>

                <div className="-mx-2 overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                      <tr className="text-right text-xs text-[#8B95A5]">
                        <th scope="col" className="px-3 py-2 text-left font-semibold">Actif</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Quantité</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Prix</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Valeur</th>
                        <th scope="col" className="px-3 py-2 font-semibold">P&amp;L</th>
                        <th scope="col" className="px-3 py-2 text-center font-semibold">7 jours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r) => (
                        <tr key={r.sym} className="border-t border-white/[0.06] hover:bg-white/[0.03]">
                          <td className="px-3 py-3.5">
                            <div className="flex items-center gap-3">
                              <span
                                className="flex h-9 w-9 items-center justify-center rounded-[11px] text-xs font-extrabold"
                                style={{ color: r.color, background: `${r.color}24` }}
                              >
                                {r.short}
                              </span>
                              <span className="flex flex-col">
                                <span className="font-bold">{r.sym}</span>
                                <span className="text-xs text-[#8B95A5]">{r.name}</span>
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3.5 text-right tabular-nums text-[#C5CCD6]">
                            {mask(r.qty.toLocaleString("fr-FR", { maximumFractionDigits: 4 }))}
                          </td>
                          <td className="px-3 py-3.5 text-right tabular-nums">
                            <div className="flex flex-col items-end">
                              <span className="font-semibold">{priceFmt(r.price)}</span>
                              <span className="text-xs font-semibold" style={{ color: r.flat ? "#8B95A5" : r.ch >= 0 ? POS : NEG }}>
                                {pct(r.ch)} 24 h
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3.5 text-right font-bold tabular-nums">{mask(money(r.value))}</td>
                          <td className="px-3 py-3.5 text-right tabular-nums">
                            <div className="flex flex-col items-end">
                              <span className="font-bold" style={{ color: tone(r.pnl, r.flat) }}>{mask(signed(r.pnl))}</span>
                              <span className="text-xs text-[#8B95A5]">{r.flat ? "—" : pct(r.pnlPct)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3.5">
                            <Sparkline
                              data={r.series}
                              color={r.flat ? "#8B95A5" : r.up ? POS : NEG}
                              label={`Tendance 7 jours de ${r.name} : ${r.flat ? "stable" : r.up ? "en hausse" : "en baisse"}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <span className="text-xs text-[#8B95A5]">Données de démonstration — à brancher sur votre API de prix (CoinGecko, Binance…).</span>
              </Glass>
            </div>
          )}

          {/* ============ COLONNE DROITE ============ */}
          <div className="flex min-w-0 flex-col gap-6" style={{ flex: "1 1 380px" }}>
            {/* ---- AUTOMATED DIGEST ---- */}
            {view !== "alerts" && (
              <Glass aria-labelledby="digest-title" className="flex flex-col gap-4 p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#8FA8F0]/[0.14] text-[#A9BCF5]">
                      <Sparkles className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <h2 id="digest-title" className="text-lg font-bold">Rapport automatique</h2>
                      <span className="text-[13px] text-[#8B95A5]">{digest.meta}</span>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                      read ? "bg-white/5 text-[#8B95A5]" : "bg-[#A9BCF5]/[0.14] text-[#A9BCF5]"
                    }`}
                  >
                    {read ? "Lu" : "Nouveau"}
                  </span>
                </div>
                <Segmented label="Période du rapport" value={digestTab} onChange={setDigestTab} options={[["today", "Ce matin"], ["yesterday", "Hier"], ["week", "7 jours"]]} />
                <p className="text-base leading-relaxed">{digest.summary}</p>
                <ul className="flex flex-col gap-2.5">
                  {digest.points.map((p) => (
                    <li key={p} className="flex gap-2.5 text-sm leading-normal text-[#C5CCD6]">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#7DD3C0]" />
                      {p}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                  <span className="text-xs text-[#8B95A5]">Lecture : ~10 secondes · généré par l’IA</span>
                  <button
                    type="button"
                    onClick={() => setRead((r) => !r)}
                    className="h-11 rounded-xl border border-white/[0.12] px-4 text-[13px] font-semibold hover:bg-white/[0.07]"
                  >
                    {read ? "Marquer comme non lu" : "Marquer comme lu"}
                  </button>
                </div>
              </Glass>
            )}

            {/* ---- HISTORIQUE (vue Rapports) ---- */}
            {view === "reports" && (
              <Glass aria-labelledby="history-title" className="flex flex-col gap-3 p-6">
                <h2 id="history-title" className="text-lg font-bold">Historique des rapports</h2>
                {HISTORY.map((h) => (
                  <div key={h.date} className="flex justify-between gap-3 border-t border-white/[0.06] py-3 text-sm">
                    <span className="flex flex-col gap-0.5">
                      <span className="font-semibold">{h.date}</span>
                      <span className="text-[13px] text-[#8B95A5]">{h.text}</span>
                    </span>
                    <span className="font-bold tabular-nums" style={{ color: h.delta >= 0 ? POS : NEG }}>
                      {(h.delta >= 0 ? "+" : "−") + Math.abs(h.delta).toLocaleString("fr-FR")} %
                    </span>
                  </div>
                ))}
              </Glass>
            )}

            {/* ---- CENTRE D'ALERTES ---- */}
            {view !== "reports" && (
              <Glass aria-labelledby="alerts-title" className="flex flex-col gap-4 p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <h2 id="alerts-title" className="flex items-center gap-2 text-lg font-bold">
                      <Bell className="h-[18px] w-[18px] text-[#8B95A5]" aria-hidden="true" />
                      Alertes intelligentes
                    </h2>
                    <span className="text-[13px] text-[#8B95A5]">Vous n’avez pas besoin de regarder l’écran.</span>
                  </div>
                  <button
                    type="button"
                    aria-label="Nouvelle alerte"
                    onClick={() => { setModalTab("alert"); setModal(true); }}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.12] hover:bg-white/[0.07]"
                  >
                    <Plus className="h-[18px] w-[18px]" strokeWidth={2.2} />
                  </button>
                </div>

                {/* Mode Nuit */}
                <div
                  className={`flex flex-col gap-3 rounded-[18px] border p-4 transition-colors ${
                    night ? "border-[#A9BCF5]/30 bg-[#A9BCF5]/[0.08]" : "border-white/[0.07] bg-white/[0.025]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#A9BCF5]/[0.14] text-[#A9BCF5]">
                        <Moon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <span id="night-label" className="text-[15px] font-bold">Mode Nuit / Tranquillité</span>
                        <span className="text-[13px] tabular-nums text-[#8B95A5]">22:00 → 07:00 · rapport unique à 08:00</span>
                      </div>
                    </div>
                    <Switch checked={night} onChange={toggleNight} labelledBy="night-label" />
                  </div>
                  <p className="text-[13px] leading-relaxed text-[#C5CCD6]">
                    {night
                      ? `${queued} alerte${queued > 1 ? "s" : ""} non urgente${queued > 1 ? "s seront regroupées" : " sera regroupée"} en un seul rapport à 08:00. Les alertes critiques continuent de vous réveiller.`
                      : "Toutes les alertes actives sont envoyées immédiatement, y compris la nuit."}
                  </p>
                </div>

                <ul className="flex flex-col gap-2.5">
                  {alerts.map((al) => {
                    const held = night && !al.urgent;
                    const badge = !al.active
                      ? ["En pause", "bg-white/5 text-[#8B95A5]"]
                      : al.urgent
                      ? ["Critique · passe toujours", "bg-[#F5A07A]/[0.14] text-[#F7C3A8]"]
                      : held
                      ? ["Groupée dans le rapport de 08:00", "bg-[#A9BCF5]/[0.14] text-[#C3CFF7]"]
                      : ["Envoi immédiat", "bg-[#7DD3C0]/[0.12] text-[#A7E8DA]"];
                    return (
                      <li
                        key={al.id}
                        className={`flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5 transition-opacity ${
                          al.active ? "" : "opacity-60"
                        }`}
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] ${al.active ? "text-[#E8ECF1]" : "text-[#8B95A5]"}`}>
                          <ChannelIcon channel={al.channel} className="h-[18px] w-[18px]" />
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="text-sm font-bold">{al.title}</span>
                          <span className="text-xs text-[#8B95A5]">{al.detail}</span>
                          <span className="mt-1 flex flex-wrap gap-1.5">
                            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold text-[#C5CCD6]">{al.channel}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badge[1]}`}>{badge[0]}</span>
                          </span>
                        </div>
                        <Switch
                          checked={al.active}
                          onChange={() => toggleAlert(al.id)}
                          label={`${al.active ? "Désactiver" : "Activer"} l’alerte ${al.title}`}
                        />
                      </li>
                    );
                  })}
                </ul>
              </Glass>
            )}
          </div>
        </div>
      </div>

      {/* ============ MODALE AJOUT ============ */}
      {modal && (
        <div
          className="fixed inset-0 z-20 flex items-start justify-center bg-[#05070A]/70 px-4 pb-10 pt-[110px]"
          onClick={(e) => e.target === e.currentTarget && setModal(false)}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="modal-title" className="flex w-full max-w-[480px] flex-col gap-[18px] rounded-3xl border border-white/10 bg-[#121821] p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 id="modal-title" className="text-xl font-bold">Ajouter</h2>
              <button type="button" aria-label="Fermer" onClick={() => setModal(false)} className="flex h-11 w-11 items-center justify-center rounded-xl text-[#C5CCD6] hover:bg-white/[0.07]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <Segmented label="Type d’ajout" value={modalTab} onChange={setModalTab} options={[["alert", "Alerte"], ["transaction", "Transaction"]]} />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-asset" className="text-[13px] font-semibold text-[#C5CCD6]">Actif</label>
              <select id="f-asset" value={form.asset} onChange={(e) => patch({ asset: e.target.value })} className={fieldCls}>
                {ASSETS.map((a) => (
                  <option key={a.sym} value={a.sym}>{a.name} ({a.sym})</option>
                ))}
              </select>
            </div>

            {isAlert ? (
              <div className="flex flex-col gap-[18px]">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="f-cond" className="text-[13px] font-semibold text-[#C5CCD6]">Condition</label>
                    <select id="f-cond" value={form.cond} onChange={(e) => patch({ cond: e.target.value })} className={fieldCls}>
                      <option value="drop">Baisse de (%) en 1 h</option>
                      <option value="rise">Hausse de (%) en 24 h</option>
                      <option value="above">Franchit à la hausse ($)</option>
                      <option value="below">Passe sous ($)</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="f-val" className="text-[13px] font-semibold text-[#C5CCD6]">{pctCond ? "Variation (%)" : "Prix ($)"}</label>
                    <input id="f-val" inputMode="decimal" value={form.value} onChange={(e) => patch({ value: e.target.value })} className={fieldCls} />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[13px] font-semibold text-[#C5CCD6]">Canal de notification</span>
                  <div role="group" aria-label="Canal" className="flex flex-wrap gap-2">
                    {["Push", "Telegram", "Email"].map((c) => (
                      <Chip key={c} active={form.channel === c} onClick={() => patch({ channel: c })}>
                        <span className="flex items-center gap-2"><ChannelIcon channel={c} className="h-4 w-4" />{c}</span>
                      </Chip>
                    ))}
                  </div>
                </div>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-[#C5CCD6]">
                  <input type="checkbox" checked={form.urgent} onChange={() => patch({ urgent: !form.urgent })} className="h-5 w-5 accent-[#7DD3C0]" />
                  Critique : me prévenir même en Mode Nuit
                </label>
              </div>
            ) : (
              <div className="flex flex-col gap-[18px]">
                <div role="group" aria-label="Sens" className="flex gap-2">
                  <Chip className="flex-1" active={form.side === "buy"} onClick={() => patch({ side: "buy" })}>Achat</Chip>
                  <Chip className="flex-1" active={form.side === "sell"} onClick={() => patch({ side: "sell" })}>Vente</Chip>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="f-qty" className="text-[13px] font-semibold text-[#C5CCD6]">Quantité</label>
                    <input id="f-qty" inputMode="decimal" value={form.qty} onChange={(e) => patch({ qty: e.target.value })} className={fieldCls} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="f-price" className="text-[13px] font-semibold text-[#C5CCD6]">Prix unitaire ($)</label>
                    <input id="f-price" inputMode="decimal" value={form.price} onChange={(e) => patch({ price: e.target.value })} className={fieldCls} />
                  </div>
                </div>
              </div>
            )}

            <span className="text-[13px] text-[#8B95A5]">
              {isAlert
                ? form.urgent || !night
                  ? `Vous serez notifié immédiatement via ${form.channel}.`
                  : "Mode Nuit actif : entre 22:00 et 07:00, cette alerte sera regroupée dans le rapport du matin."
                : `Prix actuel ${form.asset} : ${priceFmt(prices[form.asset])}. Laissez le prix vide pour utiliser le cours actuel.`}
            </span>

            <div className="flex justify-end gap-2.5">
              <button type="button" onClick={() => setModal(false)} className="h-12 rounded-xl border border-white/[0.12] px-[18px] text-sm font-semibold hover:bg-white/[0.07]">
                Annuler
              </button>
              <button type="button" onClick={submit} className="h-12 rounded-xl bg-[#7DD3C0] px-5 text-sm font-bold text-[#06231D] hover:brightness-110">
                {isAlert ? "Créer l’alerte" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ TOAST ============ */}
      {toast && (
        <div role="status" className="fixed left-1/2 top-6 z-30 flex -translate-x-1/2 items-center gap-2.5 rounded-2xl border border-[#7DD3C0]/35 bg-[#1A2330] px-[18px] py-3 text-sm font-semibold shadow-2xl">
          <Check className="h-[18px] w-[18px] text-[#7DD3C0]" strokeWidth={2.4} aria-hidden="true" />
          {toast}
        </div>
      )}
    </div>
  );
}
