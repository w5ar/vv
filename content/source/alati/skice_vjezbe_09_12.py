#!/usr/bin/env python3
"""Skice 54–67 za Vježbe 9–12 (2.7 Vježbe s navalnim vozilom).

Pokretanje (iz mape Vjezbe):   python3 alati/skice_vjezbe_09_12.py
"""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from vatrogasni_simboli import Skica, mlaz, CRNA, FONT  # noqa: E402
from skice_vjezbe_01_02 import razdjelnica, RAZ_LIJEVI, RAZ_SREDNJI, RAZ_DESNI  # noqa: E402

NV_SIR = 150          # širina simbola navalnog vozila u skicama
NV_VIS = NV_SIR / 2   # visina (omjer simbola 120 × 60)


# ---------------------------------------------------------------- zajednički dijelovi
def vozilo(s, nx, ny):
    """Navalno vozilo sa središtem u (nx, ny); prednji dio (kabina) desno."""
    s.simbol("navalno-vozilo", nx, ny, sirina=NV_SIR)


def b_vod_od_vozila(s, nx, ny, yv, x_kraj, spojnice=(0.5,)):
    """„B” vod od tlačnog izlaza vozila (dolje lijevo) do (x_kraj, yv)."""
    sx, sy = nx - NV_SIR / 2 + 30, ny + NV_VIS / 2
    kraj = s.vod([("M", sx, sy), ("L", sx, yv - 18), ("Q", sx, yv, sx + 18, yv), ("L", x_kraj, yv)],
                 tip="B", spojnice=spojnice)
    return kraj


def hidrant_do_vozila(s, hx, hy, nx, ny):
    """Hidrant s nastavkom i „B” vod od nastavka do lijeve strane vozila."""
    x0, y0 = s.hidrant_s_nastavkom(hx, hy)
    xl, yl = nx - NV_SIR / 2 + 2, ny + 14
    s.vod([("M", x0, y0), ("C", x0 + 8, yl - 10, x0 + 50, yl, x0 + 120, yl), ("L", xl, yl)], tip="B")


def usisni_vod_do_vozila(s, nx, ny):
    """Usisni vod (4 usisne cijevi, sitka lijevo), uže sitke s torbicom i uže za vezanje voda."""
    xl, yl = nx - NV_SIR / 2 + 2, ny - 5
    x0, y0 = xl - 300, yl - 20
    s.usisni_vod([("M", x0, y0), ("C", x0 + 60, y0 + 40, x0 + 110, y0 + 30, x0 + 150, y0 + 28),
                  ("C", x0 + 200, y0 + 26, x0 + 230, y0 + 8, xl - 20, yl), ("L", xl - 6, yl)],
                 spojnice=(0.04, 0.28, 0.52, 0.76, 0.985))
    # uže s torbicom (od sitke preko voda do torbice)
    s.put([("M", x0 + 4, y0 - 6), ("C", x0 + 50, y0 - 60, x0 + 120, y0 - 85, x0 + 200, y0 - 85),
           ("L", nx - 52, y0 - 85)])
    s.simbol("uze-s-torbicom", nx - 40, y0 - 85, sirina=20, rotacija=90)
    # uže za vezanje usisnog voda (omče ispod spojnica)
    s.put([("M", x0 + 10, y0 + 6), ("C", x0 + 40, y0 + 55, x0 + 70, y0 + 52, x0 + 85, y0 + 30),
           ("C", x0 + 100, y0 + 56, x0 + 140, y0 + 56, x0 + 157, y0 + 32),
           ("C", x0 + 170, y0 + 54, x0 + 210, y0 + 50, x0 + 228, y0 + 22),
           ("C", x0 + 240, y0 + 48, x0 + 270, y0 + 52, xl, ny + 22)])


def stupac(s, x, y0, stavke, korak_osoba=34, korak_kolut=18):
    """Stupac osoba i opreme odozgo prema dolje.
    stavke: ("osoba", sid, smjer[, ia]) | ("c",) C kolut | ("b",) B kolut | ("mc",) C mlaznica | ("mb",) B mlaznica"""
    y = y0
    for st in stavke:
        k = st[0]
        if k == "osoba":
            y += korak_osoba / 2
            s.osoba(st[1], x, y, smjer=st[2], ia=(len(st) > 3 and st[3]))
            y += korak_osoba / 2 + 4
        elif k in ("c", "b"):
            y += korak_kolut / 2
            s.simbol("tlacna-c-cijev-kolut" if k == "c" else "tlacna-b-cijev-kolut", x, y)
            y += korak_kolut / 2
        elif k in ("mc", "mb"):
            y += 10
            s.simbol("obicna-c-mlaznica" if k == "mc" else "obicna-b-mlaznica", x, y)
            y += 12
    return y


def c_mlaz(s, cx, yv, koji, ia=False):
    """Položeni „C” mlaz s razdjelnice (centar cx, yv); koji = "prvi" (lijevi izlaz, gore)
    ili "drugi" (desni izlaz, dolje). ia=True: vođa i član s izolacijskim aparatima."""
    if koji == "prvi":
        m = mlaz(s, (cx + RAZ_LIJEVI[0], yv + RAZ_LIJEVI[1]), -40, strana="lijevo")
        vodja, clan, kut = "n1", "n2", -40
    else:
        m = mlaz(s, (cx + RAZ_DESNI[0], yv + RAZ_DESNI[1]), 40, strana="desno")
        vodja, clan, kut = "v1", "v2", 40
    (vx, vy), (lx, ly), (rx, ry), (ux, uy) = m["vrh"], m["lijevo"], m["desno"], m["smjer"]
    s.osoba(vodja, vx + lx * 34 - ux * 16, vy + ly * 34 - uy * 16, smjer=kut, ia=ia)
    bx, by = m["luk_kraj"]
    s.osoba(clan, bx + rx * 40 + ux * 30, by + ry * 40 + uy * 30, smjer=kut, ia=ia)


def b_mlaz(s, cx, yv):
    """Položeni „B” mlaz sa srednjeg izlaza razdjelnice: dvije „B” cijevi, druga u obliku slova „S”."""
    x0, y = cx + RAZ_SREDNJI[0], yv
    s.vod([("M", x0, y), ("L", x0 + 120, y),
           ("C", x0 + 150, y, x0 + 160, y - 34, x0 + 182, y - 32),
           ("C", x0 + 206, y - 30, x0 + 206, y + 30, x0 + 232, y + 28),
           ("C", x0 + 252, y + 26, x0 + 262, y, x0 + 290, y),
           ("L", x0 + 350, y)], tip="B", spojnice=(120, 320), mlaznica=True)
    s.osoba("n1", x0 + 340, y - 36, smjer="desno")
    s.osoba("n2", x0 + 290, y + 44, smjer="desno")


# ---------------------------------------------------------------- Vježba 9
def skica_54(put):
    s = Skica(560, 250)
    x0, y0, x1, y1 = 20, 20, 470, 230       # tijelo vozila
    xa, xb = 300, 385                       # pregrade
    s.el.append(f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" fill="#fff" stroke="{CRNA}" stroke-width="1.6"/>')
    s.el.append(f'<path d="M{x1},{y0} L{x1 + 65},{y0 + 40} V{y1 - 40} L{x1},{y1}" fill="#fff" stroke="{CRNA}" '
                f'stroke-width="1.6" stroke-linejoin="round"/>')
    s.linija(xa, y0, xa, y1, sw=1.6)
    s.linija(xb, y0, xb, y1, sw=1.6)
    s.el.append(f'<text x="{(x0 + xa) / 2}" y="{(y0 + y1) / 2 + 38}" text-anchor="middle" font-family="{FONT}" '
                f'font-size="110" fill="#4a4a4a" letter-spacing="18">NV</text>')
    for i, (slovo, broj) in enumerate([("N", 2), ("N", 1), ("V", 1), ("V", 2)]):
        yy = y0 + 48 + i * 50
        s.el.append(f'<text x="{(xa + xb) / 2 - 4}" y="{yy}" text-anchor="middle" font-family="{FONT}" '
                    f'font-size="44" fill="{CRNA}">{slovo}<tspan font-size="26" dy="2">{broj}</tspan></text>')
    s.simbol("strojar", (xb + x1) / 2, y0 + 55, sirina=60)
    s.simbol("zapovjednik", (xb + x1) / 2, y1 - 55, sirina=60)
    s.spremi(put, "Skica 54 – Raspored mjesta vatrogasaca u navalnom vozilu")


def skica_55(put):
    s = Skica(620, 230)
    y = 80
    for i, sid in enumerate(["v1", "n1", "strojar", "zapovjednik"]):
        s.osoba(sid, 50 + i * 55, y, smjer="gore")
    s.osoba("v2", 50, y + 75, smjer="gore")
    s.osoba("n2", 105, y + 75, smjer="gore")
    s.simbol("navalno-vozilo", 440, 105, sirina=300)
    s.spremi(put, "Skica 55 – Postrojavanje odjeljenja navalnog vozila")


def _lijevo_vj9(s, nx, ny, s_vodnom_grupom=True):
    vozilo(s, nx, ny)
    usisni_vod_do_vozila(s, nx, ny)
    if s_vodnom_grupom:
        s.osoba("v1", nx + 25, ny - 105, smjer="desno")
        s.osoba("v2", nx + 25, ny - 62, smjer="desno")
    s.osoba("strojar", nx - NV_SIR / 2 - 12, ny + NV_VIS / 2 + 26, smjer="desno")


def skica_56(put):
    s = Skica(1010, 340)
    nx, ny, yv = 470, 175, 275
    _lijevo_vj9(s, nx, ny)
    kraj = b_vod_od_vozila(s, nx, ny, yv, 890)
    s.spojnica(*kraj, 1, 0, "B")
    razdjelnica(s, kraj[0], yv)
    stupac(s, 925, 40, [("c",), ("osoba", "n1", "desno"), ("mc",), ("c",), ("osoba", "n2", "desno"), ("c",)])
    s.spremi(put, "Skica 56 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi „Za navalu pripremi!”")


def skica_57(put):
    s = Skica(1110, 400)
    nx, ny, yv = 470, 230, 330
    _lijevo_vj9(s, nx, ny)
    kraj = b_vod_od_vozila(s, nx, ny, yv, 700)
    s.spojnica(*kraj, 1, 0, "B")
    s.osoba("zapovjednik", kraj[0] - 22, yv)
    cx = razdjelnica(s, kraj[0], yv)
    c_mlaz(s, cx, yv, "prvi")
    s.simbol("tlacna-c-cijev-kolut", cx, yv + 50)
    s.spremi(put, "Skica 57 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za prvi mlaz")


def skica_58(put):
    s = Skica(1110, 610)
    nx, ny, yv = 470, 230, 330
    _lijevo_vj9(s, nx, ny, s_vodnom_grupom=False)
    kraj = b_vod_od_vozila(s, nx, ny, yv, 700)
    s.spojnica(*kraj, 1, 0, "B")
    s.osoba("zapovjednik", kraj[0] - 22, yv)
    cx = razdjelnica(s, kraj[0], yv)
    c_mlaz(s, cx, yv, "prvi")
    c_mlaz(s, cx, yv, "drugi")
    s.simbol("tlacna-c-cijev-kolut", cx - 50, yv + 45)
    s.simbol("tlacna-c-cijev-kolut", cx - 50, yv + 63)
    s.spremi(put, "Skica 58 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za drugi mlaz")


# ---------------------------------------------------------------- Vježba 10
def skica_59(put):
    s = Skica(900, 420)
    nx, ny, yv = 420, 200, 300
    s.simbol("podzemni-hidrant", 190, 160)
    vozilo(s, nx, ny)
    s.osoba("v1", nx - 30, ny - 115, smjer="desno")
    s.osoba("v2", nx - 30, ny - 72, smjer="desno")
    s.osoba("strojar", nx - NV_SIR / 2 - 20, yv + 30, smjer="desno")
    kraj = b_vod_od_vozila(s, nx, ny, yv, 800)
    s.spojnica(*kraj, 1, 0, "B")
    cx = razdjelnica(s, kraj[0], yv)
    s.osoba("zapovjednik", cx - 10, yv + 85, smjer="gore")
    stupac(s, cx - 10, 60, [("c",), ("osoba", "n1", "desno"), ("mc",), ("c",), ("osoba", "n2", "desno"), ("c",)])
    s.spremi(put, "Skica 59 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi „Za navalu pripremi!”")


def _lijevo_hidrant_nv(s, hx, hy, nx, ny, vodna_gore=True):
    hidrant_do_vozila(s, hx, hy, nx, ny)
    vozilo(s, nx, ny)
    if vodna_gore:
        s.osoba("v1", nx - 30, ny - 115, smjer="desno")
        s.osoba("v2", nx - 30, ny - 72, smjer="desno")
    s.osoba("strojar", nx - NV_SIR / 2 - 20, ny + NV_VIS / 2 + 32, smjer="desno")


def skica_60(put):
    s = Skica(1090, 400)
    nx, ny, yv = 380, 190, 300
    _lijevo_hidrant_nv(s, 110, 160, nx, ny)
    kraj = b_vod_od_vozila(s, nx, ny, yv, 680)
    s.spojnica(*kraj, 1, 0, "B")
    s.osoba("zapovjednik", kraj[0] - 22, yv)
    cx = razdjelnica(s, kraj[0], yv)
    c_mlaz(s, cx, yv, "prvi")
    s.simbol("tlacna-c-cijev-kolut", cx, yv + 50)
    s.spremi(put, "Skica 60 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za prvi mlaz")


def skica_61(put):
    s = Skica(1090, 590)
    nx, ny, yv = 380, 190, 300
    _lijevo_hidrant_nv(s, 110, 160, nx, ny, vodna_gore=False)
    kraj = b_vod_od_vozila(s, nx, ny, yv, 680)
    s.spojnica(*kraj, 1, 0, "B")
    s.osoba("zapovjednik", kraj[0] - 22, yv)
    cx = razdjelnica(s, kraj[0], yv)
    c_mlaz(s, cx, yv, "prvi")
    c_mlaz(s, cx, yv, "drugi")
    s.simbol("tlacna-c-cijev-kolut", cx - 50, yv + 45)
    s.simbol("tlacna-c-cijev-kolut", cx - 50, yv + 63)
    s.spremi(put, "Skica 61 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za drugi mlaz")


# ---------------------------------------------------------------- Vježba 11
def skica_62(put):
    s = Skica(900, 460)
    nx, ny, yv = 420, 300, 380
    s.simbol("podzemni-hidrant", 190, 250)
    vozilo(s, nx, ny)
    s.osoba("strojar", nx - NV_SIR / 2 - 20, yv + 30, smjer="desno")
    kraj = b_vod_od_vozila(s, nx, ny, yv, 800)
    s.spojnica(*kraj, 1, 0, "B")
    cx = razdjelnica(s, kraj[0], yv)
    s.osoba("zapovjednik", cx - 10, yv + 60, smjer="gore")
    stupac(s, cx - 10, 20, [("osoba", "n1", "desno", True), ("osoba", "n2", "desno", True), ("c",),
                            ("osoba", "v1", "desno"), ("mc",), ("c",), ("osoba", "v2", "desno"), ("c",)])
    s.spremi(put, "Skica 62 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi „Za navalu pripremi!”")


def skica_63(put):
    s = Skica(1090, 420)
    nx, ny, yv = 380, 190, 300
    _lijevo_hidrant_nv(s, 110, 160, nx, ny, vodna_gore=False)
    kraj = b_vod_od_vozila(s, nx, ny, yv, 680)
    s.spojnica(*kraj, 1, 0, "B")
    s.osoba("zapovjednik", kraj[0] - 22, yv)
    cx = razdjelnica(s, kraj[0], yv)
    c_mlaz(s, cx, yv, "prvi", ia=True)
    s.simbol("tlacna-c-cijev-kolut", cx, yv + 40)
    s.osoba("v2", kraj[0] - 50, yv + 55, smjer="lijevo")
    s.osoba("v1", kraj[0] - 50, yv + 100, smjer="lijevo")
    s.spremi(put, "Skica 63 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za prvi mlaz")


def skica_64(put):
    s = Skica(1090, 600)
    nx, ny, yv = 380, 200, 310
    _lijevo_hidrant_nv(s, 110, 170, nx, ny, vodna_gore=False)
    kraj = b_vod_od_vozila(s, nx, ny, yv, 680)
    s.spojnica(*kraj, 1, 0, "B")
    s.osoba("zapovjednik", kraj[0] - 22, yv)
    cx = razdjelnica(s, kraj[0], yv)
    c_mlaz(s, cx, yv, "prvi", ia=True)
    c_mlaz(s, cx, yv, "drugi")
    s.simbol("tlacna-c-cijev-kolut", cx - 50, yv + 45)
    s.simbol("tlacna-c-cijev-kolut", cx - 50, yv + 63)
    s.spremi(put, "Skica 64 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za drugi mlaz")


# ---------------------------------------------------------------- Vježba 12
def skica_65(put):
    s = Skica(900, 420)
    nx, ny, yv = 420, 200, 300
    s.simbol("podzemni-hidrant", 190, 170)
    vozilo(s, nx, ny)
    s.osoba("v1", nx - 30, ny - 115, smjer="desno")
    s.osoba("v2", nx - 30, ny - 72, smjer="desno")
    s.osoba("strojar", nx - NV_SIR / 2 - 20, yv + 30, smjer="desno")
    kraj = b_vod_od_vozila(s, nx, ny, yv, 800)
    s.spojnica(*kraj, 1, 0, "B")
    cx = razdjelnica(s, kraj[0], yv)
    s.osoba("zapovjednik", cx - 10, yv + 85, smjer="gore")
    stupac(s, cx - 10, 60, [("b",), ("osoba", "n1", "desno"), ("mb",), ("b",), ("osoba", "n2", "desno"), ("b",)])
    s.spremi(put, "Skica 65 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi „Za navalu pripremi!”")


def skica_66(put):
    s = Skica(1080, 360)
    nx, ny, yv = 380, 190, 300
    _lijevo_hidrant_nv(s, 110, 160, nx, ny)
    kraj = b_vod_od_vozila(s, nx, ny, yv, 640)
    s.spojnica(*kraj, 1, 0, "B")
    s.osoba("zapovjednik", kraj[0] - 22, yv)
    cx = razdjelnica(s, kraj[0], yv)
    b_mlaz(s, cx, yv)
    s.simbol("tlacna-b-cijev-kolut", cx - 30, yv + 45)
    s.spremi(put, "Skica 66 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za prvi mlaz")


def skica_67(put):
    s = Skica(1090, 570)
    nx, ny, yv = 380, 190, 300
    _lijevo_hidrant_nv(s, 110, 160, nx, ny, vodna_gore=False)
    kraj = b_vod_od_vozila(s, nx, ny, yv, 640)
    s.spojnica(*kraj, 1, 0, "B")
    s.osoba("zapovjednik", kraj[0] - 22, yv)
    cx = razdjelnica(s, kraj[0], yv)
    b_mlaz(s, cx, yv)
    c_mlaz(s, cx, yv, "drugi")
    s.simbol("tlacna-b-cijev-kolut", cx - 50, yv + 45)
    s.simbol("tlacna-c-cijev-kolut", cx - 50, yv + 63)
    s.spremi(put, "Skica 67 – Položaj odjeljenja, sprava i opreme nakon izdane zapovijedi za drugi mlaz")


def build(korijen):
    m = Path(korijen) / "skice"
    skica_54(m / "09-skica-54.svg")
    skica_55(m / "09-skica-55.svg")
    skica_56(m / "09-skica-56.svg")
    skica_57(m / "09-skica-57.svg")
    skica_58(m / "09-skica-58.svg")
    skica_59(m / "10-skica-59.svg")
    skica_60(m / "10-skica-60.svg")
    skica_61(m / "10-skica-61.svg")
    skica_62(m / "11-skica-62.svg")
    skica_63(m / "11-skica-63.svg")
    skica_64(m / "11-skica-64.svg")
    skica_65(m / "12-skica-65.svg")
    skica_66(m / "12-skica-66.svg")
    skica_67(m / "12-skica-67.svg")


if __name__ == "__main__":
    build(Path(__file__).resolve().parent.parent)
