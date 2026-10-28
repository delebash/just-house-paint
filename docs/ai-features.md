# The AI features

Each AI feature is a row under **AI Settings → Routing by feature**; Just House Paint has two:
**Suggest color schemes** (under **Color schemes**) and **Draw the AI photo** (under **AI photo**). A
feature runs on an engine preset — the provider, the model and its settings. One model can serve every
chat feature, or a feature can point at a stronger one; the AI photo runs on an image model.

## Suggest color schemes

**Suggest schemes** on a house's **Schemes** tab ([Color schemes](color-schemes.md)). The app tells
the AI the house's current colors — read from your photo, part by part — which parts will be
painted, which stay as they are, and the words you add, and asks for the schemes as JSON. It matches
every color to the brand's nearest real exterior paint; unlike the harmony schemes, the AI's aren't
checked for how far the trim and the door stand out. It runs on the **General** preset (some variety,
no thinking first).

## Draw the AI photo

**AI photo** on a house's page ([The AI photo](ai-photo.md)). It runs the image model FLUX.2 [klein] 4B on
your computer, on the engine stable-diffusion.cpp (**AI Settings → Images** installs and removes them). Its
preset, **AI photo**, holds the model and how it draws: **Steps** (4), **Guidance (CFG)** (1), **Strength**
(1), **Sampler** (euler) and **Seed** (42 — the same colors draw the same picture again; −1 picks a new
one each time). Select **Draw the AI photo** under **Routing by feature** to change them: **Save** keeps
them, **Reset to the app's settings** brings the app's back. The prompts it fills in for each part are in
**App Settings → Advanced** ([App Settings](settings.md)).

## Changing what a feature says or runs on

Select **Suggest color schemes** under **Routing by feature** (**Hide list** makes room; **Show list**
brings it back). **Tune presets** — the Lab — tries it out:

- **Test input** — what the app would send, one box each: the house's colors, the parts painted and
  kept, your words, how many schemes. Type what you want to try.
- Each column (**＋ Add column** for more) is one try: its **Preset** or **Provider & model**, **Temp**,
  **Top-p**, **Max tok**, **Reasoning** (how long the model thinks before it answers — **Off** for this
  feature), **Samplers** and **Stop sequences**, and what the model is told — the **System prompt** and
  the **Instruction**. A change to these words is for the test only: it isn't saved.
- **Run** a column, or **▶ Run all**, and compare the answers.
- **Save as preset** keeps a column's settings as a preset of its own (it appears in the lists);
  **Use in production** makes this feature run on it.
- **Output as JSON** — keep it on: the app reads the answer as JSON (it's saved for the feature).

**Reset to default** puts this feature back on its own preset, with its original prompt. **Reset
presets to defaults** (under the list) brings back the built-in presets and every feature's choice;
your own presets stay.
