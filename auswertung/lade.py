import numpy as np
from pathlib import Path
D = Path(__file__).resolve().parent.parent / "daten"
def lade(name):
    rows=[]
    for i,l in enumerate(open(D/name,encoding="latin-1")):
        if i==0 or not l.strip(): continue
        rows.append([float(x.replace(",",".")) for x in l.strip().strip(";").split(";")])
    n=min(len(r) for r in rows)
    return np.array([r[:n] for r in rows])
