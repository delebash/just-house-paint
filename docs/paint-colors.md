# Paint colors

The app carries no paint colors of its own: it fetches each brand's colors from the brand, and keeps
them on your computer. Seven brands are listed on the **Paint colors** page (in the sidebar):
Sherwin-Williams, Behr, Benjamin Moore, Valspar, PPG / Glidden, HGTV Home by Sherwin-Williams and
Dutch Boy. The **Colors** tab lists the brands whose colors are here, and says how many more wait on
Paint colors.

## Loading a brand's public list

Behr, Sherwin-Williams, Valspar, HGTV Home and Dutch Boy publish their colors on their websites;
Benjamin Moore and PPG / Glidden publish palette files for designers (Benjamin Moore one per
collection, PPG one Excel file of every color), which the app finds on the brand's palette page. When the app
opens — the first time, and every time after — it loads by itself, one after another, each brand that has no
colors here yet and has **Load automatically** on, and keeps them on your computer; their progress shows at the
bottom right, with **Cancel**. **Load automatically**, on a brand's row, turns that off for the brand (its colors
already here stay) or on again (an empty brand loads at once). A brand with no colors here has **Load the colors**;
one already loaded has **Load again**, which fetches its list again; their progress shows above the list. **From**
says where a brand's colors came from — its **public list** or a **palette file** — and when. A load that fails
says why on the brand's row ("The last try failed: …"). Each brand's own website terms apply to what you
download — the app downloads each list for your own use.

## Importing a brand's palette file

If a brand moves its list or its files and loading fails, you can still download the brand's palette file from its
website yourself — Benjamin Moore's ASE files on its "Download Benjamin Moore color palettes" page, PPG's "Voice of
Colour Palette … RGB and LRV Values" Excel file, or Sherwin-Williams' and Behr's palette downloads. On the brand's
row open the menu beside its button (the arrow) and choose **Import a file…** — a brand the app can only take from
its palette file has **Import a file…** as its button — then choose the file. The app reads Adobe swatch files
(.ase, .aco), Excel (.xlsx) and CSV; a CSV or Excel file needs a header row with a code or name column and a hex or
R,G,B column. How big a file may be is in **App Settings → General** (**Largest palette file (MB)**, 30 at first).

An import replaces the brand's colors with the file's. Benjamin Moore publishes one file per collection, so after
importing one of them, that collection is all of Benjamin Moore you have — **Load again** brings back the whole
list. The app keeps each paint by its number: colors in a file without one are left out, and the import says how
many came in and what it left out.

**Remove**, in the same menu, takes a brand's colors off this computer; it asks first, and names the designs that
use them. Those parts show no color until the brand is added again — a house open at the time too: its
**Parts** tab says "not in the loaded colors" — and the design keeps which color it was, so it comes
back with the brand. With **Load automatically** on, the brand loads again the next time the app opens: to keep it
off this computer, turn **Load automatically** off, then **Remove**.

When **Load again** or an imported file brings a list without some colors a design uses (a brand
retires colors), the app names those designs. On the house's **Parts** tab such a part says
"not in the loaded colors" with the color's number; pick it a new color.

## How colors are named

Each color carries its brand's number before its name — "SW 7008 Alabaster". Benjamin Moore, Valspar, HGTV Home
and Dutch Boy numbers get the brand's letters or name in front ("BM", "Valspar", "HGSW", "Dutch Boy"), so
one brand's number is never taken for another's; Behr and PPG numbers stand alone. The **Colors** tab's swatches
show the name over the number alone; the full name shows when you point at one, on the chosen paint, on the
**Parts** tab and in the schemes. Just House Paint is not affiliated with or endorsed by any paint brand; the
brands' names and color names belong to them.

## Finding a color

On a house's **Colors** tab: choose the brand, search by name or by number — the number without the brand's
letters ("7008", not "SW 7008") — and click a color to paint the selected part. **Order** lists the colors by
**Color**, as a paint store's color wall — whites, grays and blacks first, then pinks and reds, oranges, yellows,
greens, blues and purples, each from light to dark — or by **Name**; the app keeps your choice. **Color family**
shows only the **Neutrals** (whites, grays, blacks and the grayest beiges) or one of the hue families. The families
and where each begins are in **App Settings → Advanced** ("How colors are ordered by color").

**Exterior colors only** (on at first) hides the colors a brand marks for inside use; colors it doesn't mark either
way stay. Today only Sherwin-Williams marks its colors, so for the other brands it hides nothing. It narrows
**An exact color**'s matches too. **Color family**, **Exterior colors only** and **Show discontinued colors** start
over each time you open the tab; **Order** is kept.

**An exact color** — a hex color, or one from the picker — finds the brand's nearest paints, closest first, each
with its ΔE: green, under 2, is a close match — hard to tell apart from your color. When none is near: "No paint of
this brand near … — try another brand, or turn off Exterior colors only."

**A color from the photo**: choose **Pick a color** above the photo and click it — the color there
goes into **An exact color**, with the brand's nearest paints. On the **Parts** tab, the small round
swatch beside a part is its color as photographed; click it to find the paints nearest the color
your house has now. Light and shadow are in a photo's colors, so the nearest paint is close, not
exact — check a chip against the wall.

## Discontinued colors

Some lists include colors a brand no longer sells. They are hidden unless you turn on **Show
discontinued colors**, which lists them on the **Colors** tab — find the paint already on your house there by its
name or number. The nearest-paint matches (**An exact color**, **Pick a color**, a part's photographed swatch) never
offer discontinued colors.
