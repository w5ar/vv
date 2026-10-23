#!/usr/bin/env python3
"""Skice 20–26 za Vježbu 3 (2.4.1 Vježba s usisnim cijevima, 5 vatrogasaca).

Pokretanje (iz mape Vjezbe):   python3 alati/skice_vjezbe_03.py

Zajednički pomoćnici za usisni vod (koristi ih i skice_vjezbe_04.py).
"""
from pathlib import Path
import math
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from vatrogasni_simboli import Skica, CRNA  # noqa: E402

# ---------------------------------------------------------------- mjere
CIJEV_W = 170                     # duljina simbola usisne cijevi u skicama
CIJEV_H = CIJEV_W * 22 / 120      # visina (≈31)
PUMPA_W = 150                     # širina simbola MP
PUMPA_H = PUMPA_W * 50 / 112      # ≈67
SITKA_W = 34                      # širina usisne sitke (poprečno)
SITKA_L = SITKA_W * 66 / 52       # duljina sitke (≈43)


# ---------------------------------------------------------------- oprema
def pumpa(s, x, y, kljuc=True):
    """MP s usisnim otvorom (lijevo) i, po želji, ključem za spojnice ispred otvora."""
    s.simbol("prijenosna-pumpa", x, y, sirina=PUMPA_W)
    lijevo = x - PUMPA_W / 2 + PUMPA_W * 13 / 112   # lijevi rub kućišta
    s.simbol("spojnica-usisna", lijevo - 5, y, sirina=7)
    if kljuc:
        s.simbol("kljuc-za-spojnice", lijevo - 22, y, sirina=36, rotacija=90)
    return lijevo - 9          # točka usisnog otvora


def cijev(s, x, y, sirina=CIJEV_W, rotacija=0):
    """Usisna cijev (centar)."""
    s.simbol("usisna-cijev", x, y, sirina=sirina, rotacija=rotacija)


def red_cijevi(s, x0, y, n, razmak=4, sirina=CIJEV_W):
    """n usisnih cijevi u redu od lijevog ruba x0. Vraća x-središta."""
    xs = [x0 + sirina / 2 + i * (sirina + razmak) for i in range(n)]
    for x in xs:
        cijev(s, x, y, sirina)
    return xs


def sitka_vodoravno(s, x, y):
    """Usisna sitka položena vodoravno, kruna lijevo; (x, y) = središte. Vraća desni rub."""
    s.simbol("usisna-sitka", x, y, sirina=SITKA_W, rotacija=-90)
    return x + SITKA_L / 2


def uze(s, x, y, crtica=True):
    """Uže s torbicom položeno vodoravno, s kratkom crticom (krajem užeta) lijevo."""
    s.simbol("uze-s-torbicom", x, y, sirina=16, rotacija=90)
    if crtica:
        s.linija(x - 27, y, x - 14, y, sw=1.2)


def kljucevi(s, x, y, n=2):
    for i in range(n):
        s.simbol("kljuc-za-spojnice", x, y + i * 11, sirina=36)


def stup_opreme(s, xp, y):
    """Početni raspored opreme oko MP (skica 20/27). Vraća x lijevog ruba opreme."""
    pumpa(s, xp, y)
    xc = xp + 10
    for dy in (-118, -78, 78, 118):
        cijev(s, xc, y + dy, sirina=180)
    xs = xp - PUMPA_W / 2 - 52
    sitka_vodoravno(s, xs, y)
    uze(s, xs + 6, y - 55)
    uze(s, xs + 6, y - 35)
    kljucevi(s, xs + 2, y + 32)
    return xs - SITKA_L / 2


# ---------------------------------------------------------------- savijeni usisni vod s užetom
def vezani_vod(s, segmenti, n_cijevi=4, sirina=22, omce=True, uze_strana=1, sitka=True):
    """Savijeni usisni vod od sitke (početak putanje) s n spojenih cijevi i
    užetom za vezanje (omča ispred svake spojnice, uže s jedne strane voda).
    Vraća (L, tocka, spoj) – spoj[i] = udaljenost i-te spojnice od početka."""
    L, tocka = s.usisni_vod(segmenti, spojnice=(), sitka=False, sirina=sirina)
    if sitka:  # usisna sitka veća od zadane u usisni_vod(), razmjerna širini voda
        x, y, ux, uy = tocka(0)
        w = sirina * 1.45
        dl = w * 66 / 52
        kut = math.degrees(math.atan2(-ux, uy))
        s.simbol("usisna-sitka", x - ux * dl / 2, y - uy * dl / 2, sirina=w, rotacija=round(kut, 2))
    spoj = [L * (i + 1) / n_cijevi for i in range(n_cijevi - 1)]
    for d in spoj + [L - 1.5]:
        x, y, ux, uy = tocka(d)
        s._postavi("spojnica-usisna", x, y, ux, uy)
    if omce:
        # uže teče uz vod; omča (petlja) oko voda ~10 cm ispred svake spojnice
        n = 160
        pts = []
        for k in range(n + 1):
            d = 4 + (spoj[-1] - 14 - 4) * k / n
            x, y, ux, uy = tocka(d)
            nx, ny = -uy * uze_strana, ux * uze_strana
            o = sirina / 2 + 6 + 3 * math.sin(d / 25)
            pts.append((x + nx * o, y + ny * o))
        seg = [("M", *pts[0])] + [("L", *p) for p in pts[1:]]
        s.put(seg, sw=1.0)
        for d in spoj:
            x, y, ux, uy = tocka(d - 14)
            kut = math.degrees(math.atan2(uy, ux))
            s.el.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="7" ry="{sirina / 2 + 6:.1f}" fill="none" '
                        f'stroke="{CRNA}" stroke-width="1" transform="rotate({kut:.1f} {x:.1f} {y:.1f})"/>')
    return L, tocka, spoj


def kraj_voda(tocka, L):
    x, y, ux, uy = tocka(L)
    return x, y, ux, uy


def uze_ventila(s, tocka, kraj, sredina=None):
    """Uže nepovratnog ventila: od sitke (početak voda) do torbice u točki 'kraj'."""
    x0, y0, ux, uy = tocka(0)
    xe, ye = kraj
    if sredina is None:
        sredina = ((x0 + xe) / 2, min(y0, ye) - 60)
    seg = [("M", x0 + uy * 10, y0 - ux * 10),
           ("Q", sredina[0] - (xe - x0) * 0.25, sredina[1], *sredina),
           ("L", xe - 16, ye)]
    s.put(seg, sw=1.0)
    s.simbol("uze-s-torbicom", xe, ye, sirina=16, rotacija=90)


def os(sid, s, x, y, smjer):
    s.osoba(sid, x, y, smjer=smjer)


# ---------------------------------------------------------------- skice
def skica_20(put):
    s = Skica(640, 380)
    xp, y = 520, 190
    stup_opreme(s, xp, y)
    for sid, x, yy in (("strojar", 300, y), ("v1", 200, y), ("c1", 135, y), ("v2", 200, y + 70), ("c2", 135, y + 70)):
        s.osoba(sid, x, yy, smjer="gore")
    s.spremi(put, "Skica 20 – Postavljanje sprava, opreme i postrojavanje")


def skica_21(put):
    s = Skica(820, 580)
    # gore: cijevna grupa podiže cijev s lijeve strane MP
    xc = 430
    cijev(s, xc, 40)
    cijev(s, xc, 90)
    s.osoba("c1", xc - CIJEV_W / 2 - 40, 90, smjer="desno")
    s.osoba("c2", xc + CIJEV_W / 2 + 40, 90, smjer="lijevo")
    pumpa(s, xc + 25, 170)
    cijev(s, xc, 250)
    cijev(s, xc, 295)
    s.osoba("v1", xc - CIJEV_W / 2 - 40, 272, smjer="lijevo")
    s.osoba("v2", xc + CIJEV_W / 2 + 40, 272, smjer="lijevo")
    # dolje: cijevi položene u produžetku
    y = 400
    xs = red_cijevi(s, 70, y, 4)
    s.osoba("v1", xs[0] - CIJEV_W / 2 + 5, y + 48, smjer="lijevo")
    s.osoba("v2", xs[0] + CIJEV_W / 2 - 10, y + 48, smjer="lijevo")
    s.osoba("c1", xs[3] - CIJEV_W / 2 - 4, y - 46, smjer="desno")
    s.osoba("c2", xs[3] + CIJEV_W / 2 + 22, y - 32, smjer="lijevo")
    pumpa(s, xs[2] - 30, y + 115)
    s.spremi(put, "Skica 21 – Položaj grupa tijekom polaganja usisnih cijevi")


def skica_22(put):
    s = Skica(900, 230)
    y = 50
    s.osoba("v2", 40, y, smjer="desno")
    s.osoba("v1", 100, y, smjer="desno")
    xs0 = 160
    desno = sitka_vodoravno(s, xs0, y)
    xs = red_cijevi(s, desno + 6, y, 4, razmak=6)
    s.osoba("c1", xs[0] - 40, y, smjer="lijevo")
    s.osoba("c2", xs[0] + 50, y, smjer="lijevo")
    s.osoba("strojar", xs0, y + 70, smjer="gore")
    pumpa(s, xs[2] + 20, y + 125)
    s.spremi(put, "Skica 22 – Položaj grupa na početku spajanja usisnih cijevi")


def skica_23(put):
    s = Skica(860, 260)
    y = 60
    xs0 = 50
    desno = sitka_vodoravno(s, xs0, y)
    uze(s, xs0 + 10, y - 40)
    uze(s, xs0 + 10, y + 40)
    xs = red_cijevi(s, desno + 4, y, 4, razmak=4)
    s.osoba("v2", xs[2] - 50, y, smjer="lijevo")
    s.osoba("v1", xs[2] + 45, y, smjer="lijevo")
    s.osoba("c1", xs[3] - 40, y, smjer="lijevo")
    s.osoba("c2", xs[3] + 55, y, smjer="lijevo")
    s.osoba("strojar", xs[2] + CIJEV_W / 2, y + 75, smjer="gore")
    pumpa(s, xs[2] - 10, y + 150)
    s.spremi(put, "Skica 23 – Položaj grupa kod spajanja zadnje usisne cijevi")


def skica_24(put):
    s = Skica(820, 400)
    seg = [("M", 90, 120), ("C", 170, 220, 260, 170, 330, 170), ("C", 420, 170, 380, 110, 470, 180),
           ("C", 560, 240, 620, 130, 700, 75)]
    L, tocka, spoj = vezani_vod(s, seg)
    x, y, ux, uy = tocka(0)
    s.osoba("c1", x + 75, y - 10, smjer="lijevo")
    s.osoba("c2", 270, 70, smjer="dolje")
    s.osoba("v2", 360, 95, smjer="lijevo")
    xs, ys, ux, uy = tocka(spoj[-1])
    s.osoba("v1", xs + 110, ys + 50, smjer="lijevo")
    uze(s, xs + 60, ys + 58, crtica=False)
    s.put([("M", xs - 10, ys + 20), ("Q", xs + 5, ys + 60, xs + 45, ys + 58)])
    xe, ye, ux, uy = tocka(L)
    s.osoba("strojar", xe + 30, ye - 18, smjer="lijevo")
    pumpa(s, 470, 320)
    s.spremi(put, "Skica 24 – Položaj grupa tijekom vezanja usisnog voda")


def skica_25(put):
    s = Skica(840, 360)
    seg = [("M", 70, 60), ("C", 200, 160, 360, 160, 480, 150), ("C", 600, 140, 700, 120, 770, 70)]
    L, tocka, spoj = vezani_vod(s, seg)
    x, y, ux, uy = tocka(0)
    s.osoba("c1", x + 85, y + 5, smjer="lijevo")
    xs = [tocka(d) for d in spoj]
    s.osoba("c2", xs[0][0] + 10, xs[0][1] - 60, smjer="lijevo")
    s.osoba("v2", xs[1][0] + 10, xs[1][1] - 60, smjer="lijevo")
    s.osoba("v1", xs[2][0] + 70, xs[2][1] + 60, smjer="lijevo")
    s.put([("M", xs[2][0] - 15, xs[2][1] + 15), ("Q", xs[2][0], xs[2][1] + 60, xs[2][0] + 45, xs[2][1] + 60)])
    xe, ye, ux, uy = tocka(L)
    s.osoba("strojar", xe + 30, ye - 20, smjer="lijevo")
    pumpa(s, 600, 290)
    s.spremi(put, "Skica 25 – Položaj grupa za prenošenje usisnog voda")


def skica_26(put):
    s = Skica(880, 300)
    xp, yp = 720, 150
    otvor = pumpa(s, xp, yp, kljuc=False)
    seg = [("M", 70, 120), ("C", 160, 200, 260, 175, 360, 165), ("C", 440, 155, 500, yp, otvor - 100, yp)]
    L, tocka, spoj = vezani_vod(s, seg)
    s.usisni_vod([("M", otvor - 100, yp), ("L", otvor, yp)], sitka=False, sirina=22)
    # V2 i strojar na spoju voda s pumpom
    s.osoba("v2", otvor - 80, yp)
    s.osoba("strojar", otvor - 32, yp)
    # uže nepovratnog ventila do C1
    uze_ventila(s, tocka, (610, 55), sredina=(300, 45))
    s.osoba("c1", 600, 20, smjer="desno")
    s.osoba("c2", 300, 110, smjer="desno")
    # uže usisnog voda ispod MP do V1
    x3, y3, ux, uy = tocka(spoj[2])
    s.put([("M", x3 - 10, y3 + 14), ("C", x3 + 10, y3 + 100, xp - 60, yp + 65, xp + 100, yp + 60)])
    s.osoba("v1", xp + 125, yp + 72, smjer=-160)
    s.spremi(put, "Skica 26 – Položaj grupa pri spajanju usisnog voda na motornu pumpu")


def build(korijen):
    m = Path(korijen) / "skice"
    skica_20(m / "03-skica-20.svg")
    skica_21(m / "03-skica-21.svg")
    skica_22(m / "03-skica-22.svg")
    skica_23(m / "03-skica-23.svg")
    skica_24(m / "03-skica-24.svg")
    skica_25(m / "03-skica-25.svg")
    skica_26(m / "03-skica-26.svg")


if __name__ == "__main__":
    build(Path(__file__).resolve().parent.parent)
