# Set up the AI

Open **AI Settings** in the sidebar. The AI here suggests color schemes (**Suggest schemes** on a
house's **Schemes** tab) and draws the AI photo ([The AI photo](ai-photo.md)). The page's tabs are
**Providers & models**, **Images** (the AI photo's engine, stable-diffusion.cpp, and its model: **Install**
and **Remove**, **Download** and **Delete**, each model with its fit-and-speed chip), **Routing by feature**
(see [The AI features](ai-features.md)), **Usage** and **AI engine console**.

Above the tabs, a strip shows this computer: **OS**, **CPU**, **Memory**, **GPU**, **Acceleration**,
and how the graphics card's memory is used — **VRAM used** (**Memory used** where the graphics share
the computer's memory, as on a Mac), **Free**, **LLM** (the AI model loaded now) and, when other
programs hold more than a little, **Other apps** with **show apps**: **Using the GPU right now** lists
them. **Copy debug info** copies the computer's AI state — hardware, driver, engine, memory, loaded
models — to paste into a bug report.

**Local · free** and **Online · metered** switch the providers shown: the AI on this computer, or
an online service with your own key.

## Quick Setup

**Run Quick Setup** (on the **Local · free** side) sets up the AI on this computer: it looks at the
computer, proposes a model that fits it, and applies the choice. It sets up the built-in llama.cpp
provider only.

- **Check this PC's real AI speed?** — asked when no preset matches the computer. **Run the
  1-minute check** downloads a small test model once (its size is shown) and measures how fast the
  computer really runs one; **Skip — use estimates** picks from the hardware's specs instead.
- The next screen shows what it **Detected**, the model it recommends (**Default model**), and what
  **Apply setup** will do: the model becomes the one every preset uses — except a preset you changed
  yourself under **Routing by feature**. When no local model can run well here, it says so: connect an
  online provider instead.
- **Apply setup** downloads the llama.cpp engine (the program that runs models) and the model — several
  gigabytes, once each — with **Cancel** and **Retry** on each.
- Then the speed settings. Some computers come pre-measured: **Tuned settings for your hardware were
  applied ✓**. Otherwise **Optimize for this PC** offers **2-minute optimize** (tries the likely
  settings) or **Full optimize** (10 minutes or more, often much faster in the end); **Skip** keeps
  everything set up. While it measures it holds the graphics card and other AI features wait; closing
  Quick Setup then asks — **Close and stop** or **Keep optimizing**.

Once it's set up, **Re-run Quick Setup** or **Change model** walk it again; nothing changes until you
apply.

**Where the files go.** The engine and the models go in the app's data folder (App Settings →
[Storage](settings.md#storage) shows how much they take) — unless another app of the family on this
computer already downloaded models and this one has none: then, from its first start, this app uses
that app's files instead of downloading them again. Quick Setup shows the choice at its top — **Share
…'s AI files**, naming that app (picked), or **Keep a separate copy for this app**; a switch applies
the next time the app starts. Nothing on disk is moved or deleted either way.

**The offer.** When you add your first house and no AI is set up yet, the app asks: **Run Quick
Setup**, **Connect an online provider** or **Skip for now**. It asks once — again only after
[Reset Just House Paint](settings.md#reset-just-house-paint). AI Settings is always there.

## The models

The models are in the built-in provider's **Edit** (the **Built-in** row under **Local · free**), in the
**Model Catalog**. It offers three from the family's tested list:

- **Gemma 4 26B-A4B (QAT)** — the recommended all-rounder; runs on 8 GB graphics cards and up, with
  much of it in the computer's own memory.
- **Gemma 4 12B (QAT)** — the lighter, faster pick: runs fully on a 10–12 GB graphics card (tight on
  8 GB) and needs little of the computer's memory.
- **Gemma 4 E4B (QAT)** — made for laptops with integrated graphics.

QAT: trained for the smaller size they run at. Each row says whether it fits this computer (**Fits**,
**Tight**, **CPU**, **Won't fit**), how fast it should run (fast, fine, slow, very slow), its **Size on
disk** and what it needs (**Needs … GB VRAM · … GB RAM**); **Recommended for this PC** marks Quick
Setup's pick.

- **Set as default** — every feature uses it, unless you changed its preset. It loads the first time
  it's needed.
- **Load model** / **Unload model** — load it now, so the first suggestion doesn't wait; or free the
  graphics card's memory (it loads again when next needed). **Load now** and **Unload** at the top do the
  same for the default model. The AI photo unloads it while it draws.
- Under **More actions**: **Tune & measure**, **Re-download**, **Open folder** (in the desktop app),
  **View on Hugging Face**, **Delete downloaded model** (deletes the file; it stays listed and downloads
  again when needed) and **Delete from catalog** (what used it moves to another model).
- **Add model** takes any GGUF model on Hugging Face: its repo, then **Load model info from HF** and a
  quant. **Reset catalog** brings back the built-in models and keeps yours.

**Load the default local model into memory on startup** (under the built-in provider, on at first)
loads the model as the app starts: the start screen shows it loading — or **Setting up the AI engine**
while the engine installs — with **Continue without waiting**. If it doesn't load, **What can I do?**
opens [Troubleshooting](troubleshooting.md).

**Tune & measure** (a model's **More actions**) finds the fastest settings for this computer:
**Load & measure** (then **Measure again**) measures its speed; **Auto-tune** tries real settings one
after another (4 to 30 minutes) and fills the grid with the fastest — review it, then **Apply** (the
model reloads). **Remove applied config** goes back to the defaults; **Save for PC class** offers the
settings to every computer like this one.

**The engine.** The built-in provider's **Local engine** card: **Install engine** when it's missing,
**Uninstall engine** (your models are kept), **Reinstall** (the same build again) and **Update to …**
when a newer build is out (checked before it replaces yours). **Details ▾** has **View log** (the
engine's own log), **Acceleration backend** where the card offers a choice, the **Loaded models**, and
its settings: **Models kept loaded at once** (2), **Unload an idle model after (seconds · 0 = never)**
(900 — a quarter of an hour), **VRAM safety margin (MB)**, **Default context cap (tokens)**, **RAM
headroom (MB)**, **Speed bands (tokens/second)** (what "fast", "fine" and "slow" mean) and **Engine
updates** (**Notify** or **Off**) — then **Save** — and **Engine binaries** (where each build downloads
from).

**For experts**: **PC class configs…** (launch settings shared by computers with the same memory) and
**Global launch defaults…** (the switches under every model's settings), in the built-in provider's
Edit; **Reasoning levels…** (what each thinking level asks a provider for), in a saved provider's Edit.

**Your graphics hardware changed** — said once when the computer's graphics card is different: a
different model may now fit; **Run Quick Setup** checks again.

## Online providers

**Add provider** under **Online · metered**: its **Provider type** — OpenAI, Anthropic (Claude),
Gemini (Google), OpenRouter, DeepSeek, xAI (Grok), Mistral, or any OpenAI-compatible service — its
**Base URL**, **API key** and **Default chat model** (**Fetch** lists its models). **Test connection** checks it before you **Save
provider**; the saved key is never shown again (leave the box blank to keep it). On the list, **Test**
checks a provider again (**Connected** or **Failed**).

**Set as default** makes the features run on it. Presets you changed by hand stay as they are unless
you tick **Also overwrite presets I customized**.

What goes online: the house's colors as words and numbers, which parts are painted, and the words
you add — never the photo. The key is kept in the app's data and goes into a
[backup](settings.md#backups).

## Usage

**Usage** counts every AI call — **calls**, **tokens** (**prompt** and **completion**) and the
**est. cost** — **By feature** and **By provider**. A model on this computer costs $0. **Cloud
pricing** sets the price of an online model (US dollars per million tokens), used for the next calls'
cost. **Reset ledger** starts the counts over.

## The AI engine console

**AI engine console** shows two live logs: **Server log** — the app's own, the same as
[App Settings → Logs](settings.md#logs) — and **Engine output**, the llama.cpp engine's own words
(why a model didn't load, say). **Info +** and **Warnings +** filter the lines; **Pause** stops the
scrolling and **Resume** follows again.

## The AI tasks panel

Long work shows here: finding a house's parts, an AI photo, installing the part finder or the AI
photo, loading a brand's colors, the AI's schemes, and tests in AI Settings. Open it with the sparkle
button at the title bar's right, or **AI tasks** in the sidebar. The button shows how many tasks run;
a red count means one failed ("1 AI task failed — open the queue").

- **Running** — each task with its progress and **Cancel**; **Cancel all** when more than one runs. An
  AI answer shows how far it is (reading the prompt, the first words, the tokens) — **stalling · …** when
  it's slower than the model's usual pace, **stuck · …** when nothing new has come for a long while.
  **Show preview** shows the answer as it arrives.
- **Recent** — what finished, how long it took and how it ended. A failed task stays with its reason
  until you **Dismiss** it (the ×). **Clear** empties the list; **Show all** shows the older ones.

While you're on another screen, a running task also shows at the bottom right of the window, with its
progress, **Cancel** and **Details**.
