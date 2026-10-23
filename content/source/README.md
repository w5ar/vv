# content/source — izvorni materijali (authoritative source materials)

Ovaj direktorij sadrži **nepromijenjenu kopiju** repozitorija s izvornim materijalima.

| | |
| --- | --- |
| Izvor | GitHub `w5ar/VatrogasneVjezbe` |
| Commit | `2393766ad2c7a325feb305b8bb24f69467e594a0` („Vježbe 3–15: prijepis, skice 20–77 i fotografije 18–64”) |
| Preuzeto | 2026-10-23 |

Sadržaj: `00-1-Uvod.md`, `00-2-Legenda.md`, `00-3-Postrojavanje.md`, `01-Vjezba-1.md` … `15-Vjezba-15.md`,
`simboli/` (SVG simboli i sprite `simboli.svg`), `skice/` (skice faza s povezanim simbolima, skice 1–77),
`skice/ugradjeno/` (generirane samostalne kopije skica), `slike/` (fotografije 17–64), `alati/` (Python skripte
koje generiraju simbole i skice).

Files here must not be edited by hand: update them in the source repository and copy again, then run
`pnpm import:all`. This `README.md` is ignored by the import pipeline.
