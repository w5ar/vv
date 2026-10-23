#!/usr/bin/env python3
"""Skice 68–77 za Vježbu 13 (pjena i „C” mlaz), Vježbu 14 (pjena, izolacijski aparati)
i Vježbu 15 (natjecateljska vježba).

Pokretanje (iz mape Vjezbe):   python3 alati/skice_vjezbe_13_15.py
"""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from vatrogasni_simboli import Skica, mlaz  # noqa: E402
from skice_vjezbe_01_02 import razdjelnica, RAZ_LIJEVI, RAZ_SREDNJI, RAZ_DESNI  # noqa: E402

NV_SIRINA = 150          # navalno vozilo u skicama ovih vježbi
NV_VISINA = NV_SIRINA / 2


def _osobe_na_mlazu(s, m, prvi, drugi, kut, ia=False):
    """Vođa i član grupe na kraju položenog mlaza (kao u skicama 13/14)."""
    (vx, vy), (lx, ly), (rx, ry), (ux, uy) = m["vrh"], m["lijevo"], m["desno"], m["smjer"]
    s.osoba(prvi, vx + lx * 34 - ux * 16, vy + ly * 34 - uy * 16, smjer=kut, ia=ia)
    bx, by = m["luk_kraj"]
    s.osoba(drugi, bx + rx * 40 + ux * 30, by + ry * 40 + uy * 30, smjer=kut, ia=ia)


def _nv_i_b_vod(s, nvx, nvy, yv, x_kraj, spojnice=(0.5,)):
    """Navalno vozilo, strojar i „B” vod od tlačnog izlaza vozila do x_kraj."""
    s.simbol("navalno-vozilo", nvx, nvy, sirina=NV_SIRINA)
    x0 = nvx - NV_SIRINA / 2 + 30
    y0 = nvy + NV_VISINA / 2
    s.vod([("M", x0, y0), ("Q", x0, yv, x0 + 30, yv), ("L", x_kraj, yv)], tip="B", spojnice=spojnice)
    s.osoba("strojar", x0 - 55, yv + 5, smjer="desno")


def _hidrant_do_nv(s, hx, hy, nvx, nvy):
    """Hidrant s nastavkom i „B” vod od hidranta do usisa vozila (skice 69, 70, 72, 73)."""
    x0, y0 = s.hidrant_s_nastavkom(hx, hy)
    xl = nvx - NV_SIRINA / 2
    s.vod([("M", x0, y0), ("C", x0 + 2, y0 + 40, x0 + 60, nvy + 25, xl, nvy + 22)], tip="B")


def _mlaz_pjene(s, x_izlaz, yv, ia=False):
    """Prvi mlaz pjenom sa srednjeg izlaza razdjelnice: „C” cijev – međumješalica s
    posudom za pjenilo – „C” cijev u luku – mlaznica za pjenu. Vraća x međumješalice."""
    xm = x_izlaz + 108                       # središte međumješalice
    s.vod([("M", x_izlaz, yv), ("L", xm - 40, yv)], tip="C", kraj=True)
    s.simbol("medumjesalica", xm, yv - 2)
    s.simbol("posuda-za-pjenilo", xm - 2, yv - 42)
    x1 = xm + 40
    kraj = s.vod([("M", x1, yv), ("C", x1 + 27, yv - 37, x1 + 47, yv - 32, x1 + 67, yv + 3),
                  ("C", x1 + 87, yv + 43, x1 + 122, yv + 33, x1 + 142, yv + 10),
                  ("L", x1 + 170, yv)], tip="C", pocetak=True)
    s.simbol("mlaznica-za-pjenu", kraj[0] + 33, yv, sirina=66)
    xn = kraj[0] + 20
    s.osoba("n1", xn, yv - 38, smjer="desno", ia=ia)
    s.osoba("n2", xn - 30, yv + 40, smjer="desno", ia=ia)
    return xm


# ---------------------------------------------------------------- „Za navalu pripremi!”
def _skica_za_navalu(put, naslov, ia):
    """Skice 68 (Vježba 13) i 71 (Vježba 14)."""
    s = Skica(1000, 620)
    yv = 350
    s.simbol("podzemni-hidrant", 95, 250)
    _nv_i_b_vod(s, 380, 285, yv, 850, spojnice=(0.5,))
    cx = razdjelnica(s, 850, yv)
    x = cx - 8
    if not ia:                               # Vježba 13: V₁ uz razdjelnicu, stupac N grupe
        s.osoba("v1", 805, yv - 32, smjer="desno")
        stupac = [("k", None), ("n1", None), ("pjena", None), ("k", None), ("n2", None), ("k", None)]
        dolje = ["medj", "v2", "posuda", "z"]
    else:                                    # Vježba 14: N grupa s IA, V grupa u stupcu
        stupac = [("n1", True), ("n2", True), ("k", None), ("pjena", None),
                  ("v1", None), ("k", None), ("v2", None), ("k", None)]
        dolje = ["medj", "z", "posuda"]
    korak = 40 if ia else 38
    y = yv - 30 - korak * (len(stupac) - 1) - 6
    for sid, sa_ia in stupac:
        if sid == "k":
            s.simbol("tlacna-c-cijev-kolut", x, y, sirina=60)
        elif sid == "pjena":
            s.simbol("mlaznica-za-pjenu", x + 4, y, sirina=58)
        else:
            s.osoba(sid, x, y, smjer="desno", ia=bool(sa_ia))
        y += korak
    y = yv + 48
    for sid in dolje:
        if sid == "medj":
            s.simbol("medumjesalica", x, y, sirina=64)
            y += 44
        elif sid == "posuda":
            s.simbol("posuda-za-pjenilo", x, y + 4)
            y += 54
        elif sid == "z":
            s.osoba("zapovjednik", x, y + 6, smjer="desno" if ia else "gore")
            y += 54
        else:
            s.osoba(sid, x, y, smjer="desno")
            y += 50
    s.spremi(put, naslov)


def skica_68(put):
    _skica_za_navalu(put, "Skica 68 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi „Za navalu pripremi!”", ia=False)


def skica_71(put):
    _skica_za_navalu(put, "Skica 71 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi „Za navalu pripremi!”", ia=True)


# ---------------------------------------------------------------- prvi i drugi mlaz
def _skica_mlazevi(put, naslov, ia, drugi):
    """Skice 69/72 (prvi mlaz pjenom) i 70/73 (i drugi mlaz vodom)."""
    s = Skica(1200, 520 if drugi else 340)
    yv = 175
    nvx, nvy = 385, 95
    _hidrant_do_nv(s, 120, 62, nvx, nvy)
    _nv_i_b_vod(s, nvx, nvy, yv, 712, spojnice=(0.48,))
    cx = razdjelnica(s, 712, yv)
    if not drugi:
        s.osoba("v1", 670, yv)               # vođa vodne grupe poslužuje razdjelnicu
        s.osoba("v2", cx + RAZ_SREDNJI[0] + 106, yv + 50, smjer="desno")
        s.simbol("tlacna-c-cijev-kolut", 690, yv + 60, sirina=60)
        s.osoba("zapovjednik", 700, yv + 115, smjer="gore")
    else:
        s.osoba("zapovjednik", 670, yv)      # zapovjednik preuzima razdjelnicu
        s.simbol("tlacna-c-cijev-kolut", 708, yv + 52, sirina=60)
        s.simbol("tlacna-c-cijev-kolut", 708, yv + 72, sirina=60)
    _mlaz_pjene(s, cx + RAZ_SREDNJI[0], yv, ia=ia)
    if drugi:
        m = mlaz(s, (cx + RAZ_DESNI[0], yv + RAZ_DESNI[1]), 40, strana="desno", d1=135)
        _osobe_na_mlazu(s, m, "v1", "v2", 40)
    s.spremi(put, naslov)


def skica_69(put):
    _skica_mlazevi(put, "Skica 69 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za prvi mlaz", False, False)


def skica_70(put):
    _skica_mlazevi(put, "Skica 70 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za drugi mlaz", False, True)


def skica_72(put):
    _skica_mlazevi(put, "Skica 72 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za prvi mlaz", True, False)


def skica_73(put):
    _skica_mlazevi(put, "Skica 73 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za drugi mlaz", True, True)


# ---------------------------------------------------------------- Vježba 15
def skica_74(put):
    s = Skica(1220, 600)
    # odjeljenje u dvije vrste
    gornja = ["c1", "v1", "n1", "strojar", "zapovjednik"]
    donja = ["c2", "v2", "n2", "teklic"]
    for i, sid in enumerate(gornja):
        s.osoba(sid, 50 + i * 50, 290, smjer="gore")
    for i, sid in enumerate(donja):
        s.osoba(sid, 50 + i * 50, 352, smjer="gore")
    # usisne cijevi uz pumpu
    for y in (50, 125, 440, 520):
        s.simbol("usisna-cijev", 560, y, sirina=320)
    # usisna sitka, užad i ključevi
    s.simbol("uze-s-torbicom", 395, 205, rotacija=90)
    s.simbol("uze-s-torbicom", 395, 245, rotacija=90)
    s.simbol("usisna-sitka", 393, 296, sirina=46, rotacija=-90)
    s.simbol("kljuc-za-spojnice", 393, 340, sirina=56, rotacija=180)
    s.simbol("kljuc-za-spojnice", 393, 358, sirina=56, rotacija=180)
    s.simbol("kljuc-za-spojnice", 455, 296, sirina=56, rotacija=90)
    # motorna pumpa s usisnim otvorom
    s.simbol("spojnica-usisna", 482, 296, sirina=12)
    s.simbol("prijenosna-pumpa", 585, 296, sirina=245)
    # oprema za tlačne vodove
    s.simbol("prijelazna-spojnica-bc", 830, 135, sirina=30)
    s.simbol("torbica-s-povezicama", 835, 220, sirina=80, rotacija=90)
    for i in range(3):
        s.simbol("tlacna-b-cijev-kolut", 852, 290 + i * 25, sirina=95)
    s.simbol("cijevni-drzac", 1003, 100, sirina=32)
    s.simbol("cijevni-drzac", 1003, 160, sirina=32)
    s.simbol("obicna-c-mlaznica", 1020, 200, sirina=44)
    s.simbol("obicna-c-mlaznica", 1020, 220, sirina=44)
    for i in range(6):
        s.simbol("tlacna-c-cijev-kolut", 1020, 245 + i * 22, sirina=74)
    s.simbol("trodijelna-razdjelnica", 1150, 308, sirina=80, rotacija=0)
    s.spremi(put, "Skica 74 – Postavljanje sprava i opreme i postrojavanje odjeljenja")


def _usisni_sektor(s, pmx, pmy, x_sitka=50):
    """Usisni vod (sitka + 4 usisne cijevi) spojen na motornu pumpu, s užetom usisnog
    voda i užetom nepovratnog ventila (skice 75–77). Vraća točku tlačnog izlaza pumpe."""
    s.simbol("prijenosna-pumpa", pmx, pmy, sirina=150)
    xu = pmx - 75 - 3                       # usisni otvor pumpe
    s.simbol("spojnica-usisna", xu, pmy, sirina=9)
    y = pmy + 2
    w = xu - x_sitka - 28
    seg = [("M", x_sitka + 22, y - 18),
           ("C", x_sitka + 22 + w * 0.15, y + 10, x_sitka + 22 + w * 0.30, y + 6, x_sitka + 22 + w * 0.45, y + 4),
           ("C", x_sitka + 22 + w * 0.6, y + 2, x_sitka + 22 + w * 0.75, y + 14, xu - 6, y)]
    L, tocka = s.usisni_vod(seg, spojnice=(0.25, 0.5, 0.75, 0.985), sirina=12)
    # uže nepovratnog ventila (od sitke do torbice iznad)
    s.put([("M", x_sitka + 18, y - 26), ("C", x_sitka + 90, y - 110, xu - 70, y - 95, xu + 45, y - 95)], sw=1.1)
    s.simbol("uze-s-torbicom", xu + 60, y - 95, sirina=20, rotacija=90)
    # uže usisnog voda (omče uz spojnice, vezano za ručicu pumpe)
    tocke = [tocka(L * k) for k in (0.02, 0.25, 0.5, 0.75, 0.98)]
    d = [("M", tocke[0][0], tocke[0][1] + 6)]
    for i in range(1, len(tocke)):
        (xa, ya, *_), (xb, yb, *_) = tocke[i - 1], tocke[i]
        d.append(("C", xa + (xb - xa) * 0.3, ya + 22, xa + (xb - xa) * 0.7, yb + 22, xb - 4, yb + 4))
    d.append(("C", xu + 6, y + 22, xu + 12, y + 26, xu + 18, y + 22))
    s.put(d, sw=0.9)
    return pmx - 45, pmy + 25


def _cijevni_sektor(s, izlaz, yv, x_kraj, x_spoj):
    """„B” vod od tlačnog izlaza pumpe do razdjelnice (dvije „B” cijevi)."""
    x0, y0 = izlaz
    s.vod([("M", x0, y0), ("C", x0, yv - 10, x0 + 30, yv, x0 + 90, yv), ("L", x_kraj, yv)], tip="B",
          spojnice=(x_spoj - x0 - 30,))
    s.osoba("strojar", x0 - 70, yv - 20, smjer="desno")


def skica_75(put):
    s = Skica(1220, 400)
    pmx, pmy, yv = 465, 150, 245
    izlaz = _usisni_sektor(s, pmx, pmy)
    _cijevni_sektor(s, izlaz, yv, 1105, 760)
    cx = razdjelnica(s, 1105, yv)
    s.osoba("c2", 760, yv - 42, smjer="desno")
    s.osoba("c1", 1010, yv - 42, smjer="desno")
    # vodna grupa i oprema
    s.osoba("v1", 560, 30, smjer="desno")
    s.osoba("v2", 560, 72, smjer="desno")
    s.simbol("cijevni-drzac", 662, 68, sirina=28)
    s.simbol("obicna-c-mlaznica", 668, 98, sirina=44)
    s.simbol("prijelazna-spojnica-bc", 600, 118, sirina=26)
    s.simbol("tlacna-b-cijev-kolut", 590, 188, sirina=70)
    for i in range(3):
        s.simbol("tlacna-c-cijev-kolut", 675, 155 + i * 16, sirina=58)
    # navalna grupa
    x = cx - 10
    for i, sid in enumerate(["k", "n1", "c-ml", "k", "n2", "k"]):
        y = 38 + i * 32
        if sid == "k":
            s.simbol("tlacna-c-cijev-kolut", x, y, sirina=58)
        elif sid == "c-ml":
            s.simbol("obicna-c-mlaznica", x, y, sirina=44)
        else:
            s.osoba(sid, x, y, smjer="desno")
    s.osoba("zapovjednik", cx, yv + 105, smjer="gore")
    s.spremi(put, "Skica 75 – Polaganje „B” cijevnog voda u cijevnom sektoru")


def _skica_mlazevi_15(put, naslov, drugi):
    s = Skica(1250, 570 if drugi else 430)
    pmx, pmy, yv = 465, 170, 280
    izlaz = _usisni_sektor(s, pmx, pmy)
    _cijevni_sektor(s, izlaz, yv, 860, 650)
    cx = razdjelnica(s, 860, yv)
    s.osoba("c2", 650, yv - 40, smjer="desno")
    s.osoba("c1", 820, yv)                   # vođa cijevne grupe poslužuje razdjelnicu
    s.simbol("prijelazna-spojnica-bc", 600, 135, sirina=26)
    s.simbol("tlacna-b-cijev-kolut", 590, 200, sirina=70)
    m = mlaz(s, (cx + RAZ_LIJEVI[0], yv + RAZ_LIJEVI[1]), -40, strana="lijevo")
    _osobe_na_mlazu(s, m, "n1", "n2", -40)
    if not drugi:
        s.osoba("v1", 560, 40, smjer="desno")
        s.osoba("v2", 560, 82, smjer="desno")
        s.simbol("cijevni-drzac", 662, 78, sirina=28)
        s.simbol("obicna-c-mlaznica", 668, 108, sirina=44)
        for i in range(3):
            s.simbol("tlacna-c-cijev-kolut", 675, 165 + i * 16, sirina=58)
        s.simbol("tlacna-c-cijev-kolut", 820, yv + 70, sirina=58)
        s.osoba("zapovjednik", 895, yv + 105, smjer="gore")
    else:
        m = mlaz(s, (cx + RAZ_DESNI[0], yv + RAZ_DESNI[1]), 40, strana="desno")
        _osobe_na_mlazu(s, m, "v1", "v2", 40)
        s.simbol("tlacna-c-cijev-kolut", 835, yv + 42, sirina=58)
        s.simbol("tlacna-c-cijev-kolut", 835, yv + 58, sirina=58)
        s.osoba("zapovjednik", 895, yv + 100, smjer="gore")
        s.osoba("teklic", 840, yv + 135, smjer="gore")
    s.spremi(put, naslov)


def skica_76(put):
    _skica_mlazevi_15(put, "Skica 76 – Položaj odjeljenja, sprava i opreme nakon položenog prvog mlaza", False)


def skica_77(put):
    _skica_mlazevi_15(put, "Skica 77 – Položaj odjeljenja, sprava i opreme nakon položenog drugog mlaza", True)


def build(korijen):
    m = Path(korijen) / "skice"
    skica_68(m / "13-skica-68.svg")
    skica_69(m / "13-skica-69.svg")
    skica_70(m / "13-skica-70.svg")
    skica_71(m / "14-skica-71.svg")
    skica_72(m / "14-skica-72.svg")
    skica_73(m / "14-skica-73.svg")
    skica_74(m / "15-skica-74.svg")
    skica_75(m / "15-skica-75.svg")
    skica_76(m / "15-skica-76.svg")
    skica_77(m / "15-skica-77.svg")


if __name__ == "__main__":
    build(Path(__file__).resolve().parent.parent)
