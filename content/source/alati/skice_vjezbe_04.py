#!/usr/bin/env python3
"""Skice 27–36 za Vježbu 4 (2.4.2 Vježba s usisnim cijevima, 3 vatrogasca).

Pokretanje (iz mape Vjezbe):   python3 alati/skice_vjezbe_04.py
"""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from vatrogasni_simboli import Skica  # noqa: E402
from skice_vjezbe_03 import (CIJEV_W, cijev, kljucevi, pumpa, red_cijevi, sitka_vodoravno,  # noqa: E402
                             stup_opreme, uze, uze_ventila, vezani_vod)


def skica_27(put):
    s = Skica(560, 380)
    stup_opreme(s, 440, 190)
    s.osoba("strojar", 150, 190, smjer="gore")
    s.osoba("n1", 225, 190, smjer="gore")
    s.osoba("n2", 150, 260, smjer="gore")
    s.spremi(put, "Skica 27 – Postavljanje sprava, opreme i postrojavanje odjeljenja")


def skica_28(put):
    s = Skica(480, 340)
    xc = 240
    cijev(s, xc, 40)
    cijev(s, xc, 90)
    s.osoba("n1", xc - CIJEV_W / 2 - 40, 90, smjer="desno")
    s.osoba("n2", xc + CIJEV_W / 2 + 40, 90, smjer="lijevo")
    pumpa(s, xc + 15, 180)
    cijev(s, xc, 265)
    cijev(s, xc, 310)
    s.spremi(put, "Skica 28 – Položaj grupe tijekom polaganja prve usisne cijevi")


def skica_29(put):
    s = Skica(560, 300)
    xs = red_cijevi(s, 100, 40, 2, razmak=8)
    pumpa(s, xs[0] + 20, 125)
    cijev(s, xs[0], 210)
    cijev(s, xs[0], 255)
    s.osoba("n1", xs[0] - CIJEV_W / 2 - 40, 232, smjer="lijevo")
    s.osoba("n2", xs[0] + CIJEV_W / 2 + 40, 232, smjer="lijevo")
    s.spremi(put, "Skica 29 – Položaj grupe tijekom polaganja usisnih cijevi")


def skica_30(put):
    s = Skica(800, 260)
    y = 40
    xs = red_cijevi(s, 60, y, 4, razmak=8)
    s.osoba("n1", 60, y + 55, smjer="lijevo")
    s.osoba("n2", 60 + CIJEV_W - 15, y + 55, smjer="lijevo")
    pumpa(s, xs[2] + 20, y + 160)
    s.spremi(put, "Skica 30 – Položaj grupe tijekom polaganja usisnih cijevi")


def skica_31(put):
    s = Skica(860, 230)
    y = 40
    s.osoba("n1", 30, y, smjer="desno")
    xs0 = 90
    desno = sitka_vodoravno(s, xs0, y)
    xs = red_cijevi(s, desno + 4, y, 4, razmak=6)
    s.osoba("n2", xs[0] - 30, y, smjer="lijevo")
    s.osoba("strojar", desno + 4, y + 70, smjer="gore")
    pumpa(s, xs[2] + 30, y + 140, kljuc=False)
    s.spremi(put, "Skica 31 – Položaj odjeljenja na početku spajanja usisnog voda")


def skica_32(put):
    s = Skica(860, 240)
    y = 55
    xs0 = 45
    desno = sitka_vodoravno(s, xs0, y)
    uze(s, xs0 + 8, y - 38)
    uze(s, xs0 + 8, y + 38)
    xs = red_cijevi(s, desno + 4, y, 4, razmak=6)
    s.osoba("strojar", xs[0] - 50, y)
    s.osoba("n1", xs[0] + 55, y, smjer="lijevo")
    s.osoba("n2", xs[1] - 45, y, smjer="lijevo")
    pumpa(s, xs[2] - 20, y + 130, kljuc=False)
    s.spremi(put, "Skica 32 – Položaj odjeljenja tijekom spajanja usisnog voda")


def skica_33(put):
    s = Skica(820, 410)
    seg = [("M", 90, 100), ("C", 180, 190, 260, 200, 400, 200), ("C", 560, 200, 650, 180, 750, 100)]
    L, tocka, spoj = vezani_vod(s, seg)
    x, y, ux, uy = tocka(0)
    s.osoba("n2", x - 30, y - 68, smjer="desno")
    x1, y1, _, _ = tocka(spoj[0] - 30)
    s.put([("M", x1, y1 + 15), ("Q", x1 + 10, y1 + 90, x1 + 50, y1 + 105)])
    s.osoba("n1", x1 + 75, y1 + 105, smjer="lijevo")
    xe, ye, ux, uy = tocka(L)
    s.osoba("strojar", xe + 30, ye - 18, smjer="lijevo")
    pumpa(s, 580, 350, kljuc=False)
    s.spremi(put, "Skica 33 – Položaj grupe tijekom vezivanja prve usisne cijevi")


def skica_34(put):
    s = Skica(760, 440)
    seg = [("M", 50, 150), ("C", 150, 160, 220, 140, 320, 145), ("C", 400, 150, 420, 185, 500, 150),
           ("C", 560, 125, 600, 110, 680, 80)]
    L, tocka, spoj = vezani_vod(s, seg)
    uze_ventila(s, tocka, (560, 30), sredina=(240, 45))
    s.osoba("n2", 330, 95, smjer="lijevo")
    x3, y3, _, _ = tocka(spoj[2] - 14)
    s.put([("M", x3, y3 + 14), ("Q", x3 + 5, y3 + 50, x3 + 40, y3 + 62)])
    s.osoba("n1", x3 + 65, y3 + 62, smjer="lijevo")
    xe, ye, _, _ = tocka(L)
    s.osoba("strojar", xe + 30, ye - 18, smjer="lijevo")
    pumpa(s, 380, 370, kljuc=False)
    s.spremi(put, "Skica 34 – Položaj odjeljenja tijekom vezanja usisnog voda")


def skica_35(put):
    s = Skica(820, 420)
    seg = [("M", 70, 170), ("C", 180, 160, 230, 120, 320, 125), ("C", 400, 130, 420, 170, 500, 160),
           ("C", 600, 150, 680, 120, 740, 110)]
    L, tocka, spoj = vezani_vod(s, seg)
    uze_ventila(s, tocka, (690, 30), sredina=(320, 45))
    s.osoba("n2", 290, 75, smjer="lijevo")
    x3, y3, _, _ = tocka(spoj[2])
    s.put([("M", x3 - 10, y3 + 14), ("L", x3 + 40, y3 + 85)])
    s.osoba("n1", x3 + 65, y3 + 95, smjer="lijevo")
    xe, ye, _, _ = tocka(L)
    s.osoba("strojar", xe + 32, ye - 8, smjer="lijevo")
    pumpa(s, 640, 330, kljuc=False)
    s.spremi(put, "Skica 35 – Položaj odjeljenja tijekom prenošenja usisnog voda")


def skica_36(put):
    s = Skica(870, 360)
    xp, yp = 720, 170
    otvor = pumpa(s, xp, yp, kljuc=False)
    seg = [("M", 60, 130), ("C", 150, 210, 260, 195, 360, 185), ("C", 440, 175, 500, yp, otvor - 100, yp)]
    L, tocka, spoj = vezani_vod(s, seg)
    s.usisni_vod([("M", otvor - 100, yp), ("L", otvor, yp)], sitka=False, sirina=22)
    s.osoba("n2", otvor - 80, yp)
    s.osoba("strojar", otvor - 32, yp)
    uze_ventila(s, tocka, (580, 40), sredina=(300, 30))
    x3, y3, _, _ = tocka(spoj[2])
    s.put([("M", x3 - 10, y3 + 14), ("C", x3 + 10, y3 + 110, xp - 60, yp + 90, xp + 115, yp + 85)])
    s.osoba("n1", xp + 115, yp + 125, smjer="gore")
    s.spremi(put, "Skica 36 – Položaj odjeljenja tijekom spajanja usisnog voda na motornu pumpu")


def build(korijen):
    m = Path(korijen) / "skice"
    for n, f in ((27, skica_27), (28, skica_28), (29, skica_29), (30, skica_30), (31, skica_31),
                 (32, skica_32), (33, skica_33), (34, skica_34), (35, skica_35), (36, skica_36)):
        f(m / f"04-skica-{n}.svg")


if __name__ == "__main__":
    build(Path(__file__).resolve().parent.parent)
