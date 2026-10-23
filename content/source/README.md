# content/source — izvorni materijali (authoritative source materials)

Ovaj direktorij sadrži **nepromijenjenu kopiju** repozitorija s izvornim materijalima.

| | |
| --- | --- |
| Izvor | GitHub `w5ar/VatrogasneVjezbe` |
| Commit | `bf43bf5c2933d67a1333d698347fc81f77485051` („Vatrogasni vježbovnik: uvod, legenda, postrojavanje, vježbe 1 i 2”) |
| Preuzeto | 2026-10-23 |

Sadržaj: `00-1-Uvod.md`, `00-2-Legenda.md`, `00-3-Postrojavanje.md`, `01-Vjezba-1.md`, `02-Vjezba-2.md`,
`simboli/` (SVG simboli i sprite `simboli.svg`), `skice/` (skice faza s povezanim simbolima),
`skice/ugradjeno/` (generirane samostalne kopije skica), `slike/` (fotografija), `alati/` (Python skripte
koje generiraju simbole i skice).

Files here must not be edited by hand: update them in the source repository and copy again, then run
`pnpm import:all`. This `README.md` is ignored by the import pipeline.
