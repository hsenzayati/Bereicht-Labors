"""Öffnet bericht.docx in LibreOffice, füllt das Inhaltsverzeichnis mit Seitenzahlen und speichert als .docx.
Aufruf: python3 toc_aktualisieren.py bericht.docx bericht.docx"""
import subprocess, sys, time, uno
from com.sun.star.beans import PropertyValue

ein, aus = sys.argv[1], sys.argv[2]
p = subprocess.Popen(["soffice", "--headless", "--invisible", "--norestore",
                      "--accept=socket,host=localhost,port=2099;urp;"])
try:
    ctx = None
    lc = uno.getComponentContext()
    res = lc.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", lc)
    for _ in range(60):
        try:
            ctx = res.resolve("uno:socket,host=localhost,port=2099;urp;StarOffice.ComponentContext"); break
        except Exception:
            time.sleep(0.5)
    desk = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)
    h = PropertyValue(); h.Name = "Hidden"; h.Value = True
    doc = desk.loadComponentFromURL(uno.systemPathToFileUrl(ein), "_blank", 0, (h,))
    idx = doc.getDocumentIndexes()
    for i in range(idx.getCount()):
        idx.getByIndex(i).update()
    doc.refresh()
    f = PropertyValue(); f.Name = "FilterName"; f.Value = "MS Word 2007 XML"
    doc.storeToURL(uno.systemPathToFileUrl(aus), (f,))
    doc.close(True)
finally:
    p.terminate()
