# Laborbericht V9 – Anlauf- und Bremsverfahren

| Datei | Inhalt |
|---|---|
| `bericht/bericht.pdf` | fertiger Laborbericht (abzugeben) |
| `bericht/bericht.tex` | LaTeX-Quelltext des Berichts |
| `erklaerung/erklaerung.pdf` | Lernskript: alle Punkte erklärt, Antworten, Testatfragen |
| `auswertung/auswertung.py` | Python-Auswertung (erzeugt Diagramme + `bericht/werte.tex`) |
| `daten/` | Original-Messdaten (CSV) |

## Neu erzeugen
```bash
pip install numpy scipy matplotlib
cd auswertung && python3 auswertung.py
cd ../bericht && pdflatex bericht.tex && pdflatex bericht.tex
cd ../erklaerung && pdflatex erklaerung.tex && pdflatex erklaerung.tex
```
Nicht verwendet (gehören nicht zu V9): `F_Kennline_*.csv`, `Messung_f87Hz_*.csv`.
