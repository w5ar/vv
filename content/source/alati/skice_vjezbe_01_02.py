#!/usr/bin/env python3
"""Skice 11–19 za Vježbu 1 i Vježbu 2 (2.3 Vježbe s hidrantom).

Pokretanje (iz mape Vjezbe):   python3 alati/skice_vjezbe_01_02.py
"""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from vatrogasni_simboli import Skica, mlaz  # noqa: E402

# Trodijelna razdjelnica (centar simbola) – pomaci ulaza i izlaza
RAZ_ULAZ = (-36, 0)
RAZ_LIJEVI, RAZ_SREDNJI, RAZ_DESNI = (34, -16), (34, 0), (34, 16)


def razdjelnica(s, ulaz_x, y):
    """Trodijelna razdjelnica čiji je ulaz u točki (ulaz_x, y). Vraća centar."""
    cx = ulaz_x - RAZ_ULAZ[0]
    s.simbol("trodijelna-razdjelnica", cx, y)
    return cx


def c_koluti(s, x, y0, n, korak=22):
    for i in range(n):
        s.simbol("tlacna-c-cijev-kolut", x, y0 + i * korak)


def b_koluti(s, x, y0, n, korak=30):
    for i in range(n):
        s.simbol("tlacna-b-cijev-kolut", x, y0 + i * korak)


def stup_hidranta(s, hx, hy):
    """Hidrant s ključem i nastavkom složenima iznad (početni raspored opreme)."""
    s.simbol("podzemni-hidrant", hx, hy)
    s.simbol("kljuc-podzemni-hidrant", hx, hy - 75, rotacija=90)
    s.simbol("dvodijelni-hidrantski-nastavak", hx, hy - 145, rotacija=90)


def stup_vodne_opreme(s, x, y_dno, b_kolutova=3, s_torbicom=True):
    """Prijelaznica B/C, torbica, ključevi za spojnice i B koluti (odozgo prema dolje)."""
    b_koluti(s, x, y_dno - (b_kolutova - 1) * 30, b_kolutova)
    y = y_dno - (b_kolutova - 1) * 30 - 70
    s.simbol("kljuc-za-spojnice", x - 13, y, rotacija=90)
    s.simbol("kljuc-za-spojnice", x + 13, y, rotacija=90)
    s.simbol("kljuc-za-spojnice", x, y - 50)
    y -= 50
    if s_torbicom:
        s.simbol("torbica-s-povezicama", x, y - 60, rotacija=90)
        y -= 60
    s.simbol("prijelazna-spojnica-bc", x, y - 65)


def b_vod_od_hidranta(s, start, y_vod, x_kraj, spojnice=(0.5,)):
    x0, y0 = start
    return s.vod([("M", x0, y0), ("C", x0 + 10, y_vod - 20, x0 + 70, y_vod, x0 + 190, y_vod),
                  ("L", x_kraj, y_vod)], tip="B", spojnice=spojnice)


# ---------------------------------------------------------------- Vježba 1
def skica_11(put):
    s = Skica(720, 520)
    hx, hy = 330, 430
    # odjeljenje
    s.osoba("v1", 70, hy, smjer="gore")
    s.osoba("n1", 120, hy, smjer="gore")
    s.osoba("strojar", 170, hy, smjer="gore")
    s.osoba("zapovjednik", 250, hy, smjer="gore")
    s.osoba("v2", 70, hy + 70, smjer="gore")
    s.osoba("n2", 120, hy + 70, smjer="gore")
    # oprema
    stup_hidranta(s, hx, hy)
    stup_vodne_opreme(s, 440, hy)
    c_koluti(s, 570, hy - 110, 6)
    s.simbol("obicna-c-mlaznica", 570, hy - 140)
    s.simbol("obicna-c-mlaznica", 570, hy - 160)
    s.simbol("cijevni-drzac", 560, hy - 200)
    s.simbol("cijevni-drzac", 560, hy - 250)
    s.simbol("trodijelna-razdjelnica", 670, hy - 55)
    s.spremi(put, "Skica 11 – Postavljanje sprava, opreme i postrojavanje odjeljenja za vježbu")


def _lijevo_vj1(s, hx, hy, s_vodnom_grupom=True, s_vodnom_opremom=True):
    """Lijevi dio skica 12–14: strojar, hidrant, oprema vodne grupe."""
    s.osoba("strojar", hx - 110, hy, smjer="desno")
    start = s.hidrant_s_nastavkom(hx, hy)
    if s_vodnom_grupom:
        s.osoba("v1", hx - 40, hy - 150, smjer="desno")
        s.osoba("v2", hx - 40, hy - 100, smjer="desno")
    s.simbol("prijelazna-spojnica-bc", hx + 90, hy - 110)
    s.simbol("kljuc-za-spojnice", hx + 90, hy - 65)
    s.simbol("tlacna-b-cijev-kolut", hx + 100, hy + 10)
    if s_vodnom_opremom:
        s.simbol("cijevni-drzac", hx + 200, hy - 150)
        s.simbol("obicna-c-mlaznica", hx + 210, hy - 100)
        c_koluti(s, hx + 210, hy - 30, 3)
    return start


def skica_12(put):
    s = Skica(980, 420)
    hx, hy, yv = 150, 220, 310
    start = _lijevo_vj1(s, hx, hy)
    kraj = b_vod_od_hidranta(s, start, yv, 860)
    cx = razdjelnica(s, kraj[0], yv)
    s.osoba("zapovjednik", cx, yv + 70, smjer="gore")
    # navalna grupa s opremom
    x = cx - 10
    s.simbol("tlacna-c-cijev-kolut", x, 50)
    s.osoba("n1", x, 88, smjer="desno")
    s.simbol("obicna-c-mlaznica", x, 125)
    s.simbol("tlacna-c-cijev-kolut", x, 155)
    s.osoba("n2", x, 193, smjer="desno")
    s.simbol("tlacna-c-cijev-kolut", x, 232)
    s.spremi(put, "Skica 12 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi „…za navalu pripremi!”")


def _navalni_dio(s, x_ulaz, yv, zapovjednik=True, mlazevi=("prvi",)):
    if zapovjednik:
        s.osoba("zapovjednik", x_ulaz - 22, yv)
    cx = razdjelnica(s, x_ulaz, yv)
    out = {}
    if "prvi" in mlazevi:
        m = mlaz(s, (cx + RAZ_LIJEVI[0], yv + RAZ_LIJEVI[1]), -40, strana="lijevo")
        (vx, vy), (lx, ly), (rx, ry), (ux, uy) = m["vrh"], m["lijevo"], m["desno"], m["smjer"]
        s.osoba("n1", vx + lx * 34 - ux * 16, vy + ly * 34 - uy * 16, smjer=-40)
        bx, by = m["luk_kraj"]
        s.osoba("n2", bx + rx * 40 + ux * 30, by + ry * 40 + uy * 30, smjer=-40)
        out["prvi"] = m
    if "drugi" in mlazevi:
        m = mlaz(s, (cx + RAZ_DESNI[0], yv + RAZ_DESNI[1]), 40, strana="desno")
        (vx, vy), (lx, ly), (rx, ry), (ux, uy) = m["vrh"], m["lijevo"], m["desno"], m["smjer"]
        s.osoba("v1", vx + lx * 34 - ux * 16, vy + ly * 34 - uy * 16, smjer=40)
        bx, by = m["luk_kraj"]
        s.osoba("v2", bx + rx * 40 + ux * 30, by + ry * 40 + uy * 30, smjer=40)
        out["drugi"] = m
    return cx


def skica_13(put):
    s = Skica(960, 460)
    hx, hy, yv = 150, 260, 350
    start = _lijevo_vj1(s, hx, hy)
    kraj = b_vod_od_hidranta(s, start, yv, 600)
    s.spojnica(*kraj, 1, 0, "B")
    cx = _navalni_dio(s, 600, yv)
    s.simbol("tlacna-c-cijev-kolut", cx, yv + 50)
    s.spremi(put, "Skica 13 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za prvi mlaz")


def skica_14(put):
    s = Skica(960, 640)
    hx, hy, yv = 150, 260, 350
    start = _lijevo_vj1(s, hx, hy, s_vodnom_grupom=False, s_vodnom_opremom=False)
    kraj = b_vod_od_hidranta(s, start, yv, 600)
    s.spojnica(*kraj, 1, 0, "B")
    cx = _navalni_dio(s, 600, yv, mlazevi=("prvi", "drugi"))
    s.simbol("tlacna-c-cijev-kolut", cx - 50, yv + 45)
    s.simbol("tlacna-c-cijev-kolut", cx - 50, yv + 63)
    s.spremi(put, "Skica 14 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za drugi mlaz")


def skica_15(put):
    s = Skica(940, 520)
    hx, hy = 250, 380
    s.osoba("strojar", 70, hy, smjer="gore")
    s.osoba("zapovjednik", 150, hy, smjer="gore")
    stup_hidranta(s, hx, hy)
    stup_vodne_opreme(s, 370, hy, b_kolutova=1)
    # dvije rastavljene B cijevi
    s.vod([("M", 220, hy + 70), ("L", 540, hy + 70)], tip="B", pocetak=True, kraj=True)
    s.vod([("M", 565, hy + 70), ("L", 840, hy + 70)], tip="B", pocetak=True, kraj=True)
    # navalna i vodna grupa s opremom (okrenuti prema hidrantu)
    x, y = 880, 50
    s.simbol("trodijelna-razdjelnica", x, y, rotacija=180)
    redoslijed = [("n1", 1), ("n2", 2), ("v1", 1), ("v2", 2)]
    y += 40
    for sid, n in redoslijed:
        s.osoba(sid, x, y, smjer="lijevo")
        y += 33
        for _ in range(n):
            s.simbol("tlacna-c-cijev-kolut", x, y)
            y += 18
        y += 18
    s.spremi(put, "Skica 15 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi „Posprema!”")


# ---------------------------------------------------------------- Vježba 2
def skica_16(put):
    s = Skica(680, 520)
    hx, hy = 290, 430
    s.osoba("strojar", 130, hy, smjer="gore")
    s.osoba("n1", 200, hy, smjer="gore")
    s.osoba("n2", 130, hy + 70, smjer="gore")
    stup_hidranta(s, hx, hy)
    stup_vodne_opreme(s, 400, hy)
    c_koluti(s, 525, hy - 44, 3)
    s.simbol("obicna-c-mlaznica", 525, hy - 75)
    s.simbol("cijevni-drzac", 515, hy - 120)
    s.simbol("trodijelna-razdjelnica", 610, hy - 30)
    s.spremi(put, "Skica 16 – Postavljanje sprava, opreme i postrojavanje odjeljenja za vježbu")


def _lijevo_vj2(s, hx, hy):
    s.osoba("strojar", hx - 110, hy, smjer="desno")
    start = s.hidrant_s_nastavkom(hx, hy)
    s.simbol("prijelazna-spojnica-bc", hx + 90, hy - 110)
    s.simbol("kljuc-za-spojnice", hx + 90, hy - 65)
    s.simbol("tlacna-b-cijev-kolut", hx + 100, hy + 10)
    return start


def skica_17(put):
    s = Skica(980, 420)
    hx, hy, yv = 150, 200, 290
    start = _lijevo_vj2(s, hx, hy)
    kraj = b_vod_od_hidranta(s, start, yv, 860)
    cx = razdjelnica(s, kraj[0], yv)
    s.simbol("kljuc-za-spojnice", cx, yv + 45)
    s.simbol("kljuc-za-spojnice", cx, yv + 60)
    x = cx - 10
    s.simbol("tlacna-c-cijev-kolut", x, 40)
    s.osoba("n1", x, 78, smjer="desno")
    s.simbol("obicna-c-mlaznica", x, 115)
    s.simbol("tlacna-c-cijev-kolut", x, 145)
    s.osoba("n2", x, 183, smjer="desno")
    s.simbol("tlacna-c-cijev-kolut", x, 222)
    s.spremi(put, "Skica 17 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi „…za navalu pripremi!”")


def skica_18(put):
    s = Skica(960, 460)
    hx, hy, yv = 150, 260, 350
    start = _lijevo_vj2(s, hx, hy)
    kraj = b_vod_od_hidranta(s, start, yv, 600)
    s.spojnica(*kraj, 1, 0, "B")
    cx = _navalni_dio(s, 600, yv, zapovjednik=False)
    s.simbol("kljuc-za-spojnice", cx - 10, yv + 40)
    s.simbol("kljuc-za-spojnice", cx - 10, yv + 55)
    s.simbol("tlacna-c-cijev-kolut", cx - 10, yv + 75)
    s.spremi(put, "Skica 18 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za prvi mlaz")


def skica_19(put):
    s = Skica(940, 400)
    hx, hy = 160, 290
    s.osoba("strojar", 60, hy, smjer="gore")
    s.simbol("podzemni-hidrant", hx, hy)
    s.simbol("kljuc-podzemni-hidrant", hx, hy - 75, rotacija=90)
    s.simbol("dvodijelni-hidrantski-nastavak", hx, hy - 145, rotacija=90)
    s.simbol("prijelazna-spojnica-bc", hx + 90, hy - 145)
    s.simbol("kljuc-za-spojnice", hx + 90, hy - 75)
    s.simbol("tlacna-b-cijev-kolut", hx + 100, hy + 5)
    # dvije B cijevi, rastavljene na razdjelnici, još spojene međusobno
    s.vod([("M", 140, hy + 70), ("L", 840, hy + 70)], tip="B", spojnice=(0.5,), pocetak=True, kraj=True)
    x, y = 880, 60
    s.simbol("trodijelna-razdjelnica", x, y, rotacija=180)
    y += 45
    for sid, n in (("n1", 2), ("n2", 1)):
        s.osoba(sid, x, y, smjer="lijevo")
        y += 33
        for _ in range(n):
            s.simbol("tlacna-c-cijev-kolut", x, y)
            y += 18
        y += 20
    s.spremi(put, "Skica 19 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi „Posprema!”")


def build(korijen):
    m = Path(korijen) / "skice"
    skica_11(m / "01-skica-11.svg")
    skica_12(m / "01-skica-12.svg")
    skica_13(m / "01-skica-13.svg")
    skica_14(m / "01-skica-14.svg")
    skica_15(m / "01-skica-15.svg")
    skica_16(m / "02-skica-16.svg")
    skica_17(m / "02-skica-17.svg")
    skica_18(m / "02-skica-18.svg")
    skica_19(m / "02-skica-19.svg")


if __name__ == "__main__":
    build(Path(__file__).resolve().parent.parent)
