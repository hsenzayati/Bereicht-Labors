// Erzeugt den Laborbericht V9 als Word-Datei (bericht.docx).
// Zahlenwerte kommen aus ../bericht/werte.tex, Tabellen aus ../bericht/tabelle_*.tex,
// Diagramme aus ./bilder/*.png (aus den PDF-Abbildungen gerendert).
// Aufruf:  node erzeuge_word.js
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, HeadingLevel, BorderStyle, ShadingType, LevelFormat,
  Header, Footer, PageNumber, TableOfContents, PageBreak, Math, MathRun,
  MathFraction, MathSubScript, MathSuperScript, MathRadical, TabStopType,
  VerticalAlign, LineRuleType,
} = require("docx");

const DIR = __dirname;
const ROOT = path.join(DIR, "..");

// ------------------------------------------------------------------ Werte
const W = {};
for (const l of fs.readFileSync(path.join(ROOT, "bericht/werte.tex"), "utf8").split("\n")) {
  const m = l.match(/\\newcommand\{\\W(\w+)\}\{(.*)\}$/);
  if (m) W[m[1]] = m[2].replace(/\{,\}/g, ",");
}
const texZeilen = (f) =>
  fs.readFileSync(path.join(ROOT, "bericht", f), "utf8").split("\n").filter((l) => l.includes("&"))
    .map((l) => l.replace(/\\\\\s*$/, "").split("&").map((c) => c.trim()
      .replace(/\{,\}/g, ",").replace(/ -- /g, " – ").replace(/^--$/, "–")
      .replace(/\$R_\\mathrm\{B\}\$/g, "*R*_{B}")));

// ------------------------------------------------------------------ Text-Helfer
// Mini-Markup: **fett**, *kursiv*, _{tief}, ^{hoch}
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|_\{[^}]+\}|\^\{[^}]+\})/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const s = m[0];
    if (s.startsWith("**")) out.push(new TextRun({ text: s.slice(2, -2), bold: true, ...base }));
    else if (s.startsWith("*")) out.push(new TextRun({ text: s.slice(1, -1), italics: true, ...base }));
    else if (s.startsWith("_")) out.push(new TextRun({ text: s.slice(2, -1), subScript: true, ...base }));
    else out.push(new TextRun({ text: s.slice(2, -1), superScript: true, ...base }));
    last = m.index + s.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}
const P = (text, opt = {}) => new Paragraph({ children: runs(text), alignment: AlignmentType.JUSTIFIED, ...opt });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const LI = (t, level = 0) => new Paragraph({ numbering: { reference: "punkte", level }, children: runs(t) });
const NUM = (t, ref = "zahlen") => new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(t) });

// Formel: zentrierte Gleichung mit Nummer rechts
let eqNr = 0;
function EQ(mathChildren, nummer = true) {
  const kids = [new TextRun("\t"), new Math({ children: mathChildren })];
  if (nummer) { eqNr++; kids.push(new TextRun(`\t(${eqNr})`)); }
  return new Paragraph({
    children: kids, spacing: { before: 120, after: 120 },
    tabStops: [{ type: TabStopType.CENTER, position: 4535 }, { type: TabStopType.RIGHT, position: 9070 }],
  });
}
const mr = (t) => new MathRun(t);
const frac = (n, d) => new MathFraction({ numerator: n, denominator: d });
const sub = (b, s) => new MathSubScript({ children: [mr(b)], subScript: [mr(s)] });
const sup = (b, s) => new MathSuperScript({ children: b, superScript: [mr(s)] });

// ------------------------------------------------------------------ Bilder
let abbNr = 0;
const abbRef = {};
function pngGroesse(buf) { return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }
function BILD(name, caption, breiteCm = 15.5, key) {
  const buf = fs.readFileSync(path.join(DIR, "bilder", name + ".png"));
  const { w, h } = pngGroesse(buf);
  const wPx = breiteCm / 2.54 * 96;
  abbNr++;
  if (key) abbRef[key] = abbNr;
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 },
      children: [new ImageRun({ type: "png", data: buf, transformation: { width: Math_round(wPx), height: Math_round(wPx * h / w) },
        altText: { title: caption, description: caption, name } })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 200 },
      children: [new TextRun({ text: `Abbildung ${abbNr}: `, bold: true, size: 19 }), ...runs(caption, { size: 19 })],
    }),
  ];
}
function Math_round(x) { return Number(x.toFixed(0)); }

// ------------------------------------------------------------------ Tabellen
let tabNr = 0;
const RAND = { style: BorderStyle.SINGLE, size: 4, color: "8C8C8C" };
const RAENDER = { top: RAND, bottom: RAND, left: RAND, right: RAND };
function TABELLE(caption, kopf, zeilen, breiten, opts = {}) {
  tabNr++;
  const total = breiten.reduce((a, b) => a + b, 0);
  const fs_ = opts.size || 19;
  const zelle = (text, i, kopfzeile) => new TableCell({
    width: { size: breiten[i], type: WidthType.DXA }, borders: RAENDER,
    verticalAlign: VerticalAlign.CENTER,
    shading: kopfzeile ? { type: ShadingType.CLEAR, fill: "DCE6F2", color: "auto" } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    children: [new Paragraph({
      alignment: i === 0 && !opts.zentriert ? AlignmentType.LEFT : AlignmentType.CENTER,
      children: runs(String(text), { bold: kopfzeile, size: fs_ }),
    })],
  });
  const rows = [new TableRow({ tableHeader: true, children: kopf.map((t, i) => zelle(t, i, true)) })];
  for (const z of zeilen) rows.push(new TableRow({ cantSplit: true, children: z.map((t, i) => zelle(t, i, false)) }));
  return [
    new Paragraph({
      keepNext: true, spacing: { before: 200, after: 80 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Tabelle ${tabNr}: `, bold: true, size: 19 }), ...runs(caption, { size: 19 })],
    }),
    new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: breiten, rows, alignment: AlignmentType.CENTER }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];
}

// Antwortkasten (einzellige Tabelle mit farbigem Kopf)
function ANTWORT(titel, absaetze) {
  const breite = 9070;
  return [
    new Paragraph({ spacing: { before: 120 }, children: [] }),
    new Table({
      width: { size: breite, type: WidthType.DXA }, columnWidths: [breite],
      rows: [
        new TableRow({ children: [new TableCell({
          width: { size: breite, type: WidthType.DXA }, borders: RAENDER,
          shading: { type: ShadingType.CLEAR, fill: "1F3F7A", color: "auto" },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: titel, bold: true, color: "FFFFFF", size: 20 })] })],
        })] }),
        new TableRow({ children: [new TableCell({
          width: { size: breite, type: WidthType.DXA }, borders: RAENDER,
          shading: { type: ShadingType.CLEAR, fill: "EEF3FA", color: "auto" },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: absaetze,
        })] }),
      ],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];
}

// ================================================================== Inhalt
const inhalt = [];
const add = (...x) => x.flat().forEach((e) => inhalt.push(e));

// ---------------- Deckblatt
const linie = (label, matr = true) => new Paragraph({
  spacing: { before: 280 },
  tabStops: [{ type: TabStopType.LEFT, position: 2000 }, { type: TabStopType.LEFT, position: 6300 }, { type: TabStopType.LEFT, position: 7500 }],
  children: [new TextRun(label), new TextRun("\t________________________________"),
    ...(matr ? [new TextRun("\tMatr.-Nr.:"), new TextRun("\t____________")] : [])],
});
add(
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600 }, children: [new TextRun({ text: "Ostfalia Hochschule für angewandte Wissenschaften", size: 26 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Fakultät Elektrotechnik", size: 26 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 500, after: 600 }, children: [new TextRun({ text: "Labor für elektrische Antriebe", size: 32, bold: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 12, color: "1F3F7A", space: 12 } }, children: [new TextRun({ text: "Laborbericht", size: 56, bold: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: "Versuch 9: Anlauf- und Bremsverfahren", size: 36 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 800 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "1F3F7A", space: 12 } }, children: [new TextRun({ text: "von Asynchronmaschinen", size: 26 })] }),
  new Paragraph({ children: [new TextRun({ text: "Betreuer:\t", bold: true }), new TextRun("Prof. Dr.-Ing. Karl-Dieter Tieste, Dipl.-Ing. Roland Hippel")], tabStops: [{ type: TabStopType.LEFT, position: 2000 }] }),
  linie("Teilnehmer 1:"), linie("Teilnehmer 2:"), linie("Teilnehmer 3:"),
  linie("Gruppe:", false), linie("Versuchsdatum:", false), linie("Abgabedatum:", false),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1400 }, children: [new TextRun({ text: "Grundlage: Versuchsanleitung V9 „Anlauf- und Bremsverfahren“, Version 0.9 vom 08.10.2026", size: 18, italics: true })] }),
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({ children: [new TextRun({ text: "Inhaltsverzeichnis", bold: true, size: 32, font: "Calibri" })], spacing: { after: 200 } }),
  new TableOfContents("Inhaltsverzeichnis", { hyperlink: true, headingStyleRange: "1-2" }),
  new Paragraph({ children: [new PageBreak()] }),
);

// ---------------- 1 Einleitung
add(
  H1("1 Einleitung und Ziel des Versuchs"),
  P("Drehstrom-Asynchronmaschinen (ASM) mit Käfigläufer sind die am häufigsten eingesetzten elektrischen Antriebe. Beim direkten Einschalten nehmen sie einen Anlaufstrom auf, der ein Vielfaches des Nennstroms beträgt und das speisende Netz belastet. Beim Abschalten laufen sie dagegen ohne Bremse wegen der gespeicherten kinetischen Energie lange nach."),
  P("Ziel des Versuchs ist es,"),
  LI("den **direkten Dreieckanlauf** mit dem **Stern-Dreieck-Anlauf** (zu früh und richtig umgeschaltet) messtechnisch zu vergleichen,"),
  LI("die Hochlaufzeit einer ASM mit Schwungmasse vorab aus der Drehmoment-Drehzahl-Kennlinie zu **berechnen** und mit der Messung zu vergleichen,"),
  LI("die Bremsverfahren **Federkraftbremse**, **Gleichstrombremsung** sowie **generatorisches Bremsen mit und ohne Bremswiderstand** zu untersuchen und"),
  LI("aus den gemessenen Drehzahlverläufen die wirkenden Beschleunigungs- bzw. Bremsmomente zu bestimmen."),
);

// ---------------- 2 Grundlagen
add(
  H1("2 Theoretische Grundlagen"),
  H2("2.1 Anlaufverhalten der Asynchronmaschine"),
  P("Im Stillstand ist der Schlupf s = 1. Die ASM verhält sich dann wie ein Transformator mit kurzgeschlossener Sekundärwicklung: Wirksam ist nur die kleine Kurzschlussimpedanz, sodass der Anlaufstrom typischerweise das 5- bis 8-fache des Nennstroms erreicht. Dieser Strom ist überwiegend induktiv (kleiner Leistungsfaktor). Mit steigender Drehzahl sinkt der Schlupf, die wirksame Impedanz steigt und der Strom geht auf den Last- bzw. Leerlaufstrom zurück."),
  H2("2.2 Belastung des Netzes und Spannungseinbruch"),
  P("Der Anlaufstrom *I*_{1} fließt über die Kurzschlussimpedanz *Z*_{k} = *R*_{k} + j*X*_{k} des Netztransformators und der Zuleitungen. Nach dem Kapp'schen Dreieck gilt für den Spannungsabfall näherungsweise"),
  EQ([mr("ΔU≈"), sub("I", "1"), mr("("), sub("R", "k"), mr("cos φ+"), sub("X", "k"), mr("sin φ)")]),
  P("Da beim Anlauf cos φ klein und sin φ groß ist und beim Transformator *X*_{k} ≫ *R*_{k} gilt, liegt der Spannungsabfall fast in Phase mit der Netzspannung und verringert ihren Betrag besonders stark."),
  H2("2.3 Stern-Dreieck-Anlauf"),
  P("Im Stern liegt an jedem Wicklungsstrang nur U/√3 (hier 230 V statt 400 V). Strangstrom und Netzstrom sinken dadurch auf ein Drittel, ebenso das Moment (M ~ U²):"),
  EQ([sub("M", "230 V"), mr("="), sub("M", "400 V"), mr("·"), sup([mr("("), frac([mr("230 V")], [mr("400 V")]), mr(")")], "2"), mr("≈"), frac([mr("1")], [mr("3")]), sub("M", "400 V"),
    mr(",    "), sub("I", "Netz,Y"), mr("="), frac([mr("1")], [mr("3")]), sub("I", "Netz,Δ")]),
  P("Der Motor kann nur hochlaufen, wenn *M*_{230 V} > *M*_{Last} im ganzen Drehzahlbereich bis zur Umschaltung gilt. Umgeschaltet werden sollte erst, wenn die Maschine nahe der Nenndrehzahl ist. Sonst entsteht ein zweiter Stromstoß, der fast so groß ist wie beim Direktanlauf."),
  H2("2.4 Bewegungsgleichung"),
  P("Für den Hochlauf und das Bremsen gilt die Bewegungsgleichung"),
  EQ([sub("J", "ges"), mr("·"), frac([mr("dω")], [mr("dt")]), mr("="), sub("M", "Motor"), mr("−"), sub("M", "Last"), mr(",     ω=2πn")]),
  P("Umgeformt ergibt sich für einen Drehzahlschritt Δn (in 1/s)"),
  EQ([mr("Δt="), frac([mr("2π·"), sub("J", "ges"), mr("·Δn")], [sub("M", "Motor"), mr("−"), sub("M", "Last")])]),
  P("Umgekehrt lässt sich aus einem gemessenen Drehzahlverlauf das wirkende Moment bestimmen: M = J · 2π · dn/dt. Das Massenträgheitsmoment einer Vollscheibe beträgt J = ½ m r²."),
  H2("2.5 Bremsverfahren"),
  P("**Federkraftbremse:** Eine Druckfeder presst Ankerscheibe und Bremsrotor gegen die Reibfläche. Zum Lösen (Lüften) zieht ein Elektromagnet die Ankerscheibe an. Fällt die Spannung aus, bremst die Feder. Das Verfahren ist also *ausfallsicher* (Ruhestromprinzip) und hält die Last auch im Stillstand."),
  P("**Gleichstrombremsung:** Der Umrichter speist einen Gleichstrom in zwei Stränge ein. Es entsteht ein stehendes Magnetfeld. Im drehenden Käfigläufer werden Ströme induziert, die ein Bremsmoment erzeugen. Die Bremsenergie wird im Läufer in Wärme umgesetzt. Im Stillstand wird nichts mehr induziert, daher gibt es *kein Haltemoment*."),
  P("**Generatorisches Bremsen:** Der Umrichter senkt die Frequenz schneller ab, als die Maschine austrudelt. Die Maschine läuft übersynchron (s < 0) und arbeitet als Generator. Die Energie fließt in den Zwischenkreis. Da der Diodengleichrichter nicht zurückspeisen kann, steigt die Zwischenkreisspannung *U*_{ZK}. Ein Brems-Chopper schaltet ab einer Schwelle einen Bremswiderstand *R*_{B} zu, der die Energie in Wärme umsetzt. Ohne *R*_{B} muss der Umrichter die Bremsung bei Überspannung unterbrechen oder strecken."),
);

// ---------------- 3 Versuchsaufbau
add(
  H1("3 Versuchsaufbau"),
  P("Der Versuchsstand besteht aus einer Asynchronmaschine mit Schwungmasse und Federkraftbremse (Anlaufversuch) bzw. einer am Frequenzumrichter betriebenen ASM mit Schwungmasse (Bremsversuch). Gesteuert und gemessen wird über eine LabVIEW-Anwendung. Die elektrischen Größen erfasst ein Leistungsmessgerät LMG640. Die Messwerte werden im Abstand von 10 ms als Effektivwerte gespeichert."),
  TABELLE("Typenschilddaten der Asynchronmaschine (VEM K21R 100 LX 4)",
    ["Größe", "50 Hz", "60 Hz"],
    [["Bemessungsleistung *P*_{N}", "3,0 kW", "3,6 kW"],
     ["Bemessungsspannung", "400 V Δ / 690 V Y", "480 V Δ"],
     ["Bemessungsstrom *I*_{N}", "6,65 A / 3,85 A", "6,8 A"],
     ["Leistungsfaktor cos φ", "0,79", "0,77"],
     ["Bemessungsdrehzahl *n*_{N}", "1420 … 1440 min^{−1}", "1715 … 1740 min^{−1}"],
     ["Polpaarzahl *p*", "2 (*n*_{s} = 1500 min^{−1})", "2 (*n*_{s} = 1800 min^{−1})"]],
    [3400, 2830, 2830]),
  P("Das Bemessungsmoment beträgt *M*_{N} = *P*_{N}/(2π *n*_{N}) = 3000 W/(2π · 1420 min^{−1}/60) ≈ 20,2 Nm."),
  TABELLE("Schwungmassen (Vollscheiben, d = 0,3 m, J = ½ m r²)",
    ["Versuch", "Material", "Masse m", "Trägheitsmoment J"],
    [["Anlauf", "Stahl", "32,99 kg", `${W.JStahl} kg·m²`], ["Bremsen", "Aluminium", "11,35 kg", `${W.JAlu} kg·m²`]],
    [2000, 2000, 2200, 2860]),
  P("Für die Vorbereitung gibt die Anleitung J = 0,37451404 kg·m² vor. Der Wert ist um etwa 0,9 % größer als der der Stahlscheibe allein, er enthält also vermutlich den Läufer. Die Reibungsverluste (≈ 0,02 Nm) werden vernachlässigt bzw. als konstantes Lastmoment berücksichtigt."),
);

// ---------------- 4 Vorbereitung
const hl = texZeilen("tabelle_hochlauf.tex");
add(
  H1("4 Vorbereitung: Berechnung der Hochlaufzeit"),
  P("Grundlage ist die Drehmoment-Drehzahl-Kennlinie des Herstellers bei 400 V (Dreieck). Die Werte wurden aus dem Diagramm der Versuchsanleitung abgelesen (Schrittweite 50 min^{−1}, im Bereich nach dem Kippmoment feiner). Für den Sternbetrieb wird das Moment nach Gl. (2) auf ein Drittel umgerechnet (Abbildung 1)."),
  BILD("v_kennlinie", "Motormoment über der Drehzahl im Dreieck (400 V) und im Stern (230 V am Strang) sowie das Lastmoment durch Lagerreibung", 14.5),
  P("Die Zeit für jeden Drehzahlschritt folgt aus Gl. (4). Als Moment wird der Mittelwert an den Intervallgrenzen verwendet, abzüglich des Reibmoments. Beispiel für den ersten Schritt (0 … 50 min^{−1}, Moment am Intervallanfang wie in der Anleitung):"),
  EQ([mr("Δt="), frac([mr("2π·0,3745 kg"), mr("m²·"), frac([mr("50")], [mr("60")]), mr(" 1/s")], [mr("46 Nm")]), mr(`≈${W.dtBsp} ms`)], false),
  P("Die Summe aller Zeitschritte ergibt den Hochlaufverlauf n(t) (Tabelle 3, Abbildung 2). Da das Motormoment kurz vor der synchronen Drehzahl gegen null geht, wird die Integration bei 1480 min^{−1} beendet."),
  TABELLE("Numerische Integration der Hochlaufzeit (J = 0,3745 kg·m², M: Intervallmittelwert abzüglich Reibmoment)",
    ["n-Intervall in min^{−1}", "*M*_{Δ} in Nm", "*M*_{Y} in Nm", "Δ*t*_{Δ} in ms", "*t*_{Δ} in s", "Δ*t*_{Y} in ms", "*t*_{Y} in s"],
    hl, [1730, 1220, 1220, 1220, 1220, 1240, 1220], { size: 17, zentriert: true }),
  BILD("v_hochlauf", "Berechneter Hochlauf (nicht normiert) für Dreieck- und Sternbetrieb", 14.5),
  TABELLE("Berechnete Hochlaufzeiten",
    ["Schaltung", "bis 1400 min^{−1}", "bis 1450 min^{−1}", "bis 1480 min^{−1}"],
    [["Dreieck (400 V)", `${W.tHDA} s`, `${W.tHDB} s`, `${W.tHDC} s`], ["Stern (230 V)", `${W.tHYA} s`, `${W.tHYB} s`, `${W.tHYC} s`]],
    [2770, 2100, 2100, 2100]),
  P("Im Stern ist das Moment auf ein Drittel reduziert. Die Hochlaufzeit verlängert sich deshalb genau um den Faktor drei. **Umschaltzeitpunkt:** Die Maschine sollte im Stern bis knapp unter die Nenndrehzahl hochlaufen. Nach der Rechnung ist das nach etwa 3,6 … 3,9 s der Fall (1400 … 1450 min^{−1})."),
);

// ---------------- 5 Anlauf
add(
  H1("5 Messergebnisse und Auswertung: Anlaufverfahren"),
  P("Gemessen wurden Drehzahl, Effektivwerte von Spannung und Strom sowie Wirk- und Blindleistung. In allen Diagrammen ist t = 0 der Einschaltzeitpunkt. Die grau hinterlegten Bereiche markieren die stromlose Umschaltpause von Stern auf Dreieck."),
  H2("5.1 Direkter Dreieckanlauf"),
  BILD("a_direkt", "Direkter Dreieckanlauf: Drehzahl, Strom, Spannung und Leistungen", 14),
  P(`Beim Einschalten springt der Strom auf ${W.direktIeins} A, das sind etwa das ${W.direktIN}-fache des Bemessungsstroms. Dieser Wert bleibt bis etwa 1000 min^{−1} nahezu konstant und fällt erst nach dem Kippmoment auf den Leerlaufstrom von ${W.direktIend} A. Die Netzspannung bricht während des Hochlaufs von ${W.direktUnull} V auf ${W.direktUeins} V ein (${W.direktdU} %). Die Blindleistung ist mit ${W.direktQeins} var rund dreimal so groß wie die Wirkleistung (${W.direktPeins} W), daraus folgt cos φ ≈ 0,30. Nach ${W.direkttneunacht} s sind 98 % der Enddrehzahl (${W.direktnend} min^{−1}) erreicht.`),
  H2("5.2 Stern-Dreieck-Anlauf, zu früh umgeschaltet"),
  BILD("a_frueh", "Stern-Dreieck-Anlauf mit zu früher Umschaltung", 14),
  P(`Im Stern beträgt der Anlaufstrom nur ${W.fruehIeins} A, also etwa ein Drittel des Direktanlaufs. Die Spannung bricht nur um ${W.fruehdU} % ein. Die Maschine beschleunigt deutlich langsamer. Umgeschaltet wurde laut Messdaten nach ${W.fruehtum} s bei erst ${W.fruehnum} min^{−1} (also etwa bei der halben Synchrondrehzahl). Die Umschaltpause dauerte ${W.fruehpause} s. Nach dem Umschalten entsteht ein zweiter Stromstoß von ${W.fruehIzwei} A mit einem Spannungseinbruch auf ${W.fruehUzwei} V (${W.fruehdUzwei} %). Strom und Spannungseinbruch sind damit fast so groß wie beim direkten Dreieckanlauf. Die Maschine läuft danach wie beim Direktanlauf mit hohem Strom weiter hoch, bis sie nach insgesamt ${W.fruehtneunacht} s die Enddrehzahl erreicht. Der Vorteil des Stern-Dreieck-Anlaufs geht durch das zu frühe Umschalten weitgehend verloren.`),
  H2("5.3 Stern-Dreieck-Anlauf, richtig umgeschaltet"),
  BILD("a_richtig", "Stern-Dreieck-Anlauf mit Umschaltung zum berechneten Zeitpunkt", 14),
  P(`Die Maschine läuft im Stern bis ${W.richtignum} min^{−1} hoch (Umschaltung nach ${W.richtigtum} s). Dieser Zeitpunkt stimmt gut mit der Rechnung überein (Tabelle 4). Der Strom ist zu diesem Zeitpunkt bereits auf etwa 2,5 A abgesunken. Der Umschaltstromstoß ist mit ${W.richtigIzwei} A nur sehr kurz (ein bis zwei Messwerte, ca. 20 ms), da die Maschine schon nahe der Nenndrehzahl ist. Der Spannungseinbruch beim Umschalten beträgt nur ${W.richtigdUzwei} %. Die Spitze entsteht vor allem durch das Wiederzuschalten auf die noch magnetisierte Maschine (Ausgleichsvorgang) und nicht durch einen erneuten Hochlauf.`),
  H2("5.4 Stern-Dreieck-Anlauf, falsch verdrahtet"),
  BILD("a_falsch", "Stern-Dreieck-Anlauf mit falsch verdrahteter Dreieckschaltung", 14),
  P(`Hochlauf im Stern und Umschaltzeitpunkt (${W.falschtum} s, ${W.falschnum} min^{−1}) entsprechen der richtigen Umschaltung. Der Umschaltstromstoß ist mit ${W.falschIzwei} A jedoch rund 20 % größer, und die Wirkleistungsspitze ist mit ${W.falschPzwei} W fast doppelt so hoch wie bei richtiger Verdrahtung (${W.richtigPzwei} W). Außerdem fällt die Drehzahl nach dem Umschalten kurz um ca. 30 min^{−1} ab (richtig verdrahtet: ca. 10 min^{−1}). Die Maschine wird beim Umschalten also kurz abgebremst.`),
  P("Erklärung: Beim Umschalten springen die Strangspannungen um 30°. Die Richtung dieses Phasensprungs hängt davon ab, wie die Wicklungsenden U2, V2, W2 im Dreieck an die Außenleiter angeschlossen sind. Während der kurzen Umschaltpause ist der Läufer noch magnetisiert und induziert eine Restspannung, die der Netzspannung nacheilt. Bei richtiger Zuordnung ist die Phasendifferenz zwischen Netzspannung und Restspannung klein. Bei vertauschter Zuordnung ist sie größer, daher entstehen ein größerer Ausgleichsstrom und ein kurzes Bremsmoment (Drehzahleinbruch)."),
  H2("5.5 Vergleich der Anlaufverfahren"),
  BILD("a_vergleich_n", "Gemessene Drehzahlverläufe im Vergleich mit der Rechnung aus der Vorbereitung", 14.5),
  BILD("a_vergleich_I", "Stromverläufe der Anlaufverfahren im Vergleich", 14.5),
  TABELLE("Kennwerte der Anlaufverfahren (*I*_{1}, *U*_{1}: Einschaltmoment; *I*_{2}, *U*_{2}: nach dem Umschalten; *t*_{98}: Zeit bis 98 % der Enddrehzahl; E: aufgenommene Wirkenergie bis *t*_{98})",
    ["Verfahren", "*I*_{1} in A", "*U*_{1} in V", "*t*_{um} in s / *n*_{um} in min^{−1}", "*I*_{2} in A", "*U*_{2} in V", "*t*_{98} in s", "E in kJ"],
    [["Direkt Dreieck", W.direktIeins, W.direktUeins, "–", "–", "–", W.direkttneunacht, "14,5"],
     ["Y-Δ zu früh", W.fruehIeins, W.fruehUeins, `${W.fruehtum} / ${W.fruehnum}`, W.fruehIzwei, W.fruehUzwei, W.fruehtneunacht, "15,4"],
     ["Y-Δ richtig", W.richtigIeins, W.richtigUeins, `${W.richtigtum} / ${W.richtignum}`, W.richtigIzwei, W.richtigUzwei, W.richtigtneunacht, "15,8"],
     ["Y-Δ falsch verdrahtet", W.falschIeins, W.falschUeins, `${W.falschtum} / ${W.falschnum}`, W.falschIzwei, W.falschUzwei, W.falschtneunacht, "15,8"]],
    [1930, 880, 880, 1700, 880, 880, 1000, 900], { size: 17 }),
  P(`Bei allen Verfahren liegt die Netzspannung vor dem Einschalten bei ${W.direktUnull} V. Im stationären Leerlauf nimmt die Maschine etwa ${W.richtigIend} A, ${W.richtigPend} W und ${W.richtigQend} var auf. Das Verhältnis der Anlaufströme Dreieck/Stern beträgt ${W.direktIeins}/${W.richtigIeins} ≈ 3,3 und bestätigt damit Gl. (2).`),
  P("Die aufgenommene Wirkenergie ist bei allen Verfahren ähnlich. In der Schwungmasse sind am Ende nur *E*_{kin} = ½ J ω² ≈ 4,6 kJ gespeichert. Beim Hochlauf einer ASM entsteht im Läufer zusätzlich eine Verlustenergie in derselben Größe wie *E*_{kin}. Dazu kommen Ständer- und Eisenverluste. Der Stern-Dreieck-Anlauf senkt also die Strom*spitzen*, aber nicht die Energie, die während des Hochlaufs umgesetzt wird."),
  ANTWORT("Frage: Wodurch entsteht der Spannungseinbruch in den Schaltmomenten, und wie kann er verringert werden?", [
    P(`Der hohe, überwiegend induktive Einschaltstrom (cos φ ≈ 0,3) fließt über die Kurzschlussimpedanz von Transformator und Zuleitungen. Nach Gl. (1) liegt der Spannungsabfall an *X*_{k} dann nahezu in Phase mit der Netzspannung. Die Spannung an den Motorklemmen sinkt daher deutlich: beim Direktanlauf um ${W.direktdU} %, bei zu frühem Umschalten um ${W.fruehdUzwei} %, im Stern nur um ${W.richtigdU} %. Die kurzen Spannungsspitzen nach unten direkt beim Schalten entstehen zusätzlich durch Ausgleichsvorgänge (Gleichanteile im Strom, Kontaktprellen).`),
    P("**Maßnahmen:** kleinerer Anlaufstrom durch Stern-Dreieck-Anlauf mit *richtigem* Umschaltzeitpunkt und richtiger Verdrahtung, Sanftanlasser (Drehstromsteller), Frequenzumrichter, Anlasstransformator, bei Schleifringläufern Anlasswiderstände. Auf der Netzseite helfen ein leistungsstärkerer Transformator mit kleiner Kurzschlussspannung *u*_{k}, größere Leiterquerschnitte und kürzere Leitungen (kleineres *Z*_{k}) sowie Blindleistungskompensation."),
  ]),
  H2("5.6 Vergleich berechnete und gemessene Hochlaufzeit"),
  TABELLE("Vergleich der Hochlaufzeiten (Zeit bis 1450 min^{−1})",
    ["Schaltung", "berechnet", "gemessen", "Abweichung"],
    [["Dreieck (direkt)", `${W.tHDB} s`, `${W.direktteinsvierfuenfnull} s`, "ca. −15 %"],
     ["Stern (bis zur Umschaltung bei ca. 1443 min^{−1})", `${W.tHYum} s`, `${W.richtigtum} s`, "ca. −7 %"]],
    [4270, 1600, 1600, 1600]),
  ANTWORT("Frage: Vergleich der berechneten mit der gemessenen Hochlaufzeit", [
    P("Die gemessenen Hochlaufzeiten sind etwas kürzer als die berechneten (Dreieck ca. 15 %, Stern ca. 7 %). Die Rechnung gibt den Verlauf aber gut wieder (Abbildung 7): Sattel bei niedriger Drehzahl, größte Beschleunigung im Bereich des Kippmoments, starkes Abflachen kurz vor der synchronen Drehzahl. Gründe für die Abweichung:"),
    LI("Die Herstellerkennlinie ist ein typischer bzw. garantierter Mindestverlauf, die reale Maschine hat im Versuch ein größeres Moment (siehe Abschnitt 5.7)."),
    LI("Die Netzspannung lag bei 405 V statt 400 V (+2,5 % Moment)."),
    LI("Die Kennlinie wurde aus einem Diagramm abgelesen (Ablesefehler)."),
    LI("Die Anleitung gibt mit 0,3745 kg·m² ein etwas größeres J vor."),
    LI("Die Rechnung endet bei einer festen Enddrehzahl. Wo genau „Hochlauf beendet“ ist, lässt sich kurz vor der Synchrondrehzahl schwer festlegen."),
    P(`Für die Wahl des Umschaltzeitpunkts ist die Rechnung gut geeignet. Die zu frühe Umschaltung nach ${W.fruehtum} s lag deutlich unter der berechneten Zeit von ca. 3,6 s.`),
  ]),
  H2("5.7 Beschleunigungsmoment aus der Drehzahländerung"),
  P("Aus dem gemessenen Drehzahlverlauf wird mit der Bewegungsgleichung das Beschleunigungsmoment berechnet:"),
  EQ([sub("M", "B"), mr("(t)="), sub("J", "Stahl"), mr("·2π·"), frac([mr("dn")], [mr("dt")]), mr(`,     `), sub("J", "Stahl"), mr(`=½·32,99 kg·(0,15 m)²=${W.JStahl} kg`), mr("m²")]),
  P("Da das Drehzahlsignal verrauscht ist, wurde es vor dem Ableiten mit einem Savitzky-Golay-Filter (15 Werte ≙ 150 ms, Polynomgrad 2) geglättet."),
  BILD("a_moment", "Beschleunigungsmoment aus der gemessenen Drehzahländerung, links über der Zeit, rechts über der Drehzahl im Vergleich mit der Kennlinie aus der Vorbereitung", 15.5),
  P("Das gemessene Moment zeigt die typische Form der ASM-Kennlinie: Anzugsmoment, Sattelmoment bei ca. 200 min^{−1}, Kippmoment bei ca. 1000 min^{−1}, danach starker Abfall bis zur Leerlaufdrehzahl. Im Bereich 200 … 1000 min^{−1} beträgt das mittlere Beschleunigungsmoment"),
  LI(`im Dreieck ${W.direktMBmittel} Nm (Kennlinie: ${W.MkennDmittel} Nm) und`),
  LI(`im Stern ${W.richtigMBmittel} Nm (Kennlinie: ${W.MkennYmittel} Nm).`),
  P("Im Stern stimmen Messung und Kennlinie gut überein. Im Dreieck liegt das gemessene Moment um etwa 8 % über der Kennlinie, besonders im Kippbereich (ca. 62 Nm gegenüber 56 Nm). Das erklärt die kürzere gemessene Hochlaufzeit. Das Kippmoment beträgt etwa das Dreifache des Bemessungsmoments. Beim Umschalten (Stern-Dreieck) ist die kurze Momentenspitze zu sehen."),
);

// ---------------- 6 Bremsen
const br = texZeilen("tabelle_bremsen.tex");
add(
  H1("6 Messergebnisse und Auswertung: Bremsverfahren"),
  P("Die Bremsversuche wurden an der umrichtergespeisten ASM mit Aluminium-Schwungscheibe bei einer Ausgangsdrehzahl von ca. 1800 min^{−1} (60 Hz) durchgeführt. t = 0 ist jeweils der Bremsbefehl. Die kinetische Energie der Schwungscheibe beträgt"),
  EQ([sub("E", "kin"), mr("=½"), sub("J", "Alu"), mr("ω²"), mr(`=½·${W.JAlu} kg`), mr("m²·(2π·30 1/s)²"), mr(`≈${W.Ekin} J`)], false),
  P("Das Bremsmoment wird analog zu Abschnitt 5.7 berechnet: *M*_{Br} = −*J*_{Alu} · 2π · dn/dt (Läuferträgheit vernachlässigt)."),
  H2("6.1 Drehzahlverläufe im Überblick"),
  BILD("b_vergleich_n", "Drehzahlverläufe aller Bremsverfahren", 15),
  TABELLE("Kennwerte der Bremsverfahren (*t*_{B}: Zeit vom Bremsbefehl bis n < 10 min^{−1}; ā: mittlere Verzögerung; M̄: mittleres Bremsmoment während der wirksamen Bremsphase; *E*_{RB}: Energie im Bremswiderstand)",
    ["Verfahren", "*t*_{B} in s", "ā in min^{−1}/s", "M̄ in Nm", "*M*_{max} in Nm", "*U*_{ZK,max} in V", "*E*_{RB} in J"],
    br.map((z) => z.map((c) => c.replace("Generat.", "Generatorisch"))),
    [2770, 900, 1100, 1000, 1100, 1200, 1000], { size: 17 }),
  H2("6.2 Federkraftbremse"),
  BILD("b_feder", "Federkraftbremse (zwei Messungen)", 14),
  P(`Beim Bremsbefehl werden der Umrichter und die Bremsspule gleichzeitig abgeschaltet. Nach einer Einfallzeit von ca. ${W.federts} s (Abbau des Magnetfelds der Lüftspule, Weg der Ankerscheibe) setzt die Bremse ein. Die Drehzahl nimmt danach *linear* ab, das Bremsmoment ist also nahezu konstant (Coulomb'sche Reibung, unabhängig von der Drehzahl). Es beträgt ca. ${W.federMmit} Nm, das ist etwa das 1,5-fache Bemessungsmoment. Die Maschine steht nach ${W.federtB} s. Die Wiederholungsmessung bestätigt das Ergebnis (${W.federnulltB} s, ${W.federnullMmit} Nm). Die Klemmenspannung zeigt nur noch die abklingende Restspannung des Läufers.`),
  H2("6.3 Gleichstrombremsung (DC-Bremse)"),
  BILD("b_dc", "Gleichstrombremsung mit drei verschiedenen Bremsströmen", 14),
  P("Nach dem Bremsbefehl sperrt der Umrichter zunächst die Pulse. Die Maschine trudelt ca. 1 s aus, bis die Restspannung des Läufers abgeklungen ist (Entmagnetisierungszeit). Erst dann wird der Gleichstrom eingespeist (ab t ≈ 1,03 s). Gemessen wurden:"),
  TABELLE("Ergebnisse der Gleichstrombremsung",
    ["Einstellung", "*I*_{DC}", "Bremsdauer ab DC-Einspeisung", "M̄", "M̄ / M̄_{klein}"],
    [["kleiner Strom", `${W.dclIdcB} A`, `${W.dcltnachI} s`, `${W.dclMmit} Nm`, "1,0"],
     ["mittlerer Strom", `${W.dcmIdcB} A`, `${W.dcmtnachI} s`, `${W.dcmMmit} Nm`, "2,1"],
     ["großer Strom", `${W.dcsIdcB} A`, `${W.dcstnachI} s`, `${W.dcsMmit} Nm`, "5,5"]],
    [2070, 1500, 2500, 1500, 1500]),
  P("Das mittlere Bremsmoment wächst quadratisch mit dem Gleichstrom: (20,5/14,1)² = 2,1 und (32,8/14,1)² = 5,4, das stimmt mit den gemessenen Verhältnissen überein. Über den Bremsstrom lässt sich die Bremszeit also gezielt einstellen. Das Bremsmoment ist bei hoher Drehzahl klein und *steigt zu kleinen Drehzahlen hin stark an* (Abbildung 18). Die Drehzahlkurve wird deshalb zum Ende hin immer steiler. Der Grund: Die Läuferfrequenz entspricht bei der DC-Bremse der Drehzahl. Bei niedriger Drehzahl ist die Läuferreaktanz klein und der Läuferstrom liegt besser in Phase mit dem Feld. Das Momentenmaximum liegt daher bei kleiner Drehzahl (ähnlich wie ein Kippmoment). Im Stillstand fällt das Moment auf null. Ein Haltemoment gibt es nicht: Beim großen Strom schwingt die Drehzahl am Ende sogar kurz ins Negative. Die gesamte kinetische Energie und zusätzlich die Stromwärme *I*_{DC}² R werden *im Motor* in Wärme umgesetzt. Die Zwischenkreisspannung bleibt unverändert bei ca. 580 V."),
  H2("6.4 Generatorisches Bremsen ohne Bremswiderstand"),
  BILD("b_gen0", "Generatorisches Bremsen ohne Bremswiderstand: Drehzahl, Zwischenkreisspannung und Motorstrom", 14),
  P(`Sobald der Umrichter die Frequenz absenkt, speist die Maschine Energie in den Zwischenkreis zurück. *U*_{ZK} steigt von 580 V auf bis zu ${W.genohneUzkmax} V. Ab ca. 790 V sperrt der Umrichter die Pulse (Überspannungsschutz bzw. Überspannungsregler). Der Motorstrom ist deshalb die meiste Zeit null, und die Maschine trudelt fast ungebremst. Erst wenn *U*_{ZK} über die Entladewiderstände bzw. die Eigenverluste wieder gesunken ist, folgt der nächste kurze Bremsimpuls. Der Drehzahlverlauf ist daher stufenförmig, und die Bremszeit verlängert sich auf ${W.genohnetB} s (mittleres Bremsmoment nur ${W.genohneMmit} Nm).`),
  H2("6.5 Generatorisches Bremsen mit Bremswiderstand"),
  BILD("b_gen", "Generatorisches Bremsen mit Bremswiderstand bei drei Rampenzeiten", 14),
  P(`Mit Bremswiderstand begrenzt der Brems-Chopper die Zwischenkreisspannung auf ca. 715 … 724 V. Die Maschine folgt der eingestellten Rampe genau: Die Drehzahl nimmt linear ab und das Bremsmoment ist konstant (langsam: ${W.genltB} s, ${W.genlMmit} Nm; mittel: ${W.genmtB} s, ${W.genmMmit} Nm; schnell: ${W.genstB} s, ${W.gensMmit} Nm). Bei der langsamen Rampe decken die Verluste in Motor und Umrichter einen großen Teil der Bremsleistung, der Chopper schaltet nur selten (*E*_{RB} = ${W.genlErb} J). Bei der schnellen Rampe nimmt der Widerstand Spitzenleistungen bis ${W.PRbmax} W auf. Aus Zwischenkreisspannung, Effektiv- und Mittelwert des Widerstandsstroms ergibt sich ein Bremswiderstand von ca. *R*_{B} ≈ ${W.Rb} Ω.`),
  P(`**Energiebilanz (schnell):** Im Bremswiderstand werden *E*_{RB} = ∫ *P*_{RB} dt ≈ ${W.gensErb} J umgesetzt, das sind ca. ${W.gensErbAnteil} % der kinetischen Energie der Scheibe (${W.Ekin} J). Den Rest decken die Verluste in Motor und Umrichter sowie die Reibung. Der Läufer selbst speichert ebenfalls Energie, die hier nicht berücksichtigt ist.`),
  H2("6.6 Bremsmomente"),
  BILD("b_moment", `Bremsmoment aus der gemessenen Drehzahländerung (J_{Alu} = ${W.JAlu} kg·m²), oben: Federkraft- und DC-Bremse, unten: generatorisches Bremsen`, 15, "bm"),
  BILD("b_moment_zoom", "Bremsmomente der drei schnellsten Verfahren im Vergleich", 15),
  P("Die Verläufe zeigen die Eigenschaften der Verfahren deutlich: Federkraftbremse und generatorisches Bremsen mit Rampe haben ein nahezu konstantes Moment. Bei der DC-Bremse steigt das Moment zum Stillstand hin an. Beim generatorischen Bremsen ohne Widerstand treten nur einzelne Momentimpulse auf. Die Spitzen am Anfang und am Ende einer Bremsung entstehen teilweise durch die Glättung der Drehzahl beim Ableiten."),
  ANTWORT("Frage: Warum gibt es so große Unterschiede in der Verzögerungszeit beim generatorischen Bremsen mit und ohne Bremswiderstand?", [
    P(`Beim generatorischen Bremsen fließt die kinetische Energie über den Wechselrichter in den Zwischenkreis. Der Eingangsgleichrichter des Umrichters ist ein ungesteuerter Diodengleichrichter und kann keine Energie ins Netz zurückspeisen. Ohne Bremswiderstand kann die Energie nur den Zwischenkreiskondensator aufladen (E = ½ C U²). Das reicht nur für einen kleinen Teil der rund 2,3 kJ. *U*_{ZK} erreicht nach kurzer Zeit die Überspannungsgrenze (gemessen: ${W.genohneUzkmax} V). Der Umrichter sperrt die Pulse oder verlängert die Rampe. Die Maschine trudelt dann fast ungebremst, und die Bremszeit steigt auf ${W.genohnetB} s.`),
    P(`Mit Bremswiderstand schaltet der Brems-Chopper ab ca. 720 V den Widerstand zu und wandelt die Energie in Wärme um. *U*_{ZK} bleibt begrenzt, der Umrichter kann das volle Bremsmoment aufbringen und die Rampe einhalten (${W.genstB} s bei schneller Rampe). Alternativ könnte ein rückspeisefähiger Umrichter (Active Front End) die Energie ins Netz zurückgeben.`),
  ]),
  ANTWORT("Frage: Welches Verfahren kann als Not-Halt verwendet werden?", [
    P("Als Not-Halt ist nur die **Federkraftbremse** uneingeschränkt geeignet:"),
    LI("Sie arbeitet nach dem *Ruhestromprinzip*. Bei Netzausfall, Not-Aus, Kabelbruch oder Umrichterfehler fällt sie selbstständig ein (ausfallsicher)."),
    LI("Sie braucht keine Energie und keine funktionierende Elektronik."),
    LI(`Sie bremst mit konstantem, hohem Moment (${W.federMmit} Nm, Stillstand nach ${W.federtB} s) und *hält* die Last im Stillstand (wichtig z. B. bei Hubwerken).`),
    P("DC-Bremse und generatorisches Bremsen hängen vom Netz und vom fehlerfreien Umrichter ab. Bei Netzausfall wirken sie nicht. Die DC-Bremse hat außerdem kein Haltemoment, und ohne Bremswiderstand ist das generatorische Bremsen sehr langsam. Das generatorische Bremsen mit Bremswiderstand ist zwar ähnlich schnell, aber nicht ausfallsicher. In der Praxis kombiniert man die Verfahren (Stopp-Kategorie 1 nach EN 60204-1): Zuerst wird gesteuert generatorisch gebremst, danach fällt die mechanische Bremse ein und die Energie wird abgeschaltet."),
  ]),
);

// ---------------- 7–9
add(
  H1("7 Zusammenfassung"),
  LI(`Der **direkte Dreieckanlauf** ist am schnellsten (${W.direkttneunacht} s), belastet das Netz aber mit dem ${W.direktIN}-fachen Bemessungsstrom und einem Spannungseinbruch von ${W.direktdU} %.`),
  LI(`Der **Stern-Dreieck-Anlauf** senkt Anlaufstrom und Moment auf ein Drittel. Er bringt nur Vorteile, wenn erst nahe der Nenndrehzahl umgeschaltet wird. Bei zu früher Umschaltung (${W.fruehnum} min^{−1}) entsteht ein zweiter Stromstoß von ${W.fruehIzwei} A. Eine falsche Verdrahtung vergrößert den Umschaltstoß und bremst die Maschine kurz ab.`),
  LI("Die **berechnete Hochlaufzeit** stimmt in Verlauf und Größenordnung mit der Messung überein. Die Messung ist 7 … 15 % schneller, weil die reale Maschine ein größeres Moment hat."),
  LI("Die **Federkraftbremse** bremst schnell mit konstantem Moment, ist ausfallsicher und daher für den Not-Halt geeignet."),
  LI("Bei der **DC-Bremse** wächst das Bremsmoment mit *I*_{DC}² und steigt zu kleinen Drehzahlen hin an. Es gibt kein Haltemoment, und der Motor wird stark erwärmt."),
  LI(`**Generatorisches Bremsen** braucht einen Bremswiderstand (oder Rückspeisung). Ohne ihn begrenzt die Zwischenkreis-Überspannung die Bremsung (${W.genohnetB} s statt ${W.genstB} s).`),
  H1("8 Risikobewertung"),
  LI("Die rotierende Schwungmasse ist eine mechanische Gefahr. Getragen wird nur eng anliegende Kleidung, lange Haare werden zusammengebunden oder bedeckt."),
  LI("Durch den Messaufbau besteht die Gefahr eines elektrischen Schlags. Der Aufbau war vorverdrahtet und wurde nur vom Laborbetreuer bedient. Der Versuch wurde über einen Trenntransformator (galvanische Trennung) betrieben."),
  LI("Bremswiderstand und Motor können sich bei häufigem Bremsen stark erwärmen (Verbrennungsgefahr)."),
  H1("Quellen"),
  NUM("Ostfalia Hochschule, Labor für elektrische Antriebe: Versuchsanleitung V9 „Anlauf- und Bremsverfahren“, Version 0.9, 08.10.2026.", "quellen"),
  NUM("Siemens AG: Aufbau Federkraftbremse, Bilddatenbank, https://www.automation.siemens.com/bilddb, Abruf 24.09.2024.", "quellen"),
  NUM("Lenze SE: Produktinformation Gleichstrombremsung, https://www.lenze.com, Abruf 24.09.2024.", "quellen"),
  NUM("K.-D. Tieste: Skript „Elektrische Antriebe“, Ostfalia Hochschule, WS 2024/25.", "quellen"),
  H1("Anhang: Hinweise zur Auswertung"),
  P("Alle Diagramme und Kennwerte wurden mit dem Python-Skript auswertung/auswertung.py aus den Original-CSV-Dateien erzeugt (NumPy, SciPy, Matplotlib). Die Momente wurden aus der mit einem Savitzky-Golay-Filter geglätteten Drehzahl abgeleitet. Die Leistungsmessgeräte liefern 10-ms-Effektivwerte. Sehr kurze Stromspitzen (z. B. die Einschaltspitze) werden dadurch teilweise unterschätzt."),
);

// ================================================================== Dokument
const doc = new Document({
  creator: "Laborgruppe",
  title: "Laborbericht Versuch 9: Anlauf- und Bremsverfahren",
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: "Calibri", size: 22 }, paragraph: { spacing: { after: 100, line: 276, lineRule: LineRuleType.AUTO } } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: "Calibri", size: 30, bold: true, color: "1F3F7A" },
        paragraph: { spacing: { before: 360, after: 160 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: "Calibri", size: 25, bold: true, color: "1F3F7A" },
        paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: "punkte", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 283 } } } }] },
      { reference: "zahlen", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 340 } } } }] },
      { reference: "quellen", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "[%1]", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 567 } } } }] },
    ],
  },
  sections: [{
    properties: {
      titlePage: true,
      page: { size: { width: 11906, height: 16838 }, margin: { top: 1418, bottom: 1300, left: 1418, right: 1418 } },
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 9070 }],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "808080", space: 2 } },
        children: [new TextRun({ text: "Labor für elektrische Antriebe", size: 18 }), new TextRun({ text: "\tVersuch 9: Anlauf- und Bremsverfahren", size: 18 })],
      })] }),
      first: new Header({ children: [new Paragraph({ children: [] })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 9070 }],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: "808080", space: 2 } },
        children: [new TextRun({ text: "Laborbericht", size: 18 }), new TextRun({ children: ["\tSeite ", PageNumber.CURRENT], size: 18 })],
      })] }),
      first: new Footer({ children: [new Paragraph({ children: [] })] }),
    },
    children: inhalt,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(path.join(DIR, "bericht.docx"), buf);
  console.log("bericht.docx geschrieben,", abbNr, "Abbildungen,", tabNr, "Tabellen");
});
