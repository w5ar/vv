# Izvješće o uvozu – Sintetički testni skup (nije izvorni materijal)

> Generirano naredbom `pnpm import:all`. Ne uređivati ručno.

> **SINTETIČKI SKUP PODATAKA** – nije izvorni materijal i ne opisuje stvarne vatrogasne postupke.

- Izvorni direktorij: `content/synthetic/source`
- Datoteka: 9
- Dijagnostika: 0 grešaka, 2 upozorenja, 3 informacija

## A – Popis materijala

| Datoteka | Vrsta | Veličina (B) | viewBox | Grupe | Duplikat od | Mogući id simbola |
| --- | --- | --- | --- | --- | --- | --- |
| content/synthetic/source/diagrams/sinteticka-vjezba-01-faze.svg | diagram-svg | 7690 | 0 0 1100 600 | 26 |  | sinteticka-vjezba-01-faze, sinteticka-vjezba-01-faze-sinteticki-crtez |
| content/synthetic/source/diagrams/sinteticki-ravni-crtez.svg | diagram-svg | 608 | 0 0 400 200 | 0 |  | sinteticki-ravni-crtez |
| content/synthetic/source/procedures/sinteticka-vjezba-01.md | procedure-md | 1946 |  |  |  |  |
| content/synthetic/source/symbols/cijev.svg | symbol-svg | 831 | 0 0 80 12 | 1 |  | cijev, cijev-sinteticka |
| content/synthetic/source/symbols/mlaznica.svg | symbol-svg | 792 | 0 0 36 16 | 2 |  | mlaznica, mlaznica-sinteticka |
| content/synthetic/source/symbols/osoba.svg | symbol-svg | 577 | 0 0 32 32 | 1 |  | osoba, osoba-sinteticka |
| content/synthetic/source/symbols/oznake-list.svg | symbol-svg | 1004 | 0 0 100 50 | 3 |  | oznake-list, list-oznaka-sinteticki, oznaka-cilja |
| content/synthetic/source/symbols/razdjelnik.svg | symbol-svg | 895 | 0 0 40 48 | 1 |  | razdjelnik, razdjelnik-sinteticki |
| content/synthetic/source/symbols/vozilo.svg | symbol-svg | 1028 | 0 0 120 60 | 2 |  | vozilo, vozilo-sinteticko, tijelo, prikljucci |

## B – Simboli

| Id | Naziv | Izvor naziva | Kategorija | Datoteka | Element | Priključci | Pregled |
| --- | --- | --- | --- | --- | --- | --- | --- |
| syn.vozilo | Vozilo (sintetičko) | review | vozila | content/synthetic/source/symbols/vozilo.svg |  | 2 | requires-review |
| syn.osoba | Osoba (sintetička) | review | osoblje | content/synthetic/source/symbols/osoba.svg |  | 0 | requires-review |
| syn.cijev-velika | Cijev s velikim spojem (sintetička) | review | oprema | content/synthetic/source/symbols/cijev.svg |  | 2 | requires-review |
| syn.cijev-mala | Cijev s malim spojem (sintetička) | review | oprema | content/synthetic/source/symbols/cijev.svg |  | 2 | requires-review |
| syn.razdjelnik | Razdjelnik (sintetički) | review | oprema | content/synthetic/source/symbols/razdjelnik.svg |  | 3 | requires-review |
| syn.mlaznica | Mlaznica (sintetička) | review | oprema | content/synthetic/source/symbols/mlaznica.svg |  | 1 | requires-review |
| syn.oznaka-cilja | Oznaka cilja (sintetička) | review | oznake | content/synthetic/source/symbols/oznake-list.svg | oznaka-cilja | 0 | requires-review |
| syn.oznaka-polazista | Oznaka polazišta (sintetička) | review | oznake | content/synthetic/source/symbols/oznake-list.svg | oznaka-polazista | 0 | requires-review |

## C – Crteži

### content/synthetic/source/diagrams/sinteticka-vjezba-01-faze.svg

Naslov: Sintetička vježba 01 – faze (sintetički crtež)

Faze: faza-1 („Faza 1 – početni raspored”), faza-2 („Faza 2 – završni raspored”)

| Faza | Element | Instanca | Simbol | Položaj | Rotacija | Pouzdanost |
| --- | --- | --- | --- | --- | --- | --- |
| faza-1 | f1-vozilo | vozilo | syn.vozilo | 150, 300 | 0° | metadata |
| faza-1 | f1-voditelj | voditelj | syn.osoba | 150, 230 | 0° | metadata |
| faza-1 | f1-clan-1 | clan-1 | syn.osoba | 250, 230 | 0° | metadata |
| faza-1 | f1-clan-2 | clan-2 | syn.osoba | 250, 370 | 0° | metadata |
| faza-1 | f1-cijev-velika | cijev-velika | syn.cijev-velika | 260, 380 | 0° | metadata |
| faza-1 | f1-razdjelnik | razdjelnik | syn.razdjelnik | 290, 230 | 0° | metadata |
| faza-1 | f1-cijev-mala-1 | cijev-mala-1 | syn.cijev-mala | 260, 180 | 0° | metadata |
| faza-1 | f1-cijev-mala-2 | cijev-mala-2 | syn.cijev-mala | 260, 420 | 0° | metadata |
| faza-1 | f1-mlaznica-1 | mlaznica-1 | syn.mlaznica | 310, 180 | 0° | metadata |
| faza-1 | f1-mlaznica-2 | mlaznica-2 | syn.mlaznica | 310, 420 | 0° | metadata |
| faza-1 | f1-oznaka-cilja | oznaka-cilja | syn.oznaka-cilja | 1040, 300 | 0° | metadata |
| faza-2 | f2-vozilo | vozilo | syn.vozilo | 150, 300 | 0° | metadata |
| faza-2 | f2-voditelj | voditelj | syn.osoba | 150, 230 | 0° | metadata |
| faza-2 | f2-clan-1 | clan-1 | syn.osoba | 780, 230 | 0° | metadata |
| faza-2 | f2-clan-2 | clan-2 | syn.osoba | 780, 370 | 0° | metadata |
| faza-2 | f2-cijev-velika | cijev-velika | syn.cijev-velika | 375, 295 | 0° | metadata |
| faza-2 | f2-razdjelnik | razdjelnik | syn.razdjelnik | 560, 300 | 0° | metadata |
| faza-2 | f2-cijev-mala-1 | cijev-mala-1 | syn.cijev-mala | 700, 260 | 0° | metadata |
| faza-2 | f2-cijev-mala-2 | cijev-mala-2 | syn.cijev-mala | 700, 340 | 0° | metadata |
| faza-2 | f2-mlaznica-1 | mlaznica-1 | syn.mlaznica | 850, 250 | 0° | metadata |
| faza-2 | f2-mlaznica-2 | mlaznica-2 | syn.mlaznica | 850, 350 | 0° | metadata |
| faza-2 | f2-oznaka-cilja | oznaka-cilja | syn.oznaka-cilja | 1040, 300 | 0° | metadata |
| faza-2 | f2-oznaka |  | syn.oznaka-polazista | 60, 520 | 0° | heuristic |
| faza-2 | f2-nepoznato |  | ? | 0, 0 | 0° | unresolved |

| Faza | Od | Do | Pouzdanost |
| --- | --- | --- | --- |
| faza-2 | vozilo#izlaz-1 | cijev-velika#kraj-a | metadata |
| faza-2 | cijev-velika#kraj-b | razdjelnik#ulaz | metadata |
| faza-2 | razdjelnik#izlaz-1 | cijev-mala-1#kraj-a | metadata |
| faza-2 | cijev-mala-1#kraj-b | mlaznica-1#ulaz | metadata |
| faza-2 | razdjelnik#izlaz-2 | cijev-mala-2#kraj-a | metadata |
| faza-2 | cijev-mala-2#kraj-b | mlaznica-2#ulaz | metadata |

### content/synthetic/source/diagrams/sinteticki-ravni-crtez.svg

Naslov: Sintetički "ravni" crtež

Faze: sinteticki-ravni-crtez

**Ravni crtež** – nema prepoznatljivih instanci simbola.

_(nema)_

## D – Postupci

### content/synthetic/source/procedures/sinteticka-vjezba-01.md

Naslov: Sintetička vježba 01 – Postavljanje sintetičkog voda s dvije mlaznice

| Kandidat | Redak | Tekst (doslovno) | Uloge | Oprema | Status |
| --- | --- | --- | --- | --- | --- |
| sinteticka-vjezba-01#faza-1-postavljanje-razdjelnika-i-velike-cijevi/1 | 34 | Voditelj daje znak za početak vježbe. | role.voditelj |  | mapped |
| sinteticka-vjezba-01#faza-1-postavljanje-razdjelnika-i-velike-cijevi/2 | 35 | Član 1 uzima razdjelnik i postavlja ga na označeno mjesto razdjelnika. | role.clan-1 | syn.razdjelnik | mapped |
| sinteticka-vjezba-01#faza-1-postavljanje-razdjelnika-i-velike-cijevi/3 | 36 | Član 2 uzima cijev s velikim spojem, polaže je i spaja na prvi izlaz vozila. | role.clan-2 | syn.vozilo, syn.cijev-velika | mapped |
| sinteticka-vjezba-01#faza-1-postavljanje-razdjelnika-i-velike-cijevi/4 | 37 | Član 2 spaja slobodni kraj velike cijevi na ulaz razdjelnika. | role.clan-2 | syn.cijev-velika, syn.razdjelnik | mapped |
| sinteticka-vjezba-01#faza-2-postavljanje-mlaznica/5 | 41 | Član 1 uzima cijev s malim spojem i mlaznicu, spaja cijev na razdjelnik i postavlja mlaznicu u ciljno područje. | role.clan-1 | syn.cijev-mala, syn.razdjelnik, syn.mlaznica | mapped |
| sinteticka-vjezba-01#faza-2-postavljanje-mlaznica/6 | 42 | Član 2 uzima drugu cijev s malim spojem i mlaznicu, spaja cijev na razdjelnik i postavlja mlaznicu u ciljno područje. | role.clan-2 | syn.cijev-mala, syn.razdjelnik, syn.mlaznica | mapped |
| sinteticka-vjezba-01#faza-2-postavljanje-mlaznica/7 | 43 | Član 1 ili Član 2 javlja spremnost voditelju. | role.voditelj, role.clan-1, role.clan-2 |  | mapped |
| sinteticka-vjezba-01#faza-2-postavljanje-mlaznica/8 | 44 | Voditelj daje znak za otvaranje, a članovi otvaraju mlaznice. | role.voditelj | syn.mlaznica | mapped |

## E – Povezivanje

| Kandidat | Vježba | Koraci | Status | Razlog |
| --- | --- | --- | --- | --- |
| sinteticka-vjezba-01#faza-1-postavljanje-razdjelnika-i-velike-cijevi/1 | sinteticka-vjezba-01 | korak-1 | mapped |  |
| sinteticka-vjezba-01#faza-1-postavljanje-razdjelnika-i-velike-cijevi/2 | sinteticka-vjezba-01 | korak-2 | mapped |  |
| sinteticka-vjezba-01#faza-1-postavljanje-razdjelnika-i-velike-cijevi/3 | sinteticka-vjezba-01 | korak-3 | mapped |  |
| sinteticka-vjezba-01#faza-1-postavljanje-razdjelnika-i-velike-cijevi/4 | sinteticka-vjezba-01 | korak-4 | mapped |  |
| sinteticka-vjezba-01#faza-2-postavljanje-mlaznica/5 | sinteticka-vjezba-01 | korak-5 | mapped |  |
| sinteticka-vjezba-01#faza-2-postavljanje-mlaznica/6 | sinteticka-vjezba-01 | korak-6 | mapped |  |
| sinteticka-vjezba-01#faza-2-postavljanje-mlaznica/7 | sinteticka-vjezba-01 | korak-7 | mapped |  |
| sinteticka-vjezba-01#faza-2-postavljanje-mlaznica/8 | sinteticka-vjezba-01 | korak-8 | mapped |  |

## F – Kompilirane vježbe

| Vježba | Izvor | Izlaz | Ispravno | Greške | Upozorenja | Koraci | Povezani s izvorom | Demonstracija završava |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sinteticka-vjezba-01 | content/authoring/synthetic/sinteticka-vjezba-01.exercise.json | content/exercises/sinteticka-vjezba-01.json | da | 0 | 0 | 8 | 8 | da |

## Dijagnostika

| Razina | Faza | Kod | Poruka | Izvor |
| --- | --- | --- | --- | --- |
| info | C | diagram.heuristic-instance | content/synthetic/source/diagrams/sinteticka-vjezba-01-faze.svg: grupa f2-oznaka („Oznaka polazišta”) prepoznata je po nazivu kao syn.oznaka-polazista; potrebna je provjera. | content/synthetic/source/diagrams/sinteticka-vjezba-01-faze.svg#f2-oznaka |
| warning | C | diagram.unresolved-instance | content/synthetic/source/diagrams/sinteticka-vjezba-01-faze.svg: grupa f2-nepoznato nije prepoznata kao simbol; potrebna je ručna obrada. | content/synthetic/source/diagrams/sinteticka-vjezba-01-faze.svg#f2-nepoznato |
| warning | C | diagram.flattened | content/synthetic/source/diagrams/sinteticki-ravni-crtez.svg: crtež je „ravan” (bez metapodataka o simbolima); prepoznavanje nije moguće bez ručnog označavanja. | content/synthetic/source/diagrams/sinteticki-ravni-crtez.svg |
| info | D | procedure.candidate-mode | content/synthetic/source/procedures/sinteticka-vjezba-01.md: kandidati koraka su numerirane stavke (8). | content/synthetic/source/procedures/sinteticka-vjezba-01.md |
| info | F | mapping.role-mismatch | Korak korak-7: izvorni tekst spominje uloge role.voditelj koje nisu među izvršiteljima koraka. | content/authoring/synthetic/sinteticka-vjezba-01.exercise.json |
