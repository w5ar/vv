#!/usr/bin/env python3
"""
Vatrogasni simboli – biblioteka SVG simbola za Vatrogasni vježbovnik.

Jedan izvor istine za sve simbole i skice:
  * SIMBOLI           – rječnik  id -> (širina, visina, naziv, svg-sadržaj)
  * Skica             – pomoćna klasa za crtanje skica od simbola
  * build()           – generira ../simboli/*.svg, ../simboli/simboli.svg (sprite)
                        i skice iz poglavlja 1.3 u ../skice/

Pokretanje (iz mape Vjezbe):   python3 alati/vatrogasni_simboli.py

Nova skica za drugu vježbu – primjer:

    from vatrogasni_simboli import Skica
    s = Skica(400, 200)
    s.osoba("zapovjednik", 40, 100, smjer="dolje")
    s.osoba("n1", 120, 100)
    s.simbol("tlacna-b-cijev", 250, 100, sirina=160)
    s.kota_h(140, 330, 140, "1,10m")
    s.spremi("skice/05-skica-01.svg")
"""
from pathlib import Path
import math
import os

FONT = "Arial, Helvetica, sans-serif"
CRNA = "#1a1a1a"
ZAPOVJEDNIK_BOJA = "#3a3a3a"

# Boje podloga taktičkih oznaka (slobodno prilagoditi)
BOJE = {
    "bijela": "#ffffff",
    "crvena": "#d62828",
    "plava": "#1f6fd1",
    "zuta": "#f7d117",
}

S = f'stroke="{CRNA}" fill="none" stroke-linecap="round" stroke-linejoin="round"'


# ---------------------------------------------------------------- osobe
def _osoba_slovo(slovo, broj):
    return (
        f'<circle cx="20" cy="20" r="18" fill="#fff" stroke="{CRNA}" stroke-width="1.5"/>'
        f'<text x="19.5" y="27.5" text-anchor="middle" font-family="{FONT}" '
        f'font-size="21" fill="{CRNA}">{slovo}<tspan font-size="12.5" dy="1">{broj}</tspan></text>'
    )


def _ljestve(x, y, w=12, h=24, n=4):
    out = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#fff" stroke="{CRNA}" stroke-width="1.5"/>'
    for i in range(1, n):
        yy = y + h * i / n
        out += f'<line x1="{x}" y1="{yy:.1f}" x2="{x + w}" y2="{yy:.1f}" stroke="{CRNA}" stroke-width="1.2"/>'
    return out


def _x_u_krugu(cx, cy, r, sw=1.5):
    d = r * math.sqrt(0.5)
    return (
        f'<line x1="{cx - d:.2f}" y1="{cy - d:.2f}" x2="{cx + d:.2f}" y2="{cy + d:.2f}" stroke="{CRNA}" stroke-width="{sw}"/>'
        f'<line x1="{cx - d:.2f}" y1="{cy + d:.2f}" x2="{cx + d:.2f}" y2="{cy - d:.2f}" stroke="{CRNA}" stroke-width="{sw}"/>'
    )


OSOBE = {
    "zapovjednik": ("Zapovjednik",
        f'<circle cx="20" cy="20" r="18" fill="{ZAPOVJEDNIK_BOJA}" stroke="{ZAPOVJEDNIK_BOJA}" stroke-width="1.5"/>'),
    "teklic": ("Teklić",
        f'<circle cx="20" cy="20" r="18" fill="#fff" stroke="{CRNA}" stroke-width="1.5"/>'
        f'<circle cx="20" cy="20" r="2.2" fill="{CRNA}"/>'),
    "strojar": ("Strojar",
        f'<circle cx="20" cy="20" r="18" fill="#fff" stroke="{CRNA}" stroke-width="1.5"/>' + _x_u_krugu(20, 20, 18)),
    "n1": ("Vođa navalne grupe", _osoba_slovo("N", 1)),
    "n2": ("Član navalne grupe", _osoba_slovo("N", 2)),
    "v1": ("Vođa vodne grupe", _osoba_slovo("V", 1)),
    "v2": ("Član vodne grupe", _osoba_slovo("V", 2)),
    "c1": ("Vođa cijevne grupe", _osoba_slovo("C", 1)),
    "c2": ("Član cijevne grupe", _osoba_slovo("C", 2)),
    "zapovjednik-polozaj": ("Položaj zapovjednika pri izdavanju zapovijedi",
        f'<circle cx="20" cy="20" r="18" fill="none" stroke="{CRNA}" stroke-width="1.5" stroke-dasharray="5 4"/>'),
}

# ---------------------------------------------------------------- taktičke oznake
def _oznaka(boja, unutra):
    return (f'<rect x="1" y="1" width="48" height="48" fill="{BOJE[boja]}" stroke="{CRNA}" stroke-width="1.5"/>'
            + unutra)


def _krug_vodje(boja):  # gornja polovica u boji podloge, donja crna
    return (f'<circle cx="25" cy="25" r="19" fill="{BOJE[boja]}" stroke="{CRNA}" stroke-width="1.5"/>'
            f'<path d="M6,25 A19,19 0 0 0 44,25 Z" fill="{CRNA}" stroke="{CRNA}" stroke-width="1.5"/>')


def _krug_clana(boja):
    return f'<circle cx="25" cy="25" r="19" fill="{BOJE[boja]}" stroke="{CRNA}" stroke-width="1.5"/>'


OZNAKE = {
    "oznaka-zapovjednik": ("Zapovjednik – podloga bijele boje", "bijela",
        f'<circle cx="25" cy="25" r="19" fill="{ZAPOVJEDNIK_BOJA}" stroke="{ZAPOVJEDNIK_BOJA}" stroke-width="1.5"/>'),
    "oznaka-teklic": ("Teklić – podloga bijele boje", "bijela",
        f'<circle cx="25" cy="25" r="19" fill="#fff" stroke="{CRNA}" stroke-width="1.5"/><circle cx="25" cy="25" r="2.4" fill="{CRNA}"/>'),
    "oznaka-strojar": ("Strojar – podloga bijele boje", "bijela",
        f'<circle cx="25" cy="25" r="19" fill="#fff" stroke="{CRNA}" stroke-width="1.5"/>' + _x_u_krugu(25, 25, 19)),
    "oznaka-n1": ("Vođa navalne grupe – podloga crvene boje", "crvena", _krug_vodje("crvena")),
    "oznaka-n2": ("Član navalne grupe – podloga crvene boje", "crvena", _krug_clana("crvena")),
    "oznaka-v1": ("Vođa vodne grupe – podloga plave boje", "plava", _krug_vodje("plava")),
    "oznaka-v2": ("Član vodne grupe – podloga plave boje", "plava", _krug_clana("plava")),
    "oznaka-c1": ("Vođa cijevne grupe – podloga žute boje", "zuta", _krug_vodje("zuta")),
    "oznaka-c2": ("Član cijevne grupe – podloga žute boje", "zuta", _krug_clana("zuta")),
}

# ---------------------------------------------------------------- oprema
def _srafura(x0, x1, y0, y1, korak=5):
    out, x = "", x0
    while x + (y1 - y0) <= x1:
        out += f'<line x1="{x}" y1="{y1}" x2="{x + (y1 - y0)}" y2="{y0}" stroke="{CRNA}" stroke-width="1"/>'
        x += korak
    return out


def _tick_v(x, y, h=5, sw=1.5):
    return f'<line x1="{x}" y1="{y - h}" x2="{x}" y2="{y + h}" stroke="{CRNA}" stroke-width="{sw}"/>'


def _razdjelnica(grane):
    out = f'<g {S} stroke-width="1.5"><line x1="2" y1="20" x2="40" y2="20"/>' + _tick_v(2, 20)
    for gy in grane:
        out += f'<line x1="40" y1="20" x2="72" y2="{gy}"/>' + _tick_v(72, gy, 4)
    return out + "</g>"


def _uze():
    # dvije kružnice koje se sijeku (osmica)
    return (f'<path d="M10.31,23.95 A11,11 0 1 1 19.69,23.95 A12,12 0 1 1 10.31,23.95 Z" '
            f'fill="#fff" stroke="{CRNA}" stroke-width="1.5"/>')


OPREMA = {
    "usisna-cijev": ("Usisna cijev", 120, 22,
        f'<rect x="2" y="2" width="5" height="18" fill="#fff" stroke="{CRNA}" stroke-width="1.5"/>'
        f'<rect x="113" y="2" width="5" height="18" fill="#fff" stroke="{CRNA}" stroke-width="1.5"/>'
        f'<rect x="7" y="6" width="106" height="10" fill="#fff" stroke="{CRNA}" stroke-width="1.5"/>'
        f'<rect x="24" y="6" width="74" height="10" fill="none" stroke="{CRNA}" stroke-width="1.2"/>'
        + _srafura(26, 98, 6, 16)),
    "tlacna-b-cijev": ("Tlačna „B” cijev", 120, 12,
        f'<g {S}><line x1="2" y1="6" x2="118" y2="6" stroke-width="2.6"/>{_tick_v(2, 6, 5, 1.6)}{_tick_v(118, 6, 5, 1.6)}</g>'),
    "tlacna-c-cijev": ("Tlačna „C” cijev", 120, 12,
        f'<g {S}><line x1="2" y1="6" x2="118" y2="6" stroke-width="1.3"/>{_tick_v(2, 6, 5, 1.3)}{_tick_v(118, 6, 5, 1.3)}</g>'),
    "tlacna-b-cijev-kolut": ("Tlačna „B” cijev u kolutu", 72, 10,
        f'<rect x="1" y="2" width="70" height="6" fill="#fff" stroke="{CRNA}" stroke-width="1.3"/>'
        + "".join(f'<line x1="{1 + 7 * i}" y1="2" x2="{1 + 7 * i}" y2="8" stroke="{CRNA}" stroke-width="1.1"/>' for i in range(1, 10))),
    "tlacna-c-cijev-kolut": ("Tlačna „C” cijev u kolutu", 72, 10,
        f'<rect x="1" y="2" width="70" height="6" fill="#fff" stroke="{CRNA}" stroke-width="1.3"/>'),
    "trodijelna-razdjelnica": ("Trodijelna razdjelnica", 76, 40, _razdjelnica([4, 20, 36])),
    "dvodijelna-razdjelnica": ("Dvodijelna razdjelnica", 76, 40, _razdjelnica([5, 35])),
    "obicna-b-mlaznica": ("Obična „B” mlaznica", 76, 12,
        f'<g {S}><line x1="2" y1="6" x2="62" y2="6" stroke-width="2.6"/>{_tick_v(2, 6, 5, 1.6)}</g>'
        f'<path d="M60,1.5 L74,6 L60,10.5 Z" fill="{CRNA}" stroke="{CRNA}" stroke-width="1" stroke-linejoin="round"/>'),
    "obicna-c-mlaznica": ("Obična „C” mlaznica", 76, 12,
        f'<g {S} stroke-width="1.3"><line x1="2" y1="6" x2="73" y2="6"/>{_tick_v(2, 6, 5, 1.3)}'
        f'<path d="M66,2.5 L73.5,6 L66,9.5"/></g>'),
    "mlaznica-za-pjenu": ("Mlaznica za pjenu", 76, 32,
        f'<path d="M2,11 H58 V3 L74,16 L58,29 V21 H2 Z" fill="#fff" stroke="{CRNA}" stroke-width="1.5" stroke-linejoin="round"/>'),
    "medumjesalica": ("Međumješalica", 80, 30,
        f'<g {S} stroke-width="1.5"><line x1="2" y1="17" x2="28" y2="17"/>{_tick_v(2, 17, 4)}'
        f'<ellipse cx="40" cy="17" rx="12" ry="11" fill="#fff"/>'
        f'<line x1="52" y1="17" x2="78" y2="17"/>{_tick_v(78, 17, 4)}'
        f'<line x1="39" y1="18" x2="50" y2="3"/></g>'),
    "posuda-za-pjenilo": ("Posuda za pjenilo", 30, 44,
        f'<path d="M2,2 H18 L28,18 V42 H2 Z" fill="#fff" stroke="{CRNA}" stroke-width="1.5" stroke-linejoin="round"/>'),
    "sabirnica": ("Sabirnica", 50, 40,
        f'<g {S} stroke-width="1.5"><line x1="20" y1="2" x2="30" y2="2"/><line x1="25" y1="2" x2="25" y2="19"/>'
        f'<path d="M8,37 A17,17 0 0 1 42,37"/><line x1="2" y1="37" x2="12" y2="37"/><line x1="38" y1="37" x2="48" y2="37"/></g>'),
    "kljuc-za-spojnice": ("Ključ za spojnice", 60, 14,
        f'<path d="M2,11 C2,2 13,2 13,11 L47,11 C47,2 58,2 58,11" {S} stroke-width="1.5"/>'),
    "usisna-sitka": ("Usisna sitka", 52, 66,
        f'<path d="M2,44 V2 H10 V12 H20 V2 H32 V12 H42 V2 H50 V44 L40,56 H12 Z" fill="#fff" stroke="{CRNA}" stroke-width="1.5" stroke-linejoin="round"/>'
        f'<line x1="2" y1="21" x2="50" y2="21" stroke="{CRNA}" stroke-width="1.3"/>'
        f'<line x1="2" y1="24.5" x2="50" y2="24.5" stroke="{CRNA}" stroke-width="1.3"/>'
        f'<rect x="2" y="56" width="48" height="8" fill="#fff" stroke="{CRNA}" stroke-width="1.5"/>'),
    "prijenosna-pumpa": ("Prijenosna vatrogasna pumpa (MP)", 112, 50,
        f'<g {S} stroke-width="1.5"><line x1="1" y1="2" x2="111" y2="2"/><line x1="1" y1="48" x2="111" y2="48"/>'
        f'<line x1="13" y1="2" x2="13" y2="48"/><line x1="99" y1="2" x2="99" y2="48"/></g>'
        f'<text x="56" y="37" text-anchor="middle" font-family="{FONT}" font-size="31" fill="#4a4a4a">MP</text>'),
    "prijelazna-spojnica-bc": ("Prijelazna spojnica B/C", 40, 40,
        f'<g {S} stroke-width="1.5"><circle cx="20" cy="20" r="18" fill="#fff"/><ellipse cx="20" cy="20" rx="7.5" ry="6"/>'
        f'<line x1="20" y1="2" x2="20" y2="14"/><line x1="20" y1="26" x2="20" y2="38"/>'
        f'<line x1="2" y1="20" x2="12.5" y2="20"/><line x1="27.5" y1="20" x2="38" y2="20"/></g>'),
    "dvodijelni-hidrantski-nastavak": ("Dvodijelni hidrantski nastavak", 52, 48,
        f'<g {S} stroke-width="1.5"><line x1="26" y1="8" x2="26" y2="45"/><line x1="20" y1="45" x2="32" y2="45"/>'
        f'<line x1="26" y1="8" x2="4" y2="15"/><line x1="26" y1="8" x2="48" y2="15"/>'
        f'<line x1="2.8" y1="11.2" x2="5.2" y2="18.8"/><line x1="46.8" y1="18.8" x2="49.2" y2="11.2"/>'
        f'<line x1="13.6" y1="11.3" x2="12.4" y2="7.5"/><line x1="10.5" y1="7.8" x2="14.3" y2="6.6"/>'
        f'<line x1="38.4" y1="11.3" x2="39.6" y2="7.5"/><line x1="37.7" y1="6.6" x2="41.5" y2="7.8"/></g>'),
    "cijevni-drzac": ("Cijevni držač", 40, 46,
        f'<g {S} stroke-width="1.5"><circle cx="17" cy="29" r="15" fill="#fff"/><line x1="17" y1="29" x2="27" y2="18"/>'
        f'<path d="M27,18 C23,12 25,4 31,3 C34,2.6 36,4 36,6"/></g>'),
    "kljuc-podzemni-hidrant": ("Ključ za podzemni hidrant", 40, 50,
        f'<g {S} stroke-width="1.5"><line x1="2" y1="3" x2="28" y2="3"/><line x1="14" y1="3" x2="14" y2="48"/>'
        f'<line x1="28" y1="3" x2="34" y2="13"/></g>'),
    "izolacijski-aparat": ("Izolacijski aparat", 40, 66,
        f'<circle cx="20" cy="20" r="18" fill="#fff" stroke="{CRNA}" stroke-width="1.5"/>'
        f'<text x="20" y="27.5" text-anchor="middle" font-family="{FONT}" font-size="20" fill="{CRNA}">IA</text>'
        + _ljestve(14, 38, 12, 26)),
    "uze-s-torbicom": ("Uže s torbicom za usisnu sitku", 30, 50, _uze()),
    "podzemni-hidrant": ("Podzemni hidrant", 44, 44,
        f'<rect x="2" y="2" width="40" height="40" fill="none" stroke="{CRNA}" stroke-width="1.2" stroke-dasharray="3 2.5"/>'
        f'<circle cx="22" cy="22" r="14" fill="#fff" stroke="{CRNA}" stroke-width="1.5"/><circle cx="22" cy="22" r="1.8" fill="{CRNA}"/>'),
    "navalno-vozilo": ("Navalno vozilo (NV)", 120, 60,
        f'<g {S} stroke-width="1.5"><rect x="2" y="2" width="88" height="56" fill="#fff"/><path d="M90,2 L118,12 V48 L90,58" fill="#fff"/></g>'
        f'<text x="46" y="43" text-anchor="middle" font-family="{FONT}" font-size="36" fill="#4a4a4a">NV</text>'),
    "torbica-s-povezicama": ("Torbica s povezicama za cijevi", 70, 34,
        f'<g {S} stroke-width="1.5"><rect x="2" y="2" width="66" height="30" fill="#fff"/>'
        f'<line x1="2" y1="2" x2="20" y2="14"/><line x1="2" y1="32" x2="20" y2="20"/>'
        f'<line x1="68" y1="2" x2="50" y2="14"/><line x1="68" y1="32" x2="50" y2="20"/>'
        f'<line x1="20" y1="14" x2="50" y2="14"/><line x1="20" y1="20" x2="50" y2="20"/>'
        f'<line x1="20" y1="14" x2="20" y2="20"/><line x1="50" y1="14" x2="50" y2="20"/></g>'),
    "n1-ia": ("Vođa navalne grupe s izolacijskim aparatom", 40, 66, _osoba_slovo("N", 1) + _ljestve(14, 38, 12, 26)),
    "n2-ia": ("Član navalne grupe s izolacijskim aparatom", 40, 66, _osoba_slovo("N", 2) + _ljestve(14, 38, 12, 26)),
}

# ---------------------------------------------------------------- elementi skica
# Mali grafički elementi koji se u skicama postavljaju (i rotiraju) uz osobe i cijevne vodove.
ELEMENTI = {
    "smjer": ("Smjer okrenutosti vatrogasca (crtica uz krug)", 14, 4,
        f'<line x1="0" y1="2" x2="14" y2="2" stroke="{CRNA}" stroke-width="1.8"/>'),
    "spojnica-b": ("Spojnica na „B” cijevnom vodu", 4, 14,
        f'<line x1="2" y1="1" x2="2" y2="13" stroke="{CRNA}" stroke-width="1.4"/>'),
    "spojnica-c": ("Spojnica na „C” cijevnom vodu", 4, 12,
        f'<line x1="2" y1="1" x2="2" y2="11" stroke="{CRNA}" stroke-width="1.4"/>'),
    "vrh-mlaznice-b": ("„B” mlaznica na kraju položenog voda", 13, 12,
        f'<path d="M0.5,1 L12.5,6 L0.5,11 Z" fill="{CRNA}" stroke="{CRNA}" stroke-width="1" stroke-linejoin="round"/>'),
    "vrh-mlaznice-c": ("„C” mlaznica na kraju položenog voda", 13, 12,
        f'<path d="M0.5,1 L12.5,6 L0.5,11" fill="none" stroke="{CRNA}" stroke-width="1.4" stroke-linejoin="round"/>'),
    "strelica-kote": ("Strelica kote (mjere)", 10, 7,
        f'<path d="M0,0.5 L10,3.5 L0,6.5 Z" fill="{CRNA}"/>'),
}

# ---------------------------------------------------------------- zbirni rječnik
SIMBOLI = {}
for k, (naziv, svg) in OSOBE.items():
    SIMBOLI[k] = (40, 40, naziv, svg)
for k, (naziv, _boja, unutra) in OZNAKE.items():
    SIMBOLI[k] = (50, 50, naziv, _oznaka(_boja, unutra))
for k, (naziv, w, h, svg) in OPREMA.items():
    SIMBOLI[k] = (w, h, naziv, svg)
for k, (naziv, w, h, svg) in ELEMENTI.items():
    SIMBOLI[k] = (w, h, naziv, svg)


def svg_simbola(sid, mjerilo=1.0):
    w, h, naziv, tijelo = SIMBOLI[sid]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w * mjerilo:g}" height="{h * mjerilo:g}" '
            f'viewBox="0 0 {w} {h}" role="img" aria-label="{naziv}">\n<title>{naziv}</title>\n{tijelo}\n</svg>\n')


def symbol_def(sid):
    w, h, naziv, tijelo = SIMBOLI[sid]
    return f'<symbol id="{sid}" viewBox="0 0 {w} {h}"><title>{naziv}</title>{tijelo}</symbol>'


def sprite():
    defs = "\n".join(symbol_def(k) for k in SIMBOLI)
    return ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="display:none">\n'
            f'{defs}\n</svg>\n')


# ---------------------------------------------------------------- skice
SMJEROVI = {"gore": (0, -1), "dolje": (0, 1), "lijevo": (-1, 0), "desno": (1, 0)}


class Skica:
    """Skica sastavljena od simbola. Koordinate su središta simbola."""

    def __init__(self, sirina, visina):
        self.w, self.h = sirina, visina
        self.korisceni = []
        self.el = []

    def _koristi(self, sid):
        if sid not in self.korisceni:
            self.korisceni.append(sid)

    def simbol(self, sid, x, y, sirina=None, rotacija=0):
        w, h, *_ = SIMBOLI[sid]
        m = (sirina / w) if sirina else 1.0
        self._koristi(sid)
        self.el.append(("SIMBOL", sid, x, y, w * m, h * m, rotacija))

    def _postavi(self, sid, x, y, ux, uy, pomak=0.0):
        """Element (smjer, spojnica, vrh mlaznice, strelica) u točki, zakrenut prema (ux, uy)."""
        kut = math.degrees(math.atan2(uy, ux))
        self.simbol(sid, x + ux * pomak, y + uy * pomak, rotacija=round(kut, 2))

    def osoba(self, sid, x, y, smjer=None, r=18):
        """Osoba (krug promjera 40). smjer = gore/dolje/lijevo/desno ili kut u stupnjevima
        (0 = desno, -90 = gore, 90 = dolje) – crtica okrenutosti."""
        if smjer is not None:
            if isinstance(smjer, str):
                dx, dy = SMJEROVI[smjer]
            else:
                dx, dy = math.cos(math.radians(smjer)), math.sin(math.radians(smjer))
            self._postavi("smjer", x + dx * (r + 7), y + dy * (r + 7), dx, dy)
        self.simbol(sid, x, y)

    # ---- cijevni vodovi -------------------------------------------------
    def vod(self, segmenti, tip="B", spojnice=(), pocetak=False, kraj=False, mlaznica=False):
        """Cijevni vod po putanji.
        segmenti: [("M",x,y), ("L",x,y), ("Q",cx,cy,x,y), ("C",c1x,c1y,c2x,c2y,x,y), ...]
        tip: "B" (deblja linija) ili "C" (tanja)
        spojnice: udaljenosti (px) duž voda na kojima se crta crtica spojnice;
                  vrijednost između 0 i 1 tumači se kao udio ukupne duljine
        pocetak/kraj: crtica spojnice na početku/kraju
        mlaznica: strelica (mlaznica) na kraju voda
        Vraća (x, y) krajnje točke."""
        sw = 2.6 if tip == "B" else 1.3
        d, tocke = "", []
        tx = ty = 0.0
        for seg in segmenti:
            k, *v = seg
            if k == "M":
                tx, ty = v
                d += f"M{tx:.1f},{ty:.1f} "
                tocke.append((tx, ty))
            elif k == "L":
                x, y = v
                for i in range(1, 11):
                    t = i / 10
                    tocke.append((tx + (x - tx) * t, ty + (y - ty) * t))
                d += f"L{x:.1f},{y:.1f} "
                tx, ty = x, y
            elif k == "Q":
                cx, cy, x, y = v
                for i in range(1, 41):
                    t = i / 40
                    tocke.append(((1 - t) ** 2 * tx + 2 * (1 - t) * t * cx + t * t * x,
                                  (1 - t) ** 2 * ty + 2 * (1 - t) * t * cy + t * t * y))
                d += f"Q{cx:.1f},{cy:.1f} {x:.1f},{y:.1f} "
                tx, ty = x, y
            elif k == "C":
                c1x, c1y, c2x, c2y, x, y = v
                for i in range(1, 61):
                    t = i / 60
                    a, b, c, e = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3
                    tocke.append((a * tx + b * c1x + c * c2x + e * x, a * ty + b * c1y + c * c2y + e * y))
                d += f"C{c1x:.1f},{c1y:.1f} {c2x:.1f},{c2y:.1f} {x:.1f},{y:.1f} "
                tx, ty = x, y
        self.el.append(f'<path d="{d.strip()}" fill="none" stroke="{CRNA}" stroke-width="{sw}" '
                       f'stroke-linecap="butt" stroke-linejoin="round"/>')
        # duljine
        cum = [0.0]
        for (x1, y1), (x2, y2) in zip(tocke, tocke[1:]):
            cum.append(cum[-1] + math.hypot(x2 - x1, y2 - y1))
        L = cum[-1]

        def tocka(s):
            s = max(0.0, min(L, s))
            for i in range(1, len(cum)):
                if cum[i] >= s:
                    (x1, y1), (x2, y2) = tocke[i - 1], tocke[i]
                    seg = (cum[i] - cum[i - 1]) or 1
                    t = (s - cum[i - 1]) / seg
                    ux, uy = (x2 - x1) / seg, (y2 - y1) / seg
                    return x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, ux, uy
            (x1, y1), (x2, y2) = tocke[-2], tocke[-1]
            seg = math.hypot(x2 - x1, y2 - y1) or 1
            return x2, y2, (x2 - x1) / seg, (y2 - y1) / seg

        def crtica(s):
            x, y, ux, uy = tocka(s)
            self.spojnica(x, y, ux, uy, tip)

        for s in spojnice:
            crtica(s * L if 0 < s < 1 else s)
        if pocetak:
            crtica(0)
        if kraj:
            crtica(L)
        if mlaznica:
            x, y, ux, uy = tocka(L)
            self._postavi("vrh-mlaznice-b" if tip == "B" else "vrh-mlaznice-c", x, y, ux, uy, pomak=-6)
        return tocke[-1]

    def spojnica(self, x, y, ux, uy, tip="B"):
        """Crtica spojnice okomito na smjer (ux, uy)."""
        self._postavi("spojnica-b" if tip == "B" else "spojnica-c", x, y, ux, uy)

    def hidrant_s_nastavkom(self, hx, hy, kljuc=True):
        """Podzemni hidrant s priključenim hidrantskim nastavkom (izlazi lijevo) i,
        po želji, postavljenim ključem. Vraća točku donjeg izlaza nastavka (početak B voda)."""
        self.simbol("podzemni-hidrant", hx, hy)
        self.simbol("dvodijelni-hidrantski-nastavak", hx - 21, hy, rotacija=-90)
        if kljuc:
            self.simbol("kljuc-podzemni-hidrant", hx + 6, hy - 23)
        return hx - 30, hy + 22

    def linija(self, x1, y1, x2, y2, sw=0.8):
        self.el.append(f'<line x1="{x1:g}" y1="{y1:g}" x2="{x2:g}" y2="{y2:g}" stroke="{CRNA}" stroke-width="{sw}"/>')

    def tekst(self, x, y, t, vel=11, anchor="middle"):
        self.el.append(f'<text x="{x:g}" y="{y:g}" text-anchor="{anchor}" font-family="{FONT}" '
                       f'font-size="{vel}" fill="{CRNA}">{t}</text>')

    def _kotna_linija(self, x1, y1, x2, y2):
        self.el.append(f'<line x1="{x1:g}" y1="{y1:g}" x2="{x2:g}" y2="{y2:g}" stroke="{CRNA}" stroke-width="0.8"/>')
        L = math.hypot(x2 - x1, y2 - y1) or 1
        ux, uy = (x2 - x1) / L, (y2 - y1) / L
        self._postavi("strelica-kote", x2, y2, ux, uy, pomak=-5)
        self._postavi("strelica-kote", x1, y1, -ux, -uy, pomak=-5)

    def kota_h(self, x1, x2, y, natpis, od_y=None, natpis_ispod=True):
        """Horizontalna kota između x1 i x2 na visini y; od_y = odakle kreću pomoćne linije."""
        if od_y is not None:
            for x in (x1, x2):
                self.el.append(f'<line x1="{x:g}" y1="{od_y:g}" x2="{x:g}" y2="{y + 4:g}" stroke="{CRNA}" '
                               f'stroke-width="0.6" stroke-dasharray="2 2"/>')
        self._kotna_linija(x1, y, x2, y)
        self.tekst((x1 + x2) / 2, y + 14 if natpis_ispod else y - 5, natpis)

    def kota_v(self, x, y1, y2, natpis, od_x=None, natpis_desno=True):
        if od_x is not None:
            for y in (y1, y2):
                self.el.append(f'<line x1="{od_x:g}" y1="{y:g}" x2="{x + 4:g}" y2="{y:g}" stroke="{CRNA}" '
                               f'stroke-width="0.6" stroke-dasharray="2 2"/>')
        self._kotna_linija(x, y1, x, y2)
        if natpis_desno:
            self.tekst(x + 6, (y1 + y2) / 2 + 4, natpis, anchor="start")
        else:
            self.tekst(x - 6, (y1 + y2) / 2 + 4, natpis, anchor="end")

    def svg(self, naslov="", simboli=None):
        """simboli = relativna putanja do mape simboli/ -> simboli se POVEZUJU (<image href>);
        simboli = None -> simboli se UGRAĐUJU u datoteku (<symbol> + <use>)."""
        dijelovi = []
        for e in self.el:
            if isinstance(e, tuple):
                _, sid, x, y, w, h, rot = e
                if simboli is not None:
                    href = f"{simboli}/{sid}.svg"
                    unutra = (f'<image href="{href}" xlink:href="{href}" x="{-w / 2:g}" y="{-h / 2:g}" '
                              f'width="{w:g}" height="{h:g}"/>')
                else:
                    unutra = (f'<use href="#{sid}" xlink:href="#{sid}" x="{-w / 2:g}" y="{-h / 2:g}" '
                              f'width="{w:g}" height="{h:g}"/>')
                tr = f"translate({x:g},{y:g})" + (f" rotate({rot:g})" if rot else "")
                dijelovi.append(f'<g transform="{tr}">{unutra}</g>')
            else:
                dijelovi.append(e)
        defs = "" if simboli is not None else "<defs>" + "".join(symbol_def(s) for s in self.korisceni) + "</defs>\n"
        return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
                f'width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}" role="img" aria-label="{naslov}">\n'
                f'<title>{naslov}</title>\n{defs}'
                f'<rect width="{self.w}" height="{self.h}" fill="#fff"/>\n' + "\n".join(dijelovi) + "\n</svg>\n")

    def spremi(self, putanja, naslov="", mapa_simbola=None, ugradjeno=True):
        """Sprema skicu s POVEZANIM simbolima (iz mape simboli/).
        Ako je ugradjeno=True, sprema i samostalnu kopiju u podmapu 'ugradjeno/'
        (za prikaz u markdownu – preglednici u <img> ne učitavaju povezane datoteke)."""
        putanja = Path(putanja).resolve()
        mapa_simbola = Path(mapa_simbola or Path(__file__).resolve().parent.parent / "simboli").resolve()
        putanja.parent.mkdir(parents=True, exist_ok=True)
        rel = os.path.relpath(mapa_simbola, putanja.parent).replace(os.sep, "/")
        nedostaju = [s for s in self.korisceni if not (mapa_simbola / f"{s}.svg").exists()]
        for s in nedostaju:  # simbol koji ne postoji u mapi simboli/ – dodaj ga
            (mapa_simbola / f"{s}.svg").write_text(svg_simbola(s), encoding="utf-8")
            print(f"  dodan simbol: simboli/{s}.svg")
        putanja.write_text(self.svg(naslov, simboli=rel), encoding="utf-8")
        if ugradjeno:
            u = putanja.parent / "ugradjeno" / putanja.name
            u.parent.mkdir(parents=True, exist_ok=True)
            u.write_text(self.svg(naslov), encoding="utf-8")


def mlaz(s, start, kut, strana="lijevo", tip="C", d1=150, d_luk=60, luk_duljina=30, luk_visina=38,
         d2=35, d3=40):
    """Položeni mlaz od razdjelnice: prva cijev (d1) – spojnica – druga cijev s lukom – mlaznica.
    start: izlaz razdjelnice; kut: smjer u stupnjevima (0 = desno, -40 = gore-desno);
    strana: na koju je stranu (u smjeru polaganja) izbačen luk.
    Vraća rječnik točaka: vrh (mlaznica), luk_kraj, smjer, lijevo, desno (jedinični vektori)."""
    ux, uy = math.cos(math.radians(kut)), math.sin(math.radians(kut))
    lijevo = (uy, -ux)
    desno = (-uy, ux)
    n = lijevo if strana == "lijevo" else desno
    x0, y0 = start
    P = lambda t: (x0 + ux * t, y0 + uy * t)
    A, B = P(d1 + d_luk), P(d1 + d_luk + luk_duljina)
    h = luk_visina * 1.7
    c1 = (A[0] + n[0] * h - ux * 22, A[1] + n[1] * h - uy * 22)
    c2 = (B[0] + n[0] * h + ux * 22, B[1] + n[1] * h + uy * 22)
    T = P(d1 + d_luk + luk_duljina + d2)
    V = P(d1 + d_luk + luk_duljina + d2 + d3)
    s.vod([("M", x0, y0), ("L", *P(d1)), ("L", *A), ("C", *c1, *c2, *B), ("L", *T), ("L", *V)],
          tip=tip, mlaznica=True)
    # crtice spojnica (prva cijev / druga cijev / mlaznica)
    for p in (P(d1), T):
        s.spojnica(*p, ux, uy, tip)
    return {"vrh": V, "luk_kraj": B, "smjer": (ux, uy), "lijevo": lijevo, "desno": desno}


# ---------------------------------------------------------------- skice poglavlja 1.3.1
R = 20      # polumjer osobe
RAST = 50   # razmak središta u vrsti (rastojanje 0,10 m)
ODST = 80   # razmak središta vrsta (odstojanje 1,10 m)
KOL = 80    # razmak središta u koloni (odstojanje 1,10 m)


def _dvije_vrste(s, x0, y_prednja, prednja, straznja, pomak_straznje=0):
    for i, sid in enumerate(prednja):
        s.osoba(sid, x0 + i * RAST, y_prednja)
    for i, sid in enumerate(straznja):
        s.osoba(sid, x0 + (i + pomak_straznje) * RAST, y_prednja - ODST)


def skice_postrojavanja(mapa):
    m = Path(mapa)

    # Skica 1 – 9 vatrogasaca, dvovrsni stroj
    s = Skica(420, 200)
    x0, y = 170, 120
    _dvije_vrste(s, x0, y, ["strojar", "n1", "v1", "c1"], ["teklic", "n2", "v2", "c2"])
    s.osoba("zapovjednik", x0 - 90 - 0, y, smjer="dolje")
    s.kota_v(x0 + 3 * RAST + 45, y - R, y - ODST + R, "1,10m", od_x=x0 + 3 * RAST + R)
    s.kota_h(x0 - 90 + R, x0 - R, y + 50, "1,10m", od_y=y)
    s.kota_h(x0 + R, x0 + RAST - R, y + 50, "0,10m", od_y=y)
    s.spremi(m / "00-3-skica-01.svg", "Skica 1 – Postrojavanje odjeljenja od 9 vatrogasaca u dvovrsnom stroju")

    # Skica 2 – 6 vatrogasaca
    s = Skica(370, 200)
    x0, y = 170, 120
    _dvije_vrste(s, x0, y, ["strojar", "n1", "v1"], ["n2", "v2"], pomak_straznje=1)
    s.osoba("zapovjednik", x0 - 90, y, smjer="dolje")
    s.kota_v(x0 + 2 * RAST + 45, y - R, y - ODST + R, "1,10m", od_x=x0 + 2 * RAST + R)
    s.kota_h(x0 - 90 + R, x0 - R, y + 50, "1,10m", od_y=y)
    s.kota_h(x0 + R, x0 + RAST - R, y + 50, "0,10m", od_y=y)
    s.spremi(m / "00-3-skica-02.svg", "Skica 2 – Postrojavanje odjeljenja od 6 vatrogasaca u dvovrsnom stroju")

    # Skica 3 – 3 vatrogasca
    s = Skica(260, 200)
    x0, y = 150, 120
    s.osoba("strojar", x0, y)
    s.osoba("n2", x0, y - ODST)
    s.osoba("n1", x0 - 90, y, smjer="dolje")
    s.kota_v(x0 + 45, y - R, y - ODST + R, "1,10m", od_x=x0 + R)
    s.kota_h(x0 - 90 + R, x0 - R, y + 50, "1,10m", od_y=y)
    s.spremi(m / "00-3-skica-03.svg", "Skica 3 – Postrojavanje odjeljenja od 3 vatrogasca u dvovrsnom stroju")

    # Skica 4 – pozicije 9 vatrogasaca pri izdavanju zapovijedi
    s = Skica(330, 330)
    x0, y = 70, 150
    _dvije_vrste(s, x0, y, ["strojar", "n1", "v1", "c1"], ["teklic", "n2", "v2", "c2"])
    s.kota_v(x0 + 3 * RAST + 45, y - R, y - ODST + R, "1,10m", od_x=x0 + 3 * RAST + R)
    s.kota_h(x0 + R, x0 + RAST - R, y - ODST - 32, "0,10m", od_y=y - ODST, natpis_ispod=False)
    yz = y + 140
    s.osoba("zapovjednik", x0 + RAST, yz, smjer="gore")
    s.kota_v(x0 + RAST + 30, y + R, yz - R - 14, "5k", od_x=x0 + RAST)
    s.spremi(m / "00-3-skica-04.svg", "Skica 4 – Pozicije članova odjeljenja od 9 vatrogasaca pri izdavanju zapovijedi")

    # Skica 5 – 6 vatrogasaca
    s = Skica(220, 280)
    x0, y = 60, 110
    _dvije_vrste(s, x0, y, ["strojar", "n1", "v1"], ["n2", "v2"], pomak_straznje=1)
    s.osoba("zapovjednik", x0 + RAST, y + 140, smjer="gore")
    s.spremi(m / "00-3-skica-05.svg", "Skica 5 – Pozicije članova odjeljenja od 6 vatrogasaca pri izdavanju zapovijedi")

    # Skica 6 – 3 vatrogasca
    s = Skica(120, 280)
    x0, y = 60, 110
    s.osoba("strojar", x0, y)
    s.osoba("n2", x0, y - ODST)
    s.osoba("n1", x0, y + 140, smjer="gore")
    s.spremi(m / "00-3-skica-06.svg", "Skica 6 – Pozicije članova odjeljenja od 3 vatrogasca pri izdavanju zapovijedi")

    # Skica 7 – jednovrsni stroj
    s = Skica(460, 230)
    x0, y = 55, 70
    red = ["strojar", "teklic", "n1", "n2", "v1", "v2", "c1", "c2"]
    for i, sid in enumerate(red):
        s.osoba(sid, x0 + i * RAST, y)
    xs = x0 + 3.5 * RAST
    s.osoba("zapovjednik", xs, y + 140, smjer="gore")
    s.kota_v(xs + 28, y + R, y + 140 - R - 14, "5k", od_x=xs)
    s.kota_h(x0 + 5 * RAST + R, x0 + 6 * RAST - R, y - 38, "0,10m", od_y=y, natpis_ispod=False)
    s.spremi(m / "00-3-skica-07.svg", "Skica 7 – Postrojavanje odjeljenja u jednovrsnom stroju")

    # Skica 8 – kolona po jedan
    s = Skica(760, 220)
    x0, y = 40, 160
    kolona = ["c2", "c1", "v2", "v1", "n2", "n1", "teklic", "strojar"]
    for i, sid in enumerate(kolona):
        s.osoba(sid, x0 + i * KOL, y)
    s.osoba("zapovjednik", x0 + 8 * KOL, y, smjer="desno")
    xp = x0 + 3.5 * KOL
    s.osoba("zapovjednik-polozaj", xp, 40, smjer="desno")
    s.kota_v(xp, y - R - 2, 40 + R, "3k")
    s.kota_h(x0 + R, x0 + KOL - R, y - 42, "1,10m", od_y=y, natpis_ispod=False)
    s.spremi(m / "00-3-skica-08.svg", "Skica 8 – Postrojavanje odjeljenja u kolonu po jedan")

    # Skica 9 – kolona po dva
    s = Skica(560, 210)
    x0, y1, y2 = 110, 50, 100
    gornja = ["c1", "v1", "n1", "strojar"]
    donja = ["c2", "v2", "n2", "teklic"]
    for i in range(4):
        s.osoba(gornja[i], x0 + i * KOL, y1)
        s.osoba(donja[i], x0 + i * KOL, y2)
    xz = x0 + 3 * KOL + 100
    s.osoba("zapovjednik", xz, (y1 + y2) / 2, smjer="desno")
    s.kota_v(x0 - 40, y1 + R, y2 - R, "0,10m", od_x=x0, natpis_desno=False)
    s.kota_h(x0 + R, x0 + KOL - R, y2 + 55, "1,10m", od_y=y2)
    s.kota_h(x0 + 3 * KOL + R, xz - R, y2 + 55, "1,10m", od_y=y2)
    s.spremi(m / "00-3-skica-09.svg", "Skica 9 – Postrojavanje odjeljenja u kolonu po dva")


def build(korijen):
    k = Path(korijen)
    sim = k / "simboli"
    sim.mkdir(parents=True, exist_ok=True)
    for sid in SIMBOLI:
        (sim / f"{sid}.svg").write_text(svg_simbola(sid), encoding="utf-8")
    (sim / "simboli.svg").write_text(sprite(), encoding="utf-8")
    skice_postrojavanja(k / "skice")


if __name__ == "__main__":
    build(Path(__file__).resolve().parent.parent)
