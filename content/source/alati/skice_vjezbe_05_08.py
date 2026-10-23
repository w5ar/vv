#!/usr/bin/env python3
"""Skice 37–53 za Vježbe 5–8 (2.5 Vježbe s prijenosnom motornom vatrogasnom pumpom,
2.6 Vježbe s autocisternom).

Pokretanje (iz mape Vjezbe):   python3 alati/skice_vjezbe_05_08.py
"""
from pathlib import Path
import math
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from vatrogasni_simboli import Skica, dodaj_simbol, CRNA  # noqa: E402
from skice_vjezbe_01_02 import (razdjelnica, c_koluti, b_koluti, b_vod_od_hidranta,  # noqa: E402,F401
                                _navalni_dio, RAZ_ULAZ)

# ---------------------------------------------------------------- dodatni simbol
dodaj_simbol(
    "prikljucak-pumpe", "Priključak (usisni ili tlačni otvor) motorne pumpe ili vozila", 8, 18,
    f'<rect x="0.75" y="0.75" width="6.5" height="16.5" fill="#fff" stroke="{CRNA}" stroke-width="1.5"/>'
    f'<line x1="4" y1="3" x2="4" y2="15" stroke="{CRNA}" stroke-width="1"/>')

# Geometrija simbola (pomaci od središta)
MP_L, MP_D, MP_G = 43, 23, 23        # prijenosna pumpa: lijevi rub kućišta, donji i gornji rub
AC_L, AC_D = 58, 28                  # autocisterna: lijevi rub i dno tijela vozila


# ---------------------------------------------------------------- pomoćne funkcije
def mp(s, x, y, tlacni=True):
    """Prijenosna pumpa s usisnim priključkom (lijevo) i, po želji, tlačnim (dolje).
    Vraća (točka usisnog priključka, točka tlačnog priključka)."""
    s.simbol("prijenosna-pumpa", x, y)
    s.simbol("prikljucak-pumpe", x - MP_L - 4, y)
    t = None
    if tlacni:
        s.simbol("prikljucak-pumpe", x + 6, y + MP_D + 4, rotacija=90)
        t = (x + 6, y + MP_D + 8)
    return (x - MP_L - 8, y), t


def ac(s, x, y):
    """Autocisterna. Vraća (usisni ulaz na lijevoj strani, tlačni izlaz na dnu)."""
    s.simbol("autocisterna", x, y)
    return (x - AC_L, y - 8), (x - AC_L + 22, y + AC_D)


def uze_uz_vod(s, tocka, L, kraj, val=8, period=55):
    """Uže kojim je usisni vod vezan: valovita linija uz vod (od sitke prema pumpi), pa do kraja."""
    seg = []
    n = int(L / 4)
    for i in range(n + 1):
        d = L * i / n
        x, y, ux, uy = tocka(d)
        o = val * math.sin(2 * math.pi * d / period)
        p = (x - uy * o, y + ux * o)
        seg.append(("M", *p) if i == 0 else ("L", *p))
    x, y = seg[-1][1:]
    seg.append(("C", x + 10, y + 25, kraj[0] - 30, kraj[1], *kraj))
    s.put(seg, sw=0.9)


def usisni_sklop(s, ulaz, sitka_xy=None, torbica_xy=None):
    """Savijeni usisni vod (4 usisne cijevi) od sitke do usisnog ulaza pumpe/vozila,
    uže nepovratnog ventila (do torbice) i uže kojim je vod vezan."""
    ux, uy = ulaz
    sx, sy = sitka_xy or (ux - 290, uy - 18)
    L, tocka = s.usisni_vod(
        [("M", sx, sy), ("C", sx + 50, sy + 32, sx + 110, sy + 40, sx + 160, sy + 33),
         ("C", sx + 210, sy + 26, ux - 70, uy - 4, ux, uy)],
        spojnice=(0.06, 0.32, 0.58, 0.84))
    # uže nepovratnog ventila: od sitke prema gore do torbice
    tx, ty = torbica_xy or (ux - 40, uy - 85)
    s.put([("M", sx - 4, sy - 8), ("C", sx + 40, sy - 70, tx - 120, ty - 6, tx - 18, ty)], sw=0.9)
    s.simbol("uze-s-torbicom", tx, ty, sirina=20, rotacija=90)
    # uže kojim je vezan usisni vod
    uze_uz_vod(s, tocka, L, (ulaz[0] + 10, ulaz[1] + 26))


def b_vod_iz(s, start, y_vod, x_kraj, spojnice=(0.5,)):
    """B vod iz tlačnog priključka (prema dolje) pa vodoravno do razdjelnice."""
    x0, y0 = start
    return s.vod([("M", x0, y0), ("C", x0, y_vod - 20, x0 + 30, y_vod, x0 + 90, y_vod), ("L", x_kraj, y_vod)],
                 tip="B", spojnice=spojnice)


def navalna_grupa_s_opremom(s, x, y0):
    """Stupac navalne grupe kod razdjelnice: kolut, N1, mlaznica, kolut, N2, kolut."""
    s.simbol("tlacna-c-cijev-kolut", x, y0)
    s.osoba("n1", x, y0 + 38, smjer="desno")
    s.simbol("obicna-c-mlaznica", x, y0 + 75)
    s.simbol("tlacna-c-cijev-kolut", x, y0 + 105)
    s.osoba("n2", x, y0 + 143, smjer="desno")
    s.simbol("tlacna-c-cijev-kolut", x, y0 + 182)


def kljucevi(s, x, y, n=2):
    for i in range(n):
        s.simbol("kljuc-za-spojnice", x, y + i * 15)


def stupac_pospreme(s, x, y, raspored, razdjelnica_na_vrhu=True):
    """Osobe okrenute ulijevo s kolutima ispod (posprema)."""
    if razdjelnica_na_vrhu:
        s.simbol("trodijelna-razdjelnica", x, y, rotacija=180)
        y += 45
    for sid, n in raspored:
        if sid is None:
            y += n
            continue
        s.osoba(sid, x, y, smjer="lijevo")
        y += 33
        for _ in range(n):
            s.simbol("tlacna-c-cijev-kolut", x, y)
            y += 18
        y += 18
    return y


def hidrant_s_dva_b_voda(s, hx, hy, sabirnica_xy):
    """Hidrant s nastavkom i ključem; dvije B cijevi iz oba izlaza nastavka u obliku leće do sabirnice."""
    s.hidrant_s_nastavkom(hx, hy)
    sx, sy = sabirnica_xy
    s.simbol("sabirnica", sx, sy, rotacija=90)
    gx, gy = hx - 30, hy - 22
    dx, dy = hx - 30, hy + 22
    fx = sx - 17
    s.vod([("M", gx, gy), ("C", gx - 20, gy - 55, fx - 160, sy - 60, fx - 60, sy - 45),
           ("C", fx - 30, sy - 40, fx - 6, sy - 30, fx, sy - 23)], tip="B", kraj=True)
    s.vod([("M", dx, dy), ("C", dx - 20, dy + 55, fx - 160, sy + 60, fx - 60, sy + 45),
           ("C", fx - 30, sy + 40, fx - 6, sy + 30, fx, sy + 23)], tip="B", kraj=True)


# ---------------------------------------------------------------- Vježba 5
def skica_37(put):
    s = Skica(830, 420)
    y = 210
    s.osoba("v1", 40, y, smjer="gore")
    s.osoba("n1", 90, y, smjer="gore")
    s.osoba("strojar", 140, y, smjer="gore")
    s.osoba("zapovjednik", 220, y, smjer="gore")
    s.osoba("v2", 40, y + 70, smjer="gore")
    s.osoba("n2", 90, y + 70, smjer="gore")
    # usisni sektor
    s.simbol("usisna-sitka", 300, y, sirina=40, rotacija=-90)
    s.simbol("uze-s-torbicom", 300, y - 72, sirina=26, rotacija=90)
    s.simbol("uze-s-torbicom", 300, y - 42, sirina=26, rotacija=90)
    kljucevi(s, 300, y + 42)
    s.simbol("kljuc-za-spojnice", 350, y, rotacija=90)
    mp(s, 450, y, tlacni=False)
    for yy in (y - 110, y - 70, y + 70, y + 110):
        s.simbol("usisna-cijev", 450, yy, sirina=160)
    # cijevni i navalni sektor
    s.simbol("prijelazna-spojnica-bc", 570, y - 85)
    s.simbol("torbica-s-povezicama", 570, y - 30, rotacija=90)
    b_koluti(s, 575, y + 25, 3, korak=24)
    s.simbol("cijevni-drzac", 680, y - 110)
    s.simbol("cijevni-drzac", 680, y - 65)
    s.simbol("obicna-c-mlaznica", 690, y - 32)
    s.simbol("obicna-c-mlaznica", 690, y - 17)
    c_koluti(s, 690, y + 3, 6, korak=18)
    s.simbol("trodijelna-razdjelnica", 785, y + 48)
    s.spremi(put, "Skica 37 – Postavljanje sprava, opreme i postrojavanje odjeljenja")


def _lijevo_mp(s, mx, my, b_kolut=True):
    """Lijevi dio skica 38–41: pumpa, usisni vod s užadi, strojar."""
    ulaz, tlacni = mp(s, mx, my)
    usisni_sklop(s, ulaz)
    s.osoba("strojar", mx - 35, my + 95, smjer="desno")
    if b_kolut:
        s.simbol("tlacna-b-cijev-kolut", mx + 160, my + 22)
    return tlacni


def skica_38(put):
    s = Skica(1000, 430)
    mx, my, yv = 430, 190, 285
    tlacni = _lijevo_mp(s, mx, my)
    s.osoba("v1", mx + 120, my - 125, smjer="desno")
    s.osoba("v2", mx + 120, my - 82, smjer="desno")
    s.simbol("prijelazna-spojnica-bc", mx + 128, my - 40)
    s.simbol("cijevni-drzac", mx + 225, my - 95)
    s.simbol("obicna-c-mlaznica", mx + 240, my - 55)
    c_koluti(s, mx + 240, my - 10, 3, korak=18)
    kraj = b_vod_iz(s, tlacni, yv, 870)
    cx = razdjelnica(s, kraj[0], yv)
    s.spojnica(*kraj, 1, 0, "B")
    s.osoba("zapovjednik", cx, yv + 75, smjer="gore")
    navalna_grupa_s_opremom(s, cx - 15, 45)
    s.spremi(put, "Skica 38 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi „Za navalu pripremi!”")


def skica_39(put):
    s = Skica(1110, 440)
    mx, my, yv = 430, 210, 320
    tlacni = _lijevo_mp(s, mx, my)
    s.osoba("v1", mx + 120, my - 145, smjer="desno")
    s.osoba("v2", mx + 120, my - 102, smjer="desno")
    s.simbol("prijelazna-spojnica-bc", mx + 128, my - 60)
    s.simbol("cijevni-drzac", mx + 225, my - 115)
    s.simbol("obicna-c-mlaznica", mx + 240, my - 75)
    c_koluti(s, mx + 240, my - 30, 3, korak=18)
    kraj = b_vod_iz(s, tlacni, yv, 740)
    s.spojnica(*kraj, 1, 0, "B")
    cx = _navalni_dio(s, 740, yv)
    s.simbol("tlacna-c-cijev-kolut", cx - 10, yv + 45)
    s.spremi(put, "Skica 39 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za prvi mlaz")


def skica_40(put):
    s = Skica(1110, 620)
    mx, my, yv = 430, 210, 320
    tlacni = _lijevo_mp(s, mx, my)
    s.simbol("prijelazna-spojnica-bc", mx + 128, my - 50)
    kraj = b_vod_iz(s, tlacni, yv, 740)
    s.spojnica(*kraj, 1, 0, "B")
    cx = _navalni_dio(s, 740, yv, mlazevi=("prvi", "drugi"))
    s.simbol("tlacna-c-cijev-kolut", cx - 50, yv + 40)
    s.simbol("tlacna-c-cijev-kolut", cx - 50, yv + 58)
    s.spremi(put, "Skica 40 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za drugi mlaz")


def skica_41(put):
    s = Skica(940, 470)
    mx, my = 430, 160
    ulaz, _ = mp(s, mx, my)
    usisni_sklop(s, ulaz)
    s.osoba("strojar", mx - 60, my + 140, smjer="desno")
    s.simbol("prijelazna-spojnica-bc", mx + 128, my - 70)
    s.simbol("torbica-s-povezicama", mx + 128, my - 15, rotacija=90)
    s.simbol("tlacna-b-cijev-kolut", mx + 140, my + 45)
    # dvije rastavljene B cijevi
    s.vod([("M", mx - 80, my + 100), ("L", mx + 160, my + 100)], tip="B", pocetak=True, kraj=True)
    s.vod([("M", mx + 175, my + 100), ("L", mx + 420, my + 100)], tip="B", pocetak=True, kraj=True)
    stupac_pospreme(s, 880, 40, [("n1", 2), ("n2", 1), (None, 25), ("v1", 2), ("v2", 1)])
    s.spremi(put, "Skica 41 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi „Posprema!”")


# ---------------------------------------------------------------- Vježba 6
def skica_42(put):
    s = Skica(850, 440)
    y = 200
    s.simbol("podzemni-hidrant", 35, y)
    s.osoba("v1", 110, y, smjer="gore")
    s.osoba("n1", 160, y, smjer="gore")
    s.osoba("strojar", 210, y, smjer="gore")
    s.osoba("zapovjednik", 280, y, smjer="gore")
    s.osoba("v2", 110, y + 70, smjer="gore")
    s.osoba("n2", 160, y + 70, smjer="gore")
    s.simbol("sabirnica", 345, y, rotacija=90)
    kljucevi(s, 345, y + 40)
    s.simbol("kljuc-za-spojnice", 395, y, rotacija=90)
    mp(s, 490, y, tlacni=False)
    x = 610
    s.simbol("prijelazna-spojnica-bc", x, y - 140)
    s.simbol("torbica-s-povezicama", x, y - 85, rotacija=90)
    b_koluti(s, x, y - 30, 6, korak=17)
    s.simbol("dvodijelni-hidrantski-nastavak", x, y + 110, rotacija=90)
    s.simbol("kljuc-podzemni-hidrant", x, y + 175, rotacija=90)
    x2 = 720
    s.simbol("cijevni-drzac", x2 - 10, y - 125)
    s.simbol("cijevni-drzac", x2 - 10, y - 80)
    s.simbol("obicna-c-mlaznica", x2, y - 47)
    s.simbol("obicna-c-mlaznica", x2, y - 32)
    c_koluti(s, x2, y - 12, 6, korak=18)
    s.simbol("trodijelna-razdjelnica", 810, y + 10)
    s.spremi(put, "Skica 42 – Postavljanje sprava, opreme i postrojavanje odjeljenja")


def _lijevo_hidrant_mp(s, mx, my, v_grupa=True):
    """Lijevi dio skica 43–45: hidrant, dvije B cijevi do sabirnice na pumpi, strojar."""
    ulaz, tlacni = mp(s, mx, my)
    hx = mx - 330
    hidrant_s_dva_b_voda(s, hx, my, (ulaz[0] - 18, my))
    if v_grupa:
        s.osoba("v1", hx - 80, my, smjer="desno")
        s.osoba("v2", hx + 135, my, smjer="desno")
    s.osoba("strojar", mx - 70, my + 90, smjer="desno")
    return tlacni


def skica_43(put):
    s = Skica(1000, 420)
    mx, my, yv = 470, 160, 270
    tlacni = _lijevo_hidrant_mp(s, mx, my)
    s.simbol("prijelazna-spojnica-bc", mx + 115, my - 55)
    s.simbol("cijevni-drzac", mx + 190, my - 95)
    s.simbol("obicna-c-mlaznica", mx + 200, my - 55)
    b_koluti(s, mx + 120, my + 5, 2, korak=18)
    c_koluti(s, mx + 205, my - 5, 3, korak=17)
    kraj = b_vod_iz(s, tlacni, yv, 880)
    cx = razdjelnica(s, kraj[0], yv)
    s.spojnica(*kraj, 1, 0, "B")
    s.osoba("zapovjednik", cx, yv + 75, smjer="gore")
    navalna_grupa_s_opremom(s, cx - 15, 30)
    s.spremi(put, "Skica 43 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi „Za navalu pripremi!”")


def skica_44(put):
    s = Skica(1110, 420)
    mx, my, yv = 470, 190, 300
    tlacni = _lijevo_hidrant_mp(s, mx, my)
    s.simbol("prijelazna-spojnica-bc", mx + 115, my - 55)
    s.simbol("cijevni-drzac", mx + 190, my - 95)
    s.simbol("obicna-c-mlaznica", mx + 200, my - 55)
    b_koluti(s, mx + 120, my + 5, 2, korak=18)
    c_koluti(s, mx + 205, my - 5, 3, korak=17)
    kraj = b_vod_iz(s, tlacni, yv, 740)
    s.spojnica(*kraj, 1, 0, "B")
    cx = _navalni_dio(s, 740, yv)
    s.simbol("tlacna-c-cijev-kolut", cx - 10, yv + 45)
    s.spremi(put, "Skica 44 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za prvi mlaz")


def skica_45(put):
    s = Skica(1110, 600)
    mx, my, yv = 470, 190, 300
    tlacni = _lijevo_hidrant_mp(s, mx, my, v_grupa=False)
    s.simbol("prijelazna-spojnica-bc", mx + 115, my - 55)
    b_koluti(s, mx + 120, my + 5, 2, korak=18)
    kraj = b_vod_iz(s, tlacni, yv, 740)
    s.spojnica(*kraj, 1, 0, "B")
    cx = _navalni_dio(s, 740, yv, mlazevi=("prvi", "drugi"))
    s.simbol("tlacna-c-cijev-kolut", cx - 50, yv + 40)
    s.simbol("tlacna-c-cijev-kolut", cx - 50, yv + 58)
    s.spremi(put, "Skica 45 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za drugi mlaz")


def skica_46(put):
    s = Skica(960, 470)
    y = 150
    s.hidrant_s_nastavkom(70, y)
    s.osoba("strojar", 230, y, smjer="gore")
    s.osoba("zapovjednik", 280, y, smjer="gore")
    s.simbol("sabirnica", 345, y, rotacija=90)
    kljucevi(s, 345, y + 40)
    s.simbol("kljuc-za-spojnice", 395, y, rotacija=90)
    mp(s, 490, y, tlacni=False)
    x = 625
    s.simbol("prijelazna-spojnica-bc", x, y - 110)
    s.simbol("torbica-s-povezicama", x, y - 55, rotacija=90)
    b_koluti(s, x, y + 5, 2, korak=17)
    s.simbol("tlacna-b-cijev-kolut", x, y + 50)
    # jedna B cijev od hidranta (namotana prema pumpi) i dvije rastavljene B cijevi B voda
    s.vod([("M", 170, y - 85), ("L", 400, y - 85)], tip="B", pocetak=True, kraj=True)
    s.vod([("M", 380, y + 110), ("L", 600, y + 110)], tip="B", pocetak=True, kraj=True)
    s.vod([("M", 620, y + 110), ("L", 840, y + 110)], tip="B", pocetak=True, kraj=True)
    stupac_pospreme(s, 905, 40, [("n1", 2), ("n2", 1), (None, 25), ("v1", 2), ("v2", 1)])
    s.spremi(put, "Skica 46 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi „Posprema!”")


# ---------------------------------------------------------------- Vježba 7
def skica_47(put):
    s = Skica(420, 260)
    s.osoba("strojar", 60, 110, smjer="gore")
    s.osoba("n1", 140, 110, smjer="gore")
    s.osoba("n2", 60, 185, smjer="gore")
    s.simbol("autocisterna", 300, 100, sirina=170)
    s.spremi(put, "Skica 47 – Postrojavanje odjeljenja autocisterne")


def skica_48(put):
    s = Skica(900, 380)
    axy = (150, 110)
    _, tlacni = ac(s, *axy)
    s.osoba("strojar", 45, 230, smjer="desno")
    yv = 230
    kraj = b_vod_iz(s, tlacni, yv, 780, spojnice=(0.38,))
    cx = razdjelnica(s, kraj[0], yv)
    s.spojnica(*kraj, 1, 0, "B")
    navalna_grupa_s_opremom(s, cx - 115, 20)
    kljucevi(s, cx - 105, yv + 40)
    s.spremi(put, "Skica 48 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi „Za navalu pripremi!”")


def skica_49(put):
    s = Skica(1000, 380)
    axy = (130, 150)
    _, tlacni = ac(s, *axy)
    s.osoba("strojar", 25, 270, smjer="desno")
    yv = 270
    kraj = b_vod_iz(s, tlacni, yv, 620, spojnice=(0.45,))
    s.spojnica(*kraj, 1, 0, "B")
    cx = _navalni_dio(s, 620, yv, zapovjednik=False)
    kljucevi(s, cx - 95, yv + 40)
    s.simbol("tlacna-c-cijev-kolut", cx - 95, yv + 75)
    s.spremi(put, "Skica 49 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za prvi mlaz")


def skica_50(put):
    s = Skica(1050, 330)
    y = 40
    s.osoba("n1", 30, y, smjer="desno")
    s.simbol("usisna-sitka", 95, y, sirina=24, rotacija=-90)
    xs = [175, 290, 405, 520]
    for x in xs:
        s.simbol("usisna-cijev", x, y, sirina=112)
    kljucevi(s, 150, y - 6)
    s.osoba("n2", 175, y)
    s.osoba("strojar", 125, y + 55, smjer="gore")
    _, tlacni = ac(s, 480, 150)
    yv = 245
    kraj = b_vod_iz(s, tlacni, yv, 700, spojnice=(0.4,))
    s.spojnica(*kraj, 1, 0, "B")
    cx = razdjelnica(s, 700, yv)
    from vatrogasni_simboli import mlaz
    from skice_vjezbe_01_02 import RAZ_LIJEVI
    mlaz(s, (cx + RAZ_LIJEVI[0], yv + RAZ_LIJEVI[1]), -40, strana="lijevo")
    s.simbol("tlacna-c-cijev-kolut", cx - 10, yv + 45)
    s.spremi(put, "Skica 50 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi „Četiri usisne cijevi!”")


def skica_51(put):
    s = Skica(1100, 400)
    axy = (460, 160)
    ulaz, tlacni = ac(s, *axy)
    usisni_sklop(s, ulaz, torbica_xy=(ulaz[0] + 15, ulaz[1] - 90))
    s.osoba("strojar", ulaz[0] - 30, axy[1] + 70, smjer="desno")
    yv = 280
    kraj = b_vod_iz(s, tlacni, yv, 720, spojnice=(0.5,))
    s.spojnica(*kraj, 1, 0, "B")
    cx = _navalni_dio(s, 720, yv, zapovjednik=False)
    kljucevi(s, cx - 95, yv + 40)
    s.simbol("tlacna-c-cijev-kolut", cx - 95, yv + 75)
    s.spremi(put, "Skica 51 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi „Gotovo!”")


# ---------------------------------------------------------------- Vježba 8
def _hidrant_ac(s, hx, hy, axy):
    """Hidrant s nastavkom i B cijev od hidranta do priključka za punjenje autocisterne."""
    start = s.hidrant_s_nastavkom(hx, hy)
    ulaz, tlacni = ac(s, *axy)
    ex, ey = ulaz[0], axy[1] + 12
    x0, y0 = start
    s.vod([("M", x0, y0), ("C", x0 + 5, y0 + 40, x0 + 60, ey, x0 + 150, ey), ("L", ex, ey)], tip="B")
    return tlacni


def skica_52(put):
    s = Skica(900, 380)
    axy = (420, 110)
    tlacni = _hidrant_ac(s, 110, 70, axy)
    s.osoba("strojar", 330, 230, smjer="desno")
    yv = 230
    kraj = b_vod_iz(s, tlacni, yv, 780, spojnice=(0.4,))
    cx = razdjelnica(s, kraj[0], yv)
    s.spojnica(*kraj, 1, 0, "B")
    navalna_grupa_s_opremom(s, cx - 115, 20)
    kljucevi(s, cx - 105, yv + 40)
    s.spremi(put, "Skica 52 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi „Za navalu pripremi!”")


def skica_53(put):
    s = Skica(1000, 400)
    axy = (330, 170)
    tlacni = _hidrant_ac(s, 80, 120, axy)
    s.osoba("strojar", 240, 280, smjer="desno")
    yv = 290
    kraj = b_vod_iz(s, tlacni, yv, 620, spojnice=(0.45,))
    s.spojnica(*kraj, 1, 0, "B")
    cx = _navalni_dio(s, 620, yv, zapovjednik=False)
    kljucevi(s, cx - 95, yv + 40)
    s.simbol("tlacna-c-cijev-kolut", cx - 95, yv + 75)
    s.spremi(put, "Skica 53 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za prvi mlaz")


SKICE = {
    "05-skica-37": skica_37, "05-skica-38": skica_38, "05-skica-39": skica_39,
    "05-skica-40": skica_40, "05-skica-41": skica_41,
    "06-skica-42": skica_42, "06-skica-43": skica_43, "06-skica-44": skica_44,
    "06-skica-45": skica_45, "06-skica-46": skica_46,
    "07-skica-47": skica_47, "07-skica-48": skica_48, "07-skica-49": skica_49,
    "07-skica-50": skica_50, "07-skica-51": skica_51,
    "08-skica-52": skica_52, "08-skica-53": skica_53,
}


def build(korijen):
    m = Path(korijen) / "skice"
    for ime, f in SKICE.items():
        f(m / f"{ime}.svg")


if __name__ == "__main__":
    build(Path(__file__).resolve().parent.parent)
