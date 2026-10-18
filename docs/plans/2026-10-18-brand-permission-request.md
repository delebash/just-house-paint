# A request to the paint brands — the draft (option D)

Decided 2026-10-17 (TASKS, "Design decisions after probe round 1"): the app loads a brand's public
color list when the user asks (B), imports the brand's official palette files (C), and — in
parallel — asks Sherwin-Williams and Behr for permission (D). **D sends nothing by itself:** this
is the draft for the user to send, edit or drop. The facts it rests on are RESEARCH §10 (not legal
advice).

## Who to send it to

| Brand | Covers | Where it applies | How the app gets the colors today |
|---|---|---|---|
| Sherwin-Williams | Sherwin-Williams, Valspar, HGTV Home by Sherwin-Williams, Dutch Boy (one host) | its terms (4/15/2025): no automated gathering, personal non-commercial use | its public list, `api.sherwin-williams.com/prism/v1/colors/…`, at the user's request |
| Behr (Masco) | Behr | personal, non-commercial copy only; no database, no robots | its public `query-index.json`, at the user's request |
| Benjamin Moore | Benjamin Moore | no licence text on its palette pages | the user imports its ASE palette files |
| PPG / Glidden (Pittsburgh Paints Co.) | PPG, Glidden | no licence text on its palette pages | the user imports its XLSX palette file |

Neither Sherwin-Williams nor Behr has a developer API, a data licence or a partner programme for
apps (RESEARCH §10), so there is no form to fill: the contact is the brand's general, legal or
digital-partnerships address. **Not filled in here** — find the current one on each brand's site.

## The letter

> Subject: Permission to show your paint colors in a free, open-source house-paint visualizer
>
> Hello,
>
> I make Just House Paint, a free, open-source desktop app (MIT licence,
> https://github.com/delebash/just-house-paint) that lets a homeowner see their own house in real
> paint colors before buying paint. The user adds a photo of their house; the app finds its parts —
> the siding, trim, doors, shutters — and paints each with a color the user picks, keeping the
> photo's own light and shadow. Everything runs on the user's own computer; nothing is uploaded.
>
> We would like to show [BRAND]'s colors, the way your own visualizer does: the color number and
> name as you write them, its RGB value, its light reflectance value, whether it is for exterior use,
> and your coordinating colors. Today the app ships no color data at all: a user who wants your
> colors presses a button and the app loads your public color list onto their computer, for their
> own use — or imports the palette file you publish for designers. Your colors are never copied into
> our code or redistributed.
>
> On screen every color appears under your name and number, next to a notice that Just House Paint
> is not affiliated with or endorsed by [BRAND], and a reminder that a color on a screen is never
> exactly the paint — to check a real sample before buying.
>
> We would like to do this in the way you prefer. Could you tell us:
>
> 1. whether loading your public color list at the user's request, as described, is acceptable to
>    you — or which source you would rather we used (a file, a feed, an API);
> 2. any attribution, trademark wording or display rules you would like us to follow;
> 3. a contact for questions as the app develops.
>
> If you would rather the app not offer your colors at all, tell us and we will remove them.
>
> Thank you,
> [YOUR NAME]
> [YOUR EMAIL OR CONTACT]

## Before sending

- The facts in the letter are as built on 2026-10-18 (the Paint colors page, the not-affiliated
  notice and the color disclaimer in `src/i18n/locales/en.json`, `docs/paint-colors.md`); re-read them
  if the app changes.
- Brand names: Sherwin-Williams, Valspar, HGTV Home and Dutch Boy share one owner and one feed — one
  letter to Sherwin-Williams covers the four.
- An answer, either way, goes into TASKS ("Design decisions after probe round 1") as the brand's own
  words, and RESEARCH §10.
