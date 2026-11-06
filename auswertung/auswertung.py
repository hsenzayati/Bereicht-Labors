"""Auswertung Versuch 9: Anlauf- und Bremsverfahren.

Erzeugt alle Diagramme (PDF) fuer den Bericht sowie die Datei werte.tex
mit den berechneten Kennwerten als LaTeX-Makros.
Aufruf:  python3 auswertung.py
"""
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
import numpy as np
from scipy.signal import savgol_filter

from lade import lade

ROOT = Path(__file__).resolve().parent.parent
FIG = ROOT / "bericht" / "abbildungen"
FIG.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------- Stil
plt.rcParams.update({
    "font.family": "serif", "font.size": 9, "axes.grid": True,
    "grid.alpha": 0.35, "axes.titlesize": 9, "legend.fontsize": 8,
    "figure.dpi": 150, "savefig.bbox": "tight", "lines.linewidth": 1.2,
})
KOMMA = FuncFormatter(lambda x, p: f"{x:g}".replace(".", ","))
C = ["#1f5fa8", "#d1495b", "#2a9d8f", "#e9a03b", "#6c4ab6", "#555555"]


def komma(ax):
    ax.xaxis.set_major_formatter(KOMMA)
    ax.yaxis.set_major_formatter(KOMMA)


def speichern(fig, name):
    fig.savefig(FIG / f"{name}.pdf")
    plt.close(fig)


def de(x, nk=2):
    """Zahl mit Dezimalkomma fuer LaTeX."""
    return f"{x:.{nk}f}".replace(".", "{,}")


WERTE = {}


ZW = {"0": "null", "1": "eins", "2": "zwei", "3": "drei", "4": "vier",
      "5": "fuenf", "6": "sechs", "7": "sieben", "8": "acht", "9": "neun"}


def merke(name, wert, nk=2):
    name = "".join(ZW.get(ch, ch) for ch in name)   # LaTeX-Makros: nur Buchstaben
    WERTE[name] = de(wert, nk) if isinstance(wert, (float, np.floating)) else str(wert)


# ---------------------------------------------------------------- Konstanten
R = 0.3 / 2
m_stahl, m_alu = 32.99, 11.35
J_stahl = 0.5 * m_stahl * R**2          # Vollzylinder
J_alu = 0.5 * m_alu * R**2
J_vorb = 0.37451404                       # Wert aus der Versuchsanleitung
merke("JStahl", J_stahl, 4); merke("JAlu", J_alu, 4); merke("JVorb", J_vorb, 4)

# ======================================================================
# 1) Vorbereitung: Hochlaufzeit aus M(n)-Kennlinie (400 V, Dreieck)
#    Werte aus dem Diagramm der Versuchsanleitung (S. 9) abgelesen
# ======================================================================
kenn = np.array([
    [0, 46.0], [50, 45.5], [100, 44.7], [150, 43.6], [200, 41.9], [250, 42.2],
    [300, 42.8], [350, 43.5], [400, 44.3], [450, 44.9], [500, 45.9],
    [550, 47.1], [600, 48.0], [650, 49.1], [700, 51.0], [750, 52.6],
    [800, 54.0], [850, 54.7], [900, 55.5], [950, 55.7], [1000, 56.0],
    [1050, 55.6], [1100, 53.9], [1150, 51.3], [1200, 47.6], [1250, 42.8],
    [1300, 37.4], [1350, 31.1], [1380, 27.2], [1395, 24.3], [1430, 20.0],
    [1440, 18.3], [1450, 16.2], [1460, 13.6], [1470, 10.7], [1478, 7.2],
    [1483, 3.7], [1490, 1.8]])
n_k, M400 = kenn[:, 0], kenn[:, 1]
M230 = M400 * (230 / 400) ** 2
M_reib = 0.02
np.savetxt(ROOT / "auswertung" / "kennlinie_400V_abgelesen.csv", kenn,
           delimiter=";", header="n in 1/min;M in Nm (400 V)", fmt="%.1f")


def hochlauf(M, n_end, J=J_vorb):
    """Schrittweise Integration: dt = 2*pi*J*dn / M (dn in 1/s)."""
    nn = np.arange(0, n_end + 0.1, 10.0)           # feines Raster 10 1/min
    MM = np.interp(nn, n_k, M) - M_reib
    dt = 2 * np.pi * J * np.diff(nn) / 60 / (0.5 * (MM[1:] + MM[:-1]))
    return np.concatenate([[0], np.cumsum(dt)]), nn


# Beispielrechnung der Anleitung (erster Schritt 0 -> 50 1/min, 400 V)
dt_bsp = 2 * np.pi * (50 / 60) * J_vorb / M400[0]
merke("dtBsp", dt_bsp * 1000, 1)

t_D, n_D = hochlauf(M400, 1480)
t_Y, n_Y = hochlauf(M230, 1480)
for lbl, t, n in [("D", t_D, n_D), ("Y", t_Y, n_Y)]:
    for ng in (1400, 1450, 1480):
        merke(f"tH{lbl}{ {1400:'A',1450:'B',1480:'C'}[ng] }", float(np.interp(ng, n, t)), 2)

# Tabelle mit Zwischenschritten (alle 50 1/min wie in der Anleitung)
tab = []
for i in range(len(n_k) - 1):
    if n_k[i + 1] > 1480:
        break
    dn = (n_k[i + 1] - n_k[i]) / 60
    Mm = 0.5 * (M400[i] + M400[i + 1]) - M_reib
    tab.append((n_k[i], n_k[i + 1], Mm, Mm / 3,
                2 * np.pi * J_vorb * dn / Mm, 2 * np.pi * J_vorb * dn / (Mm / 3)))
tab = np.array(tab)
tD_cum, tY_cum = np.cumsum(tab[:, 4]), np.cumsum(tab[:, 5])
with open(ROOT / "bericht" / "tabelle_hochlauf.tex", "w") as f:
    for r, a, b in zip(tab, tD_cum, tY_cum):
        f.write(f"{r[0]:.0f} -- {r[1]:.0f} & {de(r[2],1)} & {de(r[3],1)} & "
                f"{de(r[4]*1000,1)} & {de(a,3)} & {de(r[5]*1000,1)} & {de(b,3)}\\\\\n")

fig, ax = plt.subplots(figsize=(6.2, 3.2))
ax.plot(n_k, M400, "o-", ms=3, color=C[0], label=r"$M_{400\,\mathrm{V}}$ (Dreieck, Herstellerkennlinie)")
ax.plot(n_k, M230, "s-", ms=3, color=C[1], label=r"$M_{230\,\mathrm{V}} = M_{400\,\mathrm{V}}/3$ (Stern)")
ax.axhline(M_reib, color=C[5], ls="--", label=r"Lastmoment $M_\mathrm{Reib}\approx 0{,}02$ Nm")
ax.set_xlabel(r"Drehzahl $n$ in min$^{-1}$"); ax.set_ylabel(r"Moment $M$ in Nm")
ax.set_xlim(0, 1550); ax.set_ylim(0, 60); ax.legend(); komma(ax)
speichern(fig, "v_kennlinie")

fig, ax = plt.subplots(figsize=(6.2, 3.2))
ax.plot(t_D, n_D, color=C[0], label="Dreieck (400 V am Strang)")
ax.plot(t_Y, n_Y, color=C[1], label="Stern (230 V am Strang)")
for t, n, c in [(t_D, n_D, C[0]), (t_Y, n_Y, C[1])]:
    tt = np.interp(1450, n, t)
    ax.plot(tt, 1450, "o", color=c)
    ax.annotate(f"{tt:.2f} s".replace(".", ","), (tt, 1450), (tt - 0.5, 1150),
                arrowprops=dict(arrowstyle="->", color=c), color=c)
ax.set_xlabel(r"Zeit $t$ in s"); ax.set_ylabel(r"Drehzahl $n$ in min$^{-1}$")
ax.set_xlim(0, 4.2); ax.set_ylim(0, 1600); ax.legend(loc="lower right"); komma(ax)
speichern(fig, "v_hochlauf")

# ======================================================================
# 2) Anlaufverfahren
# ======================================================================
ANL = {
    "direkt": ("Stern-Dreieck_direkt.csv", "Direkter Dreieckanlauf"),
    "frueh": ("Stern-Dreieck_zu_fr_h.csv", "Stern-Dreieck, zu früh umgeschaltet"),
    "richtig": ("Stern-Dreieck_richtig.csv", "Stern-Dreieck, richtig umgeschaltet"),
    "falsch": ("Dreieck_falsch_verdrahtet.csv", "Stern-Dreieck, falsch verdrahtet"),
}
anl = {}
for key, (datei, titel) in ANL.items():
    a = lade(datei)
    t, n, U, I, P, Q = a.T
    i_on = int(np.argmax(I > 0.5))
    t0 = t[i_on]
    d = dict(t=t - t0, n=n, U=U, I=I, P=P, Q=Q, titel=titel)
    # Umschaltpause: Strom 0 nach dem Einschalten (vor Ende der Messung)
    pause = np.where((I < 0.5) & (t > t0) & (t < t[-1] - 0.5))[0]
    if len(pause):
        p0, p1 = pause[0], pause[pause < pause[0] + 40][-1]
        d["t_um"] = t[p0] - t0
        d["n_um"] = n[p0]
        d["pause"] = t[p1 + 1] - t[p0]
        nach = slice(p1 + 1, p1 + 15)
        d["I2"] = I[nach].max()
        d["U2"] = U[nach][I[nach] > 0.5].min()
        d["P2"] = P[nach].max()
        anl_vor = slice(i_on, p0)
    else:
        anl_vor = slice(i_on, len(t))
    d["I1"] = I[i_on:i_on + 10].max()
    d["U0"] = U[:i_on - 2].mean()
    d["U1"] = U[i_on:i_on + 10][I[i_on:i_on + 10] > 0.5].min()
    d["P1"] = P[i_on:i_on + 10].max()
    d["Q1"] = Q[i_on:i_on + 10].max()
    stat = slice(-60, -3)
    d["n_end"] = np.median(n[stat]); d["I_end"] = np.median(I[stat])
    d["P_end"] = np.median(P[stat]); d["Q_end"] = np.median(Q[stat])
    d["t98"] = d["t"][np.argmax(n > 0.98 * d["n_end"])]
    d["t1450"] = d["t"][np.argmax(n > 1450)]
    # Stromzeitintegral ~ Netzbelastung, Wirkenergie waehrend des Hochlaufs
    w = (d["t"] >= 0) & (d["t"] <= d["t98"] + 0.05)
    d["E"] = np.trapezoid(P[w], d["t"][w])
    # Beschleunigungsmoment aus gefilterter Drehzahl
    dt = np.median(np.diff(t))
    ns = savgol_filter(n, 15, 2)
    dndt = savgol_filter(n, 15, 2, deriv=1, delta=dt)
    d["ns"], d["MB"] = ns, J_stahl * 2 * np.pi / 60 * dndt
    anl[key] = d
    for k in ("I1", "U0", "U1", "P1", "Q1", "n_end", "I_end", "P_end", "Q_end", "t98", "t1450", "E"):
        merke(f"{key}{k}".replace("_", ""), float(d[k]), 2 if k not in ("n_end", "U0", "U1", "P1", "Q1", "E", "P_end", "Q_end") else 0)
    merke(f"{key}dU", float((d["U0"] - d["U1"]) / d["U0"] * 100), 1)
    merke(f"{key}Ifak", float(d["I1"] / d["I_end"]), 1)
    merke(f"{key}IN", float(d["I1"] / 6.65), 1)
    if "t_um" in d:
        for k in ("t_um", "n_um", "pause", "I2", "U2", "P2"):
            merke(f"{key}{k}".replace("_", ""), float(d[k]), 2 if k in ("t_um", "pause", "I2") else 0)
        merke(f"{key}dUzwei", float((d["U0"] - d["U2"]) / d["U0"] * 100), 1)

merke("tHYum", float(np.interp(anl["richtig"]["n_um"], n_Y, t_Y)), 2)

# mittleres Beschleunigungsmoment im Bereich 200..1000 1/min
for key in anl:
    d = anl[key]
    sel = (d["ns"] > 200) & (d["ns"] < 1000) & (d["t"] > 0) & (d["I"] > 0.5)
    if key != "direkt":
        sel &= d["t"] < d["t_um"]
    merke(f"{key}MBmittel", float(d["MB"][sel].mean()), 1)
merke("MkennDmittel", float(np.mean(np.interp(np.arange(200, 1001, 10), n_k, M400))), 1)
merke("MkennYmittel", float(np.mean(np.interp(np.arange(200, 1001, 10), n_k, M230))), 1)


def anlaufplot(key, xmax):
    d = anl[key]
    fig, axs = plt.subplots(4, 1, figsize=(6.2, 6.6), sharex=True)
    axs[0].plot(d["t"], d["n"], color=C[0])
    axs[0].set_ylabel(r"$n$ in min$^{-1}$")
    axs[1].plot(d["t"], d["I"], color=C[1])
    axs[1].set_ylabel(r"$I_\mathrm{eff}$ in A")
    axs[2].plot(d["t"], d["U"], color=C[2])
    axs[2].set_ylabel(r"$U_\mathrm{eff}$ in V")
    lo = min(d["U1"], d.get("U2", 1e9)) - 6
    axs[2].set_ylim(lo, d["U0"] + 4)
    axs[3].plot(d["t"], d["P"] / 1000, color=C[3], label="Wirkleistung $P$ in kW")
    axs[3].plot(d["t"], d["Q"] / 1000, color=C[4], label="Blindleistung $Q$ in kvar")
    axs[3].set_ylabel("$P$, $Q$"); axs[3].legend(loc="upper right")
    axs[3].set_xlabel(r"Zeit $t$ in s (ab Einschalten)")
    for ax in axs:
        komma(ax)
        if "t_um" in d:
            ax.axvspan(d["t_um"], d["t_um"] + d["pause"], color="0.85", zorder=0)
    axs[0].set_xlim(-0.1, xmax)
    speichern(fig, f"a_{key}")


anlaufplot("direkt", 2.0)
anlaufplot("frueh", 3.5)
anlaufplot("richtig", 4.8)
anlaufplot("falsch", 4.8)

# Vergleich Drehzahl: Messung vs. Rechnung
fig, ax = plt.subplots(figsize=(6.2, 3.4))
for (key, c) in zip(anl, C):
    d = anl[key]
    ax.plot(d["t"], d["n"], color=c, label=d["titel"])
ax.plot(t_D, n_D, "k--", lw=1, label="Rechnung Dreieck")
ax.plot(t_Y, n_Y, "k:", lw=1.3, label="Rechnung Stern")
ax.set_xlim(-0.1, 4.8); ax.set_ylim(-20, 1600)
ax.set_xlabel(r"Zeit $t$ in s"); ax.set_ylabel(r"Drehzahl $n$ in min$^{-1}$")
ax.legend(loc="lower right", fontsize=7); komma(ax)
speichern(fig, "a_vergleich_n")

fig, ax = plt.subplots(figsize=(6.2, 3.0))
for (key, c) in zip(anl, C):
    d = anl[key]
    ax.plot(d["t"], d["I"], color=c, label=d["titel"])
ax.set_xlim(-0.1, 4.8)
ax.set_xlabel(r"Zeit $t$ in s"); ax.set_ylabel(r"$I_\mathrm{eff}$ in A")
ax.legend(loc="upper right", fontsize=7); komma(ax)
speichern(fig, "a_vergleich_I")

# Beschleunigungsmoment
fig, axs = plt.subplots(1, 2, figsize=(6.4, 3.0))
for key, c in [("direkt", C[0]), ("richtig", C[2])]:
    d = anl[key]
    m = (d["t"] > 0.03) & (d["I"] > 0.5)
    axs[0].plot(d["t"][m], d["MB"][m], ".", ms=2, color=c, label=d["titel"])
    axs[1].plot(d["ns"][m], d["MB"][m], ".", ms=2, color=c)
axs[1].plot(n_k, M400, "k--", lw=1, label=r"$M_{400\,\mathrm{V}}$ Kennlinie")
axs[1].plot(n_k, M230, "k:", lw=1.3, label=r"$M_{230\,\mathrm{V}}$ Kennlinie")
axs[0].set_xlabel(r"Zeit $t$ in s"); axs[0].set_ylabel(r"$M_\mathrm{B}$ in Nm")
axs[1].set_xlabel(r"Drehzahl $n$ in min$^{-1}$")
axs[0].set_xlim(0, 4.5); axs[0].set_ylim(-10, 90); axs[1].set_ylim(-10, 90)
axs[1].set_xlim(0, 1550)
axs[0].legend(fontsize=7, loc="upper right", markerscale=4); axs[1].legend(fontsize=7)
for ax in axs:
    komma(ax)
speichern(fig, "a_moment")

# ======================================================================
# 3) Bremsverfahren
# ======================================================================
BR = {
    "feder": ("Federkraftbremse.csv", "Federkraftbremse"),
    "federnull": ("Federkraftbremse0.csv", "Federkraftbremse (Wdh.)"),
    "dcl": ("DC_Bremse_Langsam.csv", "DC-Bremse, kleiner Strom"),
    "dcm": ("DC_Bremse_Mittel.csv", "DC-Bremse, mittlerer Strom"),
    "dcs": ("DC_Bremse_Schnell.csv", "DC-Bremse, großer Strom"),
    "genohne": ("Generatorische_Bremse_ohne_Bremswiderstand.csv", "Generatorisch ohne $R_\\mathrm{B}$"),
    "genl": ("Generatorische_Bremse_Langsam.csv", "Generatorisch mit $R_\\mathrm{B}$, langsam"),
    "genm": ("Generatorische_Bremse_Mittel.csv", "Generatorisch mit $R_\\mathrm{B}$, mittel"),
    "gens": ("Generatorische_Bremse_Schnell.csv", "Generatorisch mit $R_\\mathrm{B}$, schnell"),
}
br = {}
E_kin = 0.5 * J_alu * (2 * np.pi * 1800 / 60) ** 2
merke("Ekin", E_kin, 0)
for key, (datei, titel) in BR.items():
    a = lade(datei)
    t, n, U, I, P, Q, Uzk, Irb, I1, I2, I3, Irbdc, Prb = a[:, :13].T
    d = dict(t=t, n=n, U=U, I=I, Uzk=Uzk, Irb=Irb, Prb=Prb, Idc=np.max(np.abs(a[:, 8:11]), axis=1), titel=titel)
    n0 = np.mean(n[t < 0])
    i_e = int(np.argmax(n < 10)) if (n < 10).any() else len(n) - 1
    d["n0"], d["tB"] = n0, t[i_e]
    dt = np.median(np.diff(t))
    win = 9 if key.startswith(("feder", "gens", "dcs")) else 21
    ns = savgol_filter(n, win, 2)
    d["ns"] = ns
    d["M"] = -J_alu * 2 * np.pi / 60 * savgol_filter(n, win, 2, deriv=1, delta=dt)
    i_s = int(np.argmax((t > 0) & (n < n0 - 15)))          # Beginn der Verzoegerung
    d["ts"] = t[i_s]
    d["Mmit"] = J_alu * 2 * np.pi / 60 * (n0 - n[i_e]) / (d["tB"] - d["ts"])
    sel = (t > 0) & (t < d["tB"])
    d["Mmax"] = d["M"][sel].max()
    d["Uzkmax"] = Uzk.max()
    d["Erb"] = np.trapezoid(Prb, t)
    # Einsetzen des Bremsstroms (DC-Bremse)
    aus = np.where((t > 0) & (I < 0.5))[0]
    ion = np.where((t > (t[aus[0]] if len(aus) else 0)) & (I > 1))[0]
    d["tI"] = t[ion[0]] if len(ion) else np.nan
    if key.startswith("dc"):
        bs = (t > d["tI"] + 0.1) & (n > 100)
        d["IdcB"] = np.median(d["Idc"][bs])
        d["IeffB"] = np.median(I[bs])
        d["UeffB"] = np.median(U[bs])
        i_I = int(np.argmax(t >= d["tI"]))
        d["Mmit"] = J_alu * 2 * np.pi / 60 * (n[i_I] - n[i_e]) / (d["tB"] - d["tI"])
        merke(f"{key}nI", float(n[i_I]), 0)
        merke(f"{key}IdcB", float(d["IdcB"]), 1)
        merke(f"{key}IeffB", float(d["IeffB"]), 1)
        merke(f"{key}tI", float(d["tI"]), 2)
        merke(f"{key}tnachI", float(d["tB"] - d["tI"]), 2)
    br[key] = d
    merke(f"{key}nnull", float(n0), 0)
    merke(f"{key}tB", float(d["tB"]), 2)
    merke(f"{key}ts", float(d["ts"]), 2)
    merke(f"{key}Mmit", float(d["Mmit"]), 1)
    merke(f"{key}Mmax", float(d["Mmax"]), 1)
    merke(f"{key}Uzkmax", float(d["Uzkmax"]), 0)
    merke(f"{key}Erb", float(d["Erb"]), 0)
    merke(f"{key}verz", float((n0 - n[i_e]) / d["tB"]), 0)

# Bremswiderstand abschaetzen: P = U_zk * I_dc ;  Einschaltdauer aus eff/mittel
d = br["gens"]
a = lade(BR["gens"][0])
m = a[:, 7] > 1
Irb_eff, Irb_dc, Uz = a[m, 7], a[m, 11], a[m, 6]
D = (Irb_dc / Irb_eff) ** 2
R_b = np.median(Uz / (Irb_dc / D))
merke("Rb", float(R_b), 0)
merke("PRbmax", float(a[:, 12].max()), 0)
merke("gensErbAnteil", float(br["gens"]["Erb"] / E_kin * 100), 0)

# Uebersichtstabelle Bremsen
with open(ROOT / "bericht" / "tabelle_bremsen.tex", "w") as f:
    for key in ["feder", "dcl", "dcm", "dcs", "genohne", "genl", "genm", "gens"]:
        d = br[key]
        tit = d["titel"].replace("Generatorisch", "Generat.")
        f.write(f"{tit} & {de(d['tB'],2)} & {de((d['n0'])/d['tB'],0)} & "
                f"{de(d['Mmit'],1)} & {de(d['Mmax'],1)} & {de(d['Uzkmax'],0)} & "
                f"{de(d['Erb'],0) if d['Erb']>0 else '--'}\\\\\n")

# Drehzahlverlaeufe aller Verfahren
fig, ax = plt.subplots(figsize=(6.2, 3.6))
for key, c, ls in [("feder", C[5], "-"), ("dcl", C[1], ":"), ("dcm", C[1], "--"),
                   ("dcs", C[1], "-"), ("genohne", C[4], "-"), ("genl", C[0], ":"),
                   ("genm", C[0], "--"), ("gens", C[0], "-")]:
    d = br[key]
    ax.plot(d["t"], d["n"], color=c, ls=ls, label=d["titel"])
ax.set_xlim(-0.1, 10.5); ax.set_ylim(-60, 1900)
ax.set_xlabel(r"Zeit $t$ in s (ab Bremsbefehl)"); ax.set_ylabel(r"Drehzahl $n$ in min$^{-1}$")
ax.legend(fontsize=7, loc="upper right"); komma(ax)
speichern(fig, "b_vergleich_n")

# Federkraftbremse
fig, axs = plt.subplots(2, 1, figsize=(6.2, 3.8), sharex=True)
for key, c in [("feder", C[0]), ("federnull", C[1])]:
    d = br[key]
    axs[0].plot(d["t"], d["n"], color=c, label=d["titel"])
    axs[1].plot(d["t"], d["U"], color=c)
axs[0].set_ylabel(r"$n$ in min$^{-1}$"); axs[0].legend()
axs[1].set_ylabel(r"$U_\mathrm{eff}$ in V"); axs[1].set_xlabel(r"Zeit $t$ in s")
for ax in axs:
    komma(ax)
speichern(fig, "b_feder")

# DC-Bremse
fig, axs = plt.subplots(3, 1, figsize=(6.2, 5.4), sharex=True)
for key, c in [("dcl", C[0]), ("dcm", C[2]), ("dcs", C[1])]:
    d = br[key]
    axs[0].plot(d["t"], d["n"], color=c, label=d["titel"])
    axs[1].plot(d["t"], d["Idc"], color=c)
    axs[2].plot(d["t"], d["U"], color=c)
axs[0].set_ylabel(r"$n$ in min$^{-1}$"); axs[0].legend(fontsize=7)
axs[1].set_ylabel(r"$\max|I_{k,\mathrm{DC}}|$ in A")
axs[2].set_ylabel(r"$U_\mathrm{eff}$ in V"); axs[2].set_xlabel(r"Zeit $t$ in s")
axs[0].set_xlim(-0.1, 6.3)
for ax in axs:
    komma(ax)
speichern(fig, "b_dc")

# Generatorisch ohne Bremswiderstand
d = br["genohne"]
fig, axs = plt.subplots(3, 1, figsize=(6.2, 5.0), sharex=True)
axs[0].plot(d["t"], d["n"], color=C[0]); axs[0].set_ylabel(r"$n$ in min$^{-1}$")
axs[1].plot(d["t"], d["Uzk"], color=C[1]); axs[1].set_ylabel(r"$U_\mathrm{ZK}$ in V")
axs[2].plot(d["t"], d["I"], color=C[2]); axs[2].set_ylabel(r"$I_\mathrm{eff}$ in A")
axs[2].set_xlabel(r"Zeit $t$ in s")
for ax in axs:
    komma(ax)
speichern(fig, "b_gen0")

# Generatorisch mit Bremswiderstand
fig, axs = plt.subplots(3, 1, figsize=(6.2, 5.4), sharex=True)
for key, c in [("genl", C[0]), ("genm", C[2]), ("gens", C[1])]:
    d = br[key]
    axs[0].plot(d["t"], d["n"], color=c, label=d["titel"])
    axs[1].plot(d["t"], d["Uzk"], color=c)
    axs[2].plot(d["t"], d["Prb"] / 1000, color=c)
axs[0].set_ylabel(r"$n$ in min$^{-1}$"); axs[0].legend(fontsize=7)
axs[1].set_ylabel(r"$U_\mathrm{ZK}$ in V")
axs[2].set_ylabel(r"$P_\mathrm{RB}$ in kW"); axs[2].set_xlabel(r"Zeit $t$ in s")
for ax in axs:
    komma(ax)
speichern(fig, "b_gen")

# Bremsmomente
fig, axs = plt.subplots(2, 1, figsize=(6.2, 5.0), sharex=True)
for key, c in [("feder", C[5]), ("dcl", C[0]), ("dcm", C[2]), ("dcs", C[1])]:
    d = br[key]; m = (d["t"] > -0.05) & (d["t"] < d["tB"] + 0.02)
    axs[0].plot(d["t"][m], d["M"][m], color=c, label=d["titel"])
for key, c in [("genohne", C[4]), ("genl", C[0]), ("genm", C[2]), ("gens", C[1])]:
    d = br[key]; m = (d["t"] > -0.05) & (d["t"] < d["tB"] + 0.02)
    axs[1].plot(d["t"][m], d["M"][m], color=c, label=d["titel"])
for ax in axs:
    ax.set_ylabel(r"$M_\mathrm{Br}$ in Nm"); ax.legend(fontsize=7, loc="upper right"); komma(ax)
axs[1].set_xlabel(r"Zeit $t$ in s (ab Bremsbefehl)")
axs[0].set_xlim(-0.1, 10.3)
speichern(fig, "b_moment")

# Zoom Bremsmoment schnell
fig, ax = plt.subplots(figsize=(6.2, 2.8))
for key, c in [("feder", C[5]), ("dcs", C[1]), ("gens", C[0])]:
    d = br[key]; m = (d["t"] > -0.05) & (d["t"] < d["tB"] + 0.02)
    ax.plot(d["t"][m], d["M"][m], color=c, label=d["titel"])
ax.set_xlim(-0.05, 2.0); ax.set_xlabel(r"Zeit $t$ in s"); ax.set_ylabel(r"$M_\mathrm{Br}$ in Nm")
ax.legend(fontsize=7); komma(ax)
speichern(fig, "b_moment_zoom")

# ---------------------------------------------------------------- Ausgabe
with open(ROOT / "bericht" / "werte.tex", "w") as f:
    f.write("% automatisch erzeugt von auswertung/auswertung.py\n")
    for k, v in WERTE.items():
        f.write(f"\\newcommand{{\\W{k}}}{{{v}}}\n")
for k, v in WERTE.items():
    print(f"{k:22s} {v}")
