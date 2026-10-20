<!-- SPDX-License-Identifier: MIT -->
# Research register — what we already know, and where the proof is (just-house-paint)

**Read the section for your subject before researching anything.** The family rule and the entry
format are in the kit's register (`../../../just-core/docs/dev/RESEARCH.md`, "The rule" and
"How an entry reads"). This register holds just-house-paint's domain: finding a house's paintable
surfaces, recoloring them, generative edits, and what the existing visualizers do. The shared
stack's facts (the kit, llama.cpp, the memory arbiter) stay in the kit's register.

Plans: [`../plans/2026-10-18-v1.md`](../plans/2026-10-18-v1.md) — the v1 build (what each piece is, and the
standard it follows).

Labels: **measured** — run on this machine · **web** — checked against the upstream page by the
session that recorded it · **agent** — found on the web by a research agent and not re-checked by
the session that recorded it · **record** — carried from another register.

Subjects: [1 · The machine](#1--the-machine) ·
[2 · How existing visualizers work](#2--how-existing-visualizers-work) ·
[3 · Finding the surfaces](#3--finding-the-surfaces) ·
[4 · Native and Node engines for vision models](#4--native-and-node-engines-for-vision-models) ·
[5 · Tinting](#5--tinting) ·
[6 · Generative edits on this machine](#6--generative-edits-on-this-machine) ·
[7 · Generative edits in the cloud](#7--generative-edits-in-the-cloud) ·
[8 · Open source to build on](#8--open-source-to-build-on) ·
[9 · Measured on this machine — probe round 1](#9--measured-on-this-machine--probe-round-1) ·
[10 · Paint color data](#10--paint-color-data) ·
[11 · The app, run for real](#11--the-app-run-for-real-2026-10-18) ·
[12 · The installed app and the first release](#12--the-installed-app-and-the-first-release-2026-10-19) ·
[13 · The weak spots: trim, ornaments, a dark finish](#13--the-weak-spots-trim-ornaments-a-dark-finish-2026-10-19)

---

## 1 · The machine

- NVIDIA GeForce RTX 2070 SUPER, 8192 MiB, compute capability 7.5 (Turing), PCIe gen 3 x16,
  driver 610.88 (CUDA 13.3); ~0.7 GB in use by the desktop at idle. — *measured, 2026-10-17* ·
  `nvidia-smi --query-gpu=name,memory.total,memory.used,driver_version,compute_cap,…`.
- AMD Ryzen 7 5700X (8 cores / 16 threads, AVX2, no AVX-512); 2 × 16 GB DDR4-3600 CL16; Windows 11
  Pro 10.0.26300; NVMe SSDs. — *measured, 2026-10-17* · `Win32_Processor`, `Win32_PhysicalMemory`.
- bf16 is emulated on this card (`torch.cuda.is_bf16_supported(including_emulation=False)` is
  False), and ggml turns CUDA graphs off on Turing. — *record* · JustVoice register (2026-10-10,
  2026-10-04).
- Node 26.5.0, npm 11.17.0; Python 3.12.9 with no torch, diffusers or onnxruntime installed; CUDA
  toolkit 12.1. — *measured, 2026-10-17*.
- **The user's laptop:** Core Ultra 7 165U, 32 GB, Intel Arc iGPU (shared memory). JustWrite measured
  llama.cpp on it: the iGPU wins prefill (pp8192 117 tok/s against the CPU's 55–63), the CPU wins decode
  (15.3–16.7 tok/s), flash-attn off on Arc. — *record* · `justwrite-app/docs/dev/measured-performance.md`.
  **This app on it — estimates, not measured** (2026-10-18, the user's question): painting, the outlines and
  the paint search run in the window and need no GPU — fine; the AI's schemes (Gemma 4 12B, ~700 tokens)
  ~30–60 s; finding the parts (SAM 3 on ONNX Runtime — CPU, or DirectML if it takes the iGPU) ~1–2 min a
  photo; the AI photo (FLUX.2 [klein] 4B through sd-cli on Vulkan) likely several minutes. A 16 GB Iris Xe
  laptop would be tighter. To be measured when the app runs there.

## 2 · How existing visualizers work

Two patterns: **segment once, then tint** (Sherwin-Williams, Valspar, PPG, Benjamin Moore, Dulux —
deterministic colors, instant recolors) and **generate a new image** (HomeGPT, housepaint.ai, Hover,
GenRoom, FacadeColorizer — vendors claim ~20–40 s a render, no exact color).

- **Sherwin-Williams Color Visualizer (cvw)** posts the uploaded photo to
  `https://prism-ml.sherwin-williams.com/v1/scene`; two 1280×960 house photos took 14.4 s and
  11.4 s round trip and came back with labelled surfaces (housetrim, bricksiding,
  residentialgaragedoor, stripsiding, shutters). The browser then tints in Skia CanvasKit (WASM):
  each surface mask filled with the paint color × a grayscale shading image ("modulate"), the
  original photo drawn underneath — every later color change is local and instant. Built in-house
  (`@sherwin-williams-co/prism-applets` 22.0.0, 2026-09-08); a 10 px brush-mask touch-up tool is in
  the code. — *agent (observed: the page's JS, and 2 Wikimedia Commons photos sent to the public
  endpoint), 2026-10-17* · sherwin-williams.com/en-us/color/color-tools/color-visualizer/cvw/.
- **HomeGPT**: "Runware, running OpenAI image models, receives your photo" (privacy policy,
  2026-10-16); the paint call sends `{imageUrl, type:"exterior", colors}`; at most 4 colors from a
  fixed list of 12 named colors; input capped at 1024 px; free 2 designs/day, Pro $9/month. —
  *web (the privacy-policy sentence), 2026-10-17; the rest agent (observed JS)* ·
  homegpt.app/privacy.
- **housepaint.ai** (app: Repaint): auto-detects walls, trim, doors and shutters, then "Generative
  Color Application"; 19,800 colors from 7 brands (SW, Benjamin Moore, Behr, PPG, Farrow & Ball,
  Valspar, Dunn-Edwards); credits — 1 to analyse a photo, 2 to repaint; no model vendor named. —
  *agent (vendor pages, App Store), 2026-10-17* · housepaint.ai/partners.
- Valspar embeds an older SW Prism (one server mask + brush, eraser, lasso, polygon, bucket); PPG
  segments one wall per click on its server (`/api/SegmentWall/`); Benjamin Moore's app masks a
  tapped surface; Hover returns AI outlines, then a `CustomizeAiImage` call with
  `paintHexColor` and a `geminiPromptName` returns a regenerated image. — *agent (observed JS /
  App Store), 2026-10-17*.
- Generative vendors' own speed claims: FacadeColorizer p50 22 s / p95 41 s; GenRoom ~30 s; the
  "Paint Color Visualizer" App Store app ~30 s. — *agent (vendor claims), 2026-10-17*.
- Every brand disclaims on-screen accuracy ("Actual color may vary…"); HomeGPT says its preview is
  "not a color-matched proof" and points users to brand visualizers. — *agent (vendor pages),
  2026-10-17*.
- Features seen across them: automatic surface detection, manual touch-up (brush / eraser / lasso /
  polygon / bucket / magic wand), before/after and side-by-side compare, scheme suggestions, color
  match from a photo, save and share, sample ordering (SW, PPG), paint quantity and cost estimate
  (HomeGPT only), AR live view (SW, Benjamin Moore, Dulux), multi-brand catalogs (housepaint 7
  brands; one App Store app 131). — *agent, 2026-10-17*.

## 3 · Finding the surfaces

- **SAM 3** (Meta, 2025-11-19): ~850M parameters, input 1008×1008, prompted by a short noun
  phrase or an example region; returns a mask per matching instance. It "struggles to generalize
  to fine-grained out-of-domain concepts". Newest release: SAM 3.1 (2026-03-27). — *agent,
  2026-10-17* · arxiv.org/html/2511.16719v2 · github.com/facebookresearch/sam3.
- SAM 3's licence (the "SAM License") grants a royalty-free licence to use, reproduce, distribute
  and modify; it forbids ITAR / military / weapons uses. Commercial use is not excluded. — *web,
  2026-10-17* · raw.githubusercontent.com/facebookresearch/sam3/main/LICENSE §1a, §1b.v.
- The only published test of SAM 3 on house parts: windows, doors and façade surfaces, mIoU 0.722
  zero-shot (SVI2LoD3, eTRIMS-based). Nothing tests "trim", "fascia", "soffit", "garage door",
  "shutters" or "gutter" — **unknown until we test on real photos**. — *agent, 2026-10-17* ·
  arxiv.org/html/2608.29992.
- **SAM 2.1** (Apache-2.0): tiny 38.9M · small 46M · base+ 80.8M · large 224.4M; points and boxes
  only, no text. Its 256×256 mask output erodes thin structures when upsampled. — *agent,
  2026-10-17* · github.com/facebookresearch/sam2 · arxiv.org/pdf/2502.09660.
- ADE20K-150 (OneFormer / Mask2Former) has wall, building, house, windowpane, door, fence,
  railing, column, stairs, awning — and no roof, gutter, shutter, garage door, trim or fascia.
  ADE20K's images are for non-commercial research; whether trained weights inherit that is
  unknown. — *agent, 2026-10-17* · huggingface.co/shi-labs/oneformer_ade20k_swin_large.
- Façade datasets (CMP 606 images / 12 classes, CC BY-SA; ECP 104; eTRIMS 60; LabelMeFacade 945)
  label no siding, trim, fascia, soffit, garage door or gutter. No pretrained model for US
  house-exterior parts was found. — *agent, 2026-10-17* · cmp.felk.cvut.cz/~tylecr1/facade/.
- Qwen3-VL (Apache-2.0) answers grounding requests with boxes or points (0–1000 coordinates).
  llama.cpp scaled its boxes wrongly until PR #25781 (release b10085, July 2026). How accurate a
  vision model's boxes are for trim, shutters or a garage door: unknown. — *agent, 2026-10-17* ·
  github.com/QwenLM/Qwen3-VL · github.com/ggml-org/llama.cpp/issues/16880.
- Gemini 2.5 Flash returns segmentation masks; Gemini 3 Pro / 3 Flash do not. — *agent,
  2026-10-17* · ai.google.dev/gemini-api/docs/gemini-3.
- **What the paint companies patented** (patents don't prove what the live products run):
  - SWIMC LLC US12361613B2 (granted 2025-07-15): DeepLab trained on ADE20K plus proprietary data
    finds walls, ceilings and trim; graph-cut refines edges; masks are made once on a Node.js
    Fastify server and the browser recolors with SVG filters and WebGL. — *agent, 2026-10-17* ·
    patents.google.com/patent/US12361613B2.
  - Behr US20250061582A1 (filed 2024-08-07): Segment Anything run twice to find walls, then a
    grayscale "shade matte" over a flat color layer. — *agent, 2026-10-17* ·
    patents.google.com/patent/US20250061582A1.

## 4 · Native and Node engines for vision models

- **sam3.cpp** (ggml, MIT; 376 stars, last push 2026-09-16) runs SAM 2, 2.1, 3 (with text
  prompts) and EdgeTAM "on CPU and Apple Metal" — no CUDA or Vulkan. On an M4 Pro, SAM 3 f16 takes
  7.7 s (Metal) / 23.8 s (CPU) per tracked frame; weights f16 1.7 GB, q8_0 1.0 GB, q4_0 673 MB. —
  *web (README, backends + licence), 2026-10-17; timings agent* · github.com/PABannier/sam3.cpp.
- **vision.cpp** (ggml, MIT; 58 stars, last push 2026-04-02): MobileSAM, BiRefNet,
  Depth-Anything, MI-GAN (inpainting), ESRGAN, on CPU and Vulkan. MobileSAM 19 ms at 1024² on an
  RTX 4070 (Vulkan, f16). — *web (README models/backends), 2026-10-17; timing agent* ·
  github.com/Acly/vision.cpp.
- **samexporter** (MIT; 430 stars, last push 2026-08-30) exports SAM 3 to ONNX as three models —
  image encoder, text encoder, decoder — with text, point and box prompts; also SAM 2/2.1,
  MobileSAM, EfficientSAM. Whether DirectML or WebGPU run its graphs: unknown. — *web (README),
  2026-10-17* · github.com/vietanhdev/samexporter.
- **onnxruntime-node** on Windows x64 ships CPU, DirectML and WebGPU (experimental); CUDA is
  Linux-only. DirectML is in "sustained engineering". — *agent, 2026-10-17* ·
  github.com/microsoft/onnxruntime/blob/main/js/node/README.md.
- **transformers.js v4** (4.0.0, 2026-03-30) runs in Node with `dml`, `webgpu` and `cpu` on
  Windows; it supports SAM2, SAM3 Tracker (points/boxes only), EdgeTAM, Florence-2, Grounding
  DINO, OWLv2, SegFormer, ViTMatte, CLIPSeg. — *agent, 2026-10-17* ·
  huggingface.co/blog/transformersjs-v4.
- Speeds found: SAM 3 on an RTX 3090 (PyTorch, 1008 px) encodes in 390 ms f32 / 110 ms bf16, text
  detection 70 / 22 ms. MobileSAM at 1024² on a Ryzen 5 5600X CPU: 669 ms vision.cpp, 805 ms ONNX
  Runtime. EfficientSAM-Ti on an 8-core i9 CPU (ONNX Runtime): 966 ms encode, 42 ms per box. —
  *agent, 2026-10-17* · github.com/facebookresearch/sam3/issues/424 · vision.cpp README.
- **Estimate, not measured:** SAM 3 encode on the 2070 SUPER ≈ 0.3–1.5 s (390 ms × 35.6 / 9.1
  TFLOPS f32 = 1.5 s upper bound; fp16 faster); MobileSAM-class on the 5700X CPU ≈ 0.6 s.
- **Why sam3.cpp has no CUDA:** ggml has no CUDA kernel for `WIN_PART` / `WIN_UNPART`, and ggml's
  CUDA flash attention rejects SAM 3's head size 32. A fork, `peters/sam3.cpp` branch
  `cuda-backend` (last commit 2026-04-10), rewrites window partition as reshape + permute and falls
  back to plain attention — no new kernels; its RTX 4080 log shows image encode 716 ms on CUDA vs
  2,996 ms on CPU. Upstream PR #15 "Add CUDA backend support" is open since 2026-08-05; ggml PR
  #1590 (CUDA win_part ops) is open since 2026-08-18. — *web (branch, doc, PR), 2026-10-17* ·
  github.com/peters/sam3.cpp/blob/cuda-backend/docs/cuda_performance.md ·
  github.com/PABannier/sam3.cpp/pull/15.
- `mimi3421/sam3.cpp` publishes a Windows Vulkan build (`sam3-win-x86_64-vulkan.zip`, releases
  2026-04-16 and 04-29); no timings. — *web (releases), 2026-10-17*.
- **ONNX Runtime v1.31.0** (2026-10-09) ships Windows x64 C/C++ packages for CPU, `gpu_cuda12` and
  `gpu_cuda13` — CUDA on Windows through the native API, unlike the npm binding. — *web (release
  assets), 2026-10-17* · github.com/microsoft/onnxruntime/releases/tag/v1.31.0.
- Other native engines: candle (Rust; SAM, SegFormer, YOLOv8 examples; CPU/CUDA), ncnn (Vulkan; no
  SAM port), MNN (CUDA/Vulkan; no segmentation demos), `ultralytics-ggml` (YOLO in ggml with
  CPU/CUDA/Vulkan — **AGPL-3.0**, and Ultralytics says trained YOLO models are AGPL by default). No
  ggml port of Grounding DINO, Florence-2, SegFormer, Mask2Former or RT-DETR exists. TensorRT 11.4
  still supports SM 7.5. — *agent, 2026-10-17* · github.com/huggingface/candle ·
  github.com/Tencent/ncnn · ultralytics.com/license.
- llama.cpp's Qwen3-VL box issue #17131 (boxes wrong vs transformers) closed 2025-12-29; current
  box accuracy is unmeasured. — *agent, 2026-10-17* · github.com/ggml-org/llama.cpp/issues/17131.

## 5 · Tinting

- Behr's "Paint Your Place" patent (US10416790B2) recolors in LAB: the paint's a/b, and new L =
  (pixel L ÷ surface base L) × paint L, plus a correction scaled by (base L − paint L) ÷ 1.5 so
  light-on-dark and dark-on-light don't look too bright or dark; client-side in browser JS. —
  *agent, 2026-10-17* · patents.google.com/patent/US10416790B2.
- The SWIMC patent stores each pixel's difference from the surface's median HSL as an adjustment
  map and re-applies it to the new color; sheen is not rendered. — *agent, 2026-10-17* ·
  US12361613B2.
- The CSS/Canvas `color` blend mode is SetLum(paint, Lum(photo)) and runs natively on the GPU; it
  keeps the photo's own brightness, so dark siding cannot turn white. OKLCH keeps perceived
  lightness when hue changes; HSL does not. — *agent, 2026-10-17* · w3.org/TR/compositing-1.
- Edge refinement options: a guided filter on an upsampled low-res mask; SAM mask → trimap →
  ViTMatte (MIT, in transformers.js); HQ-SAM for thin structures. — *agent, 2026-10-17* ·
  github.com/hustvl/Matte-Anything · arxiv.org/pdf/2306.01567.
- **Estimate:** a 12 MP recolor is ~144 MB of buffer traffic ≈ 0.3 ms at the card's 448 GB/s —
  real-time.

## 6 · Generative edits on this machine

- **stable-diffusion.cpp** (ggml) publishes prebuilt Windows zips for CUDA 12, Vulkan and CPU
  (latest `master-973-f0aac52`, 2026-10-17). — *web (GitHub releases), 2026-10-17*.
- Its `sd-server` speaks OpenAI-style `POST /v1/images/edits` (images plus an optional mask), A1111
  `/sdapi/v1/img2img`, and an async job API; `--offload-to-cpu` streams weights from RAM; the text
  encoder can run on the CPU (`--backend diffusion=cuda0,te=cpu`). Edit models supported:
  Kontext, FLUX.2, FLUX 3 Klein, Qwen-Image-Edit, Qwen-Image-2.1, LongCat and others. — *agent,
  2026-10-17* · github.com/leejet/stable-diffusion.cpp/blob/master/docs/edit.md ·
  examples/server/api.md.
- An open issue: Turing is ~2× slower per step since a ggml bump (#1818, opened 2026-07-25,
  RTX 2080 Ti, Z-Image Q3_K). — *web, 2026-10-17* · github.com/leejet/stable-diffusion.cpp/issues/1818.
- **RTX 2070 8 GB, CUDA, stable-diffusion.cpp, text-to-image 1024²:** FLUX.2 klein 4B (q8_0, cfg 1,
  4 steps) 2.29 s/it; Z-Image-Turbo (Q3_K_M) 4.72 s/it. No Turing measurement exists for an
  edit with a reference image. — *web (PR #1228 comment, 2026-01-24), 2026-10-17*.
- **FLUX.2 [klein] 4B** (2026-01-14): Apache-2.0, 4 steps, Qwen3-4B text encoder; GGUF Q4_0 2.5 GB
  / Q8_0 4.3 GB. The 9B klein is non-commercial. — *web (licence via HF API), 2026-10-17; sizes
  agent* · huggingface.co/black-forest-labs/FLUX.2-klein-4B.
- **FLUX 3 Image Klein** (2026-10-13): licence "flux-kommunity-license", gated; 5.6B, 16 steps,
  needs Qwen3-VL-4B and a 9B prompt upsampler. — *web (licence via HF API), 2026-10-17; the rest
  agent*.
- Qwen-Image-Edit-2511: 20.4B, Apache-2.0, Q4_K_M 13.2 GB, needs Qwen2.5-VL-7B; Lightning LoRA →
  4–8 steps. LongCat-Image-Edit-Turbo: ~6B, Apache-2.0, 8 steps. FLUX.1 Kontext [dev]: 12B,
  non-commercial model licence. Qwen-Image-2.1: 7B, research-only. — *agent, 2026-10-17*.
- ComfyUI disallows fp16 for Qwen-Image(-Edit), FLUX 3 and Z-Image, so on Turing (no bf16) they
  run in fp32; Nunchaku's Turing path covers only FLUX.1 and Z-Image-Turbo (Qwen renders black on
  20-series). — *agent, 2026-10-17* · github.com/Comfy-Org/ComfyUI/pull/16995 ·
  github.com/nunchaku-ai/nunchaku/issues/910.
- **Estimates, not measured** (from the 2070 numbers × 2.1 for an edit vs a generation): FLUX.2
  klein 4B ≈ 20–30 s per 1 MP edit; LongCat-Turbo ≈ 1 min; Qwen-Edit-2511 + Lightning ≈ 1.5–2 min;
  Kontext ≈ 3.4–5.7 min. CPU-only generation on the 5700X ≈ 15–20 min per edit — too slow.
- No open model reliably hits a hex color: ACBench-Edit (mean in-mask sRGB error) scores
  Qwen-Image-Edit 54.4, FLUX.2-4B 58.9, FLUX.2-dev 68.9 of 100; GenColorBench has most models
  under 10% on numeric colors. — *agent, 2026-10-17* · arxiv.org/html/2609.20816 ·
  arxiv.org/html/2510.20586.

## 7 · Generative edits in the cloud

- Gemini API prices per output image (standard tier): Nano Banana 2.1 `gemini-nano-banana-2.1`
  $0.0336 1K / $0.0504 2K / $0.113 4K; Nano Banana 2 `gemini-3.1-flash-image` $0.067 1K; Nano
  Banana Pro `gemini-3-pro-image` $0.134 1K–2K / $0.24 4K. No free tier for image output in the
  API. `gemini-2.5-flash-image` shut down 2026-10-02. — *web, 2026-10-17* ·
  ai.google.dev/gemini-api/docs/pricing.
- Gemini image editing has no mask parameter — region edits are prompt-only. Every generated image
  carries a SynthID watermark. — *agent, 2026-10-17* · ai.google.dev/gemini-api/docs/image-generation.
- Latency: Nano Banana 2 median 8.6 s, Pro 16.4 s (Artificial Analysis, text-to-image); one user
  report puts Nano Banana 2.1 edits at ~13 s (1K) and ~25 s (2K). — *agent, 2026-10-17* ·
  artificialanalysis.ai/image/models.
- PaintBench (synthetic flat shapes recolored to a hex): share of edit-region pixels in the right
  color — Nano Banana 2 66.7%, GPT-Image-2 59.3%, Qwen-Image-Edit-2511 32.9%, FLUX.2-dev 28.2%,
  Kontext-dev 14.6%; at an exact match every model is near zero. — *agent, 2026-10-17* ·
  arxiv.org/html/2606.00188v1.
- Users report a pink cast on Nano Banana Pro / 2 edits at 2K–4K that compounds with re-edits. —
  *agent (user reports, 2026-07 to 09), 2026-10-17* · discuss.ai.google.dev/t/176315.
- housepaint.ai and Sherwin-Williams name no generative model. HomeGPT's privacy policy (updated
  2026-10-16) does: "Runware, running OpenAI image models, receives your photo and the design
  instructions to produce design images". — *web, 2026-10-17* · homegpt.app/privacy §4 (was: "no
  model is named by HomeGPT" until 2026-10-17).

## 8 · Open source to build on

- No open-source project paints house exteriors with automatic part detection. What exists is
  interior-wall demos: `bjekic/WallSegmentation` (BSD-3, 46★, PSPNet on ADE20K walls, masks only),
  `WallAura` (MIT, interior, SegFormer-b0 + a PBR-style blend with sheen levels, 552 swatches),
  `ArtyomZemlyak/wall-recolor` (MIT, SAM + "illumination-aware recolor"), `house-paint-api` (no
  licence, FastSAM via Replicate). Useful as recolor references only. — *agent, 2026-10-17*.
- No model with a clean licence covers siding, trim, fascia, soffit, shutters or gutters. The
  closest: BRAILS facade parser (NHERI SimCenter; facade / roof / window / front door; weights CC BY
  4.0, 2021) and its garage detector (CC BY 4.0); Roboflow Universe "House DataSet" lists Wall /
  Roof / Gutter / Trim on 344 images (CC BY 4.0 — from search snippets, unverified). — *agent,
  2026-10-17* · zenodo.org/record/5809365 · universe.roboflow.com/house-dataset/house-dataset-aaed5.
- Licence traps: NVIDIA's SegFormer weights are non-commercial; ADE20K images are non-commercial
  research only (annotations BSD-3); Ultralytics YOLO is AGPL-3.0. An Apache-2.0 option for training
  our own part model: RF-DETR-Seg (Roboflow, 2026-01-22; the XL/2XL detection models are PML 1.0). —
  *agent, 2026-10-17* · github.com/NVlabs/SegFormer · ade20k.csail.mit.edu/terms ·
  roboflow.com/blog/rf-detr-segmentation.

## 9 · Measured on this machine — probe round 1

All *measured, 2026-10-17* on the RTX 2070 SUPER 8 GB / Ryzen 7 5700X (§1), one engine at a time.
Inputs, outputs and logs: `data/probe/` (gitignored; `photos/SOURCES.md` credits the two test
photos — a white Colonial with shutters, overcast; a beige split-level over stone veneer, sunny).
Paint values: Sherwin-Williams' own color API (`api.sherwin-williams.com/prism/v1/colors/sherwin`,
2,004 colors with hex, RGB, LAB, LRV, `isExterior`).

**Builds.** sam3.cpp upstream (`416186c`) builds for the CPU in 21 s; the CUDA fork
(`peters/sam3.cpp` `cuda-backend` `bf83144`, `-DSAM3_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=75`) in
386 s with VS toolset 14.44 + CUDA 12.4 (the audio.cpp recipe), `-DBUILD_SHARED_LIBS=OFF` (else the
exes can't find ggml's DLLs), and CUDA 12.4's cudart/cublas DLLs copied beside the exes because PATH
lists CUDA 12.1 first. The fork's ggml is upstream's plus one 16-line dispatch fix
(`ggml-cuda/binbcast.cu`). Neither tree has a still-image CLI; a 231-line
`examples/segment_cli.cpp` was added for the probe (uncommitted, throwaway).

**Vision model** — Qwen3-VL-8B-Instruct Q4_K_M + F16 mmproj on the kit's `llama-server` b11239
(CUDA 12):
- Fully on the GPU at `-c 6144`: 7.65 GB of 8 GB in use. Describing a house as JSON (style; the
  surfaces that won't be painted, with hex estimates; the paintable ones with current colors;
  sunny/overcast) takes 3.8–4.3 s, and both answers were right (white Colonial, black shutters,
  #333333 roof, brick chimney; beige siding #e0d4b5 over stone #8b7d6a, sunny).
- On the CPU (`-ngl 0 --no-mmproj-offload -t 8`): the same description in 32.7 s (12.2 s reading
  the image and prompt, ~20 s writing 165 tokens).
- Boxes for parts are not usable as masks: right for discrete objects (garage door, front door),
  wrong for surfaces (siding, trim, fascia and soffit all got the same whole-house boxes), and it
  boxes parts that aren't there (shutters, porch columns on the split-level) even when told to
  leave them out. Writing boxes is output-bound (~62–66 tok/s): 11–67 s. The first request after
  load spent 32 s reading the prompt; warm, ~2 s.

**SAM 3 text prompts** — sam3.cpp, `sam3-f16.ggml` (1.8 GB):
- GPU (the CUDA fork): image encode 3.3 s warm (3.6 s first), each text prompt 0.34–1.15 s (longer
  with more detections); model load 1.7 s; GPU memory ~3.6 GB above idle. About 10 s for a house
  with ~10 prompts, once per photo.
- CPU (upstream, 16 threads): encode 24.5 s, each prompt 2.5 s — ~50 s for a house. Same detection
  as the GPU (garage door 0.966, same box).
- Found at the default 0.5 score: garage door (0.97/0.94), front door, windows (17 / 8), shutters
  (18), roof, stone wall, porch column, gutters, trim (good on the split-level, one band only on the
  white house). Returned nothing for parts that aren't there (no invented shutters, columns or stone).
- Missed: "siding" and "wall" found nothing on the white house, but "exterior wall" scored 0.72 (and
  "siding" reaches 0.50 at a 0.3 threshold). "fascia" and "soffit" found nothing even at 0.2.
- The wall masks stop cleanly at occluders (the car, shrubs); they leave gaps on gable ends and
  under branch shadows.

**Tap / box prompts** (for touch-ups), garage-door box:
- SAM 2.1-small: CPU encode 2.33 s + 0.19 s per box; CUDA 0.11 s + 0.08 s.
- EdgeTAM: CPU encode 0.70 s + 0.18 s per box; CUDA 0.25 s + 0.08 s. Both masks within 3% of SAM 3's.

**The tint** (JS — `sharp` + `culori`; ΔE2000 of the median of the wall's normally lit pixels
against the paint's published hex):

| Test | ratio (paint × lighting) | naive multiply | CSS `color` blend |
|---|---|---|---|
| white house → Positive Red #ad2c34 | 0.47 | 11.1 (#781e24) | 30.4 (#ff8d94) |
| white house → Naval #2f3d4c | 0.33 | 6.3 | 46.9 |
| split-level → Alabaster #edeae0 | 0.64 | 9.1 | 4.7 |
| split-level → Positive Red | 0.47 | 6.1 | 40.4 |

By eye, the ratio results look like painted houses (texture and shadows kept); the multiply reads
darker than the chip.

**FLUX.2 klein 4B edits** — stable-diffusion.cpp `master-973-f0aac52` CUDA 12 prebuilt,
`flux-2-klein-4b-Q8_0.gguf` + `Qwen3-4B-Q8_0.gguf` + BFL's klein VAE (the diffusers-format
`vae/diffusion_pytorch_model.safetensors` loads), `--offload-to-cpu`, 4 steps, cfg 1, euler:
- Text-to-image 1024²: 1.60 s/step, 12.1 s generate, 14.2 s wall, 5.9 GB GPU peak — faster than the
  2.29 s/step reported 2026-01-24, so issue #1818's Turing slowdown doesn't hit this model.
- Edit with a reference photo, 1024×768: 2.63 s/step, 15.9 s generate, ~18 s wall, 6.4 GB GPU peak.
- Vulkan prebuilt: 2.19 s/step but 30.2 s generate, 33.5 s wall. CPU only: 36.3 s/step at 512×384 —
  a full-size edit would be ~10 min, not usable.
- The AI's color misses the chip: ΔE 9.4 (white house → "Positive Red" came out #884842), 5.9
  (Alabaster came out cream #e5dfc7), 10.0 (#7d2f34). It also changes the photo outside the wall
  (mean |difference| 12–18 of 255) — and paints what the masks missed (gables, the sided chimney).
- Pasting it back inside the SAM 3 mask and locking the color (paint × the render's own lighting)
  brings the lit wall to ΔE 0.21 / 0.43 / 0.00 — but where the render is shifted against the photo,
  its window trim lands inside the photo's mask and comes out pink. Locking needs the render aligned
  to the photo (or the mask taken from the render) first.

## 10 · Paint color data

Not legal advice — what the sources say.

- **Sherwin-Williams' public feed**: `api.sherwin-williams.com/prism/v1/colors/sherwin?lng=en-US`
  returns 2,004 colors (number, name, hex, RGB, LAB, LRV, `isExterior`/`isInterior`, families,
  coordinating colors) with no login; it is what SW's own visualizer loads. The same host serves
  `/colors/valspar` and `/colors/lowes` (HGTV Home). — *web, 2026-10-17 (sherwin); the other two
  agent*.
- **Behr's public files**: `behr.com/colors/color-detail/query-index.json` returns 5,178 colors
  (2,629 current, 2,549 archived) with color-code, color-name, rgbhex, r/g/b, lrv, color-family,
  premium-color, archived, description — no key. `behr.com/mainrefreshservice/services/color2019/all.js`
  (6,270 rows, hex, CIELAB, neighbour colors, no LRV) feeds ColorSmart, which derives LRV from L*. —
  *web (query-index: HTTP 200, 3.49 MB, 5,178 rows), 2026-10-17; the rest agent*.
- **The brands' terms**: Sherwin-Williams (effective 4/15/2025) — "use any robot, scraper, spider, or
  other automated means to access or gather content" and "publicly display any content from the
  Websites on or in connection with any other website or application" are prohibited; content is
  "for personal and noncommercial use only"; "The compilation of the Content on the Websites is the
  exclusive property of Company." Behr — personal, non-commercial copy only; no downloading
  quantities of content into a database; no robots or data-mining; no trademark licence. — *web
  (SW terms), 2026-10-17; Behr agent (behr.com blocks fetches; Wayback)*.
- **Official free downloads**: Sherwin-Williams offers Excel (color name, number, locator, RGB,
  hex), PDF, JPG, ACO, ASE and ACB palettes with no login and no licence text shown (files dated
  2021). Behr offers ASE, SKP and JPG libraries "for professionals and design creatives" (ZIPs named
  2020). Neither has a developer API, data licence or partner programme for apps. — *web (SW page),
  2026-10-17; Behr agent* · sherwin-williams.com/architects-specifiers-designers/color/color-tools/downloadable-color-palettes.
- **What others do**: open-source projects mostly commit a snapshot (jpederson/colornerd — 29,875
  swatches, SW 1,526, Behr 4,699, last commit 2020, source unstated, values drift from the live
  ones; glamp/sherwin-williams from SW's 2019 XLSX; coryking/colormapper — Behr's query-index, MIT,
  2026-08); four tiny projects fetch SW's feed at run time. housepaint.ai names no data source.
  PaintDB claims 51,000+ colors from 27 brands under "CC BY 4.0" — its right to license brand data is
  unknown. — *agent, 2026-10-17*.
- **Which paint makers allow what — the other brands** (2026-10-18, a research agent for the user's question "is
  there any paint manufactures that dont forbid download or that we can get updated list without violation?"; V =
  read on the page, S = secondhand; not legal advice — a terms page silent on robots isn't permission):

  | Brand | Automated access | Official download | Reuse | API / partner | Source |
  |---|---|---|---|---|---|
  | Benjamin Moore | not mentioned (V); personal use only (V) | per-collection ASE | beyond personal needs "express prior written consent" (V) | none found | benjaminmoore.com/en-us/legal-benjamin-moore-co-website-terms-and-conditions (eff. 2024-09-24) |
  | PPG / Glidden | not mentioned in either terms page (V) | 2025 XLSX, 2020 ASE/ACO (V) | "for your own personal or internal business use" (V): unmodified, keep the copyright notice, nothing against its commercial interests | none found | ppg.com/en-US/about-ppg/legal-notices (eff. 2025-10-06) · pittsburghpaintsco.com/terms-of-use (eff. 2025-04-03) |
  | Valspar | valspar.com's terms redirect to Sherwin-Williams' (V): the robot ban applies | not checked | SW's | none | (V) |
  | Dunn-Edwards | not mentioned (V) | swatch files; the pro library may need an account (S) | personal use; no reuse or reposting (V) | none found | dunnedwards.com/terms-of-use (eff. 2023-02-01) |
  | Farrow & Ball | site terms cover sales (V); business use needs "a licence from Farrow & Ball" (V) | none found (S) | none | none found | farrow-ball.com/terms-and-conditions · /us/inspiration-terms-conditions |
  | Dulux UK (AkzoNobel) | automated extraction banned "for commercial purposes" only (V); claims database rights | none found | lifted by "a written agreement" (V) | none found (S) | dulux.co.uk/en/legal |
  | Dulux AU | not mentioned (V) | Colour Atlas RGB; Revit/ArchiCAD XML (S) | "prior written permission" (V) | none found | dulux.com.au/site-terms |
  | Kelly-Moore | its site didn't answer (closed 2024) | no data release found | — | — | searches |
  | Resene | no robot clause (V); one copy for personal transitory viewing (V) | colour library with RGB | its 2001 RGB list: "to use it for any purpose is granted" (V, on people.csail.mit.edu/jaffer/Color/Resene-License); it "does regularly give permission" for business use (V) | requests to update@resene.co.nz (V) | resene.co.nz/terms-conditions.htm · /image-rights-and-use.htm |

  No brand runs a public programme that gives apps colour data; private deals exist (Nix: "We've partnered directly
  with the paint brands" — SW, BM, Behr, PPG, Dulux, Farrow & Ball (V); Houzz Pro integrates SW's catalog (V, 2022);
  Chief Architect lists Behr, BM, SW as catalog partners (S)). The only brand-granted open licence found: Resene's 2001
  list. Cleanest routes, in order: written permission (Resene invites requests; Farrow & Ball and Dulux UK name a
  licence or agreement route); PPG's official XLSX on the user's computer (no robot ban; personal or internal use;
  unmodified, copyright kept); Benjamin Moore's official ASE files (no robot ban; personal use); then Dulux UK and
  Dunn-Edwards. Not clean: Sherwin-Williams, Valspar and Behr. Not checked: Valspar's own downloads, Dulux US, the
  licence of Resene's 2010 list. — *agent, 2026-10-18*.
- **Law**: US — facts aren't copyrightable and a compilation is protected only for its original
  selection/arrangement (Feist v. Rural, 1991); names and short phrases aren't copyrightable (37 CFR
  202.1(a)); naming another company's product to refer to it is nominative fair use. Terms-of-use
  anti-scraping clauses have been enforced as contracts (hiQ v. LinkedIn, 2022). EU — the database
  right (Directive 96/9/EC art. 7) protects against extracting a substantial part. GitHub's DMCA
  archive has two Pantone takedowns of color libraries (2022, 2024) and none from a paint brand;
  no paint-brand lawsuit over color data was found. Resene once licensed its RGB list openly (2001)
  — a precedent for asking. — *agent, 2026-10-17*.

**Brands beyond SW and Behr** (*agent, 2026-10-17*, not re-checked):
- US retail unit share, Q4 2025 (OpenBrand POS panel; dealer stores under-covered): Behr 31.1%, Glidden
  17.9%, Valspar 16.4%, Sherwin-Williams 8.2%, PPG 3.6%; Home Depot 58.5% of units, Lowe's 35.4%, Ace
  6.1%. Sherwin-Williams, Pittsburgh Paints Co (AIP — bought PPG's US/Canada architectural paint,
  2024-12, with Glidden), Masco (Behr) and Berkshire Hathaway (Benjamin Moore) hold >90% of North
  American architectural coatings (ChemQuest 2025). J.D. Power 2026 exterior paint: Behr 739, SW 722,
  Benjamin Moore 720.
- Who sells what: Home Depot — Behr (exclusive), Glidden, PPG, KILZ, Rust-Oleum; Lowe's — Valspar, HGTV
  Home by Sherwin-Williams, SW lines; Walmart — Glidden; Menards — Pittsburgh Paints, Dutch Boy; Ace —
  Benjamin Moore, Clark+Kensington, Magnolia Home. Kelly-Moore closed in January 2024.
- Data: the SW host also serves `/prism/v1/colors/valspar` (1,596), `/lowes` (Valspar + HGTV, with LRV),
  `/hgtv` (930), `/dutchboy` (1,340, LRV) and `/minwax` (613) — no key, HTTP 200 — under SW's terms.
  Benjamin Moore: "over 3,500" colors; its old `/api/colors` now loops (302); official ASE/ACB/SKP files
  per collection. PPG/Glidden (shared numbering): official XLSX of 2,168 colors with R,G,B and LRV (no
  hex), plus ACO/ASE/ACB. Dunn-Edwards: 2,006 colors, swatch files, no feed. Farrow & Ball: 132, no feed.
- Competitors carry SW, Benjamin Moore, Behr, PPG, Valspar, Dunn-Edwards, Farrow & Ball (housepaint.ai);
  PaintDB lists 27 brands under "CC BY 4.0" (third-party gathered; its licence can't grant more than
  the brands allow). Outside the US: Dulux leads the UK and Australia; Canada is Behr, Benjamin Moore,
  Sico/Dulux.

**Probe round 2 — finding parts** (*measured, 2026-10-17*, GPU, the CUDA fork, `--texts` = one encode):
- One encode + 15 part names: 10.5 s (house1: encode 3.6 s + 6.9 s of prompts) and 12.2 s (house2),
  model already loaded. New names that work: "chimney" (0.91 / 0.72), "lamp" (3 each), "door".
- **Body by subtraction** ("house" minus roof, windows, shutters, doors, garage door, columns, chimney,
  gutters, trim, stone, lamps, railings, then an OKLab a/b check): on the white house it covers all the
  siding, both gables included — which "exterior wall" missed. Failures: "house" also matched the
  neighbor's house on the split-level (needs the main instance only); subtracting "chimney" removed a
  chimney clad in the same siding (chimneys and columns should be decided by material); on a white
  house white trim can't be told from white siding by color.
- **"Tap one, find all"** (SAM 3 exemplar boxes): sam3.cpp expects the boxes **normalized to 0–1**, not
  pixels as its header comment says (pixel boxes took 14–57 s and found nothing); and an example box
  needs a phrase — with the placeholder "visual", one shutter found all 18 in 0.78 s. It found no fascia,
  with "visual" or "fascia", even from a correct example box.
- **One tap** (a point, PVS): SAM 2.1-small turned one tap on the fascia into the whole run, gutter
  included, cleanly (score 0.94, 0.13 s); EdgeTAM got the run but scattered speckles onto the roof.

**SAM 3 through ONNX Runtime in Node** (*agent (measured on this machine), 2026-10-17*, not re-run by
this session):
- samexporter's published bundle (`huggingface.co/nrl-ai/samexporter-onnx-models`, folder `sam3/`,
  exported from facebook/sam3 at opset 18; fp32 only; SHA-256 checked): image encoder 1.82 GB, language
  encoder 1.41 GB, decoder 0.13 GB — 3.36 GB. The image encoder takes uint8 [3,1008,1008] (stretched, the
  graph normalizes); the language encoder int64 [1,32] CLIP BPE tokens **padded with 0** (the graph's
  mask is `tokens != 0`); the decoder takes up to 8 normalized cx/cy/w/h boxes and returns 200 masks at
  288×288 with score σ(logit)·σ(presence). `facebook/sam3`'s tokenizer is gated; the public
  `openai/clip-vit-base-patch32` tokenizer.json via `@huggingface/tokenizers` reproduces samexporter's
  test token IDs exactly.
- onnxruntime-node 1.30.0, **CPU**, the 2765×2074 photo: image encode 13–16 s (sam3.cpp CPU: 24.5 s),
  text encoder 48–68 ms per prompt, decoder 1.65–2.0 s per prompt (sam3.cpp: 2.5 s); the garage door
  scored 0.970 with box IoU 0.995 and mask IoU 0.991 against sam3.cpp's. Peak RSS 10.8 GiB with the
  default memory arena, 6.7 GiB with it off. DirectML and WebGPU: not yet run.
- The pre/post-processing (0-padding, the score, the 288→full bilinear upscale, de-duplication) is a JS
  port of samexporter's `sam3_onnx.py` — no JS runtime for this bundle exists. Probe:
  `scratchpad/probe-onnx/sam3-onnx.js`.

**Probe round 2 — tint v2, a dark house, masked AI** (*agent (measured on this machine), 2026-10-17*,
not re-run by this session; images in `data/probe/out/r2/`):
- **A dark house** (house3 — a UK cottage, dark navy weatherboard, overcast; CC BY-SA 4.0, credited in
  `photos/SOURCES.md`): SAM 3 found house, siding (0.78), exterior wall, roof, all 4 windows, 3 doors, 23
  trim pieces, the chimney, and nothing for the absent garage door, shutters, lamps or stone. Its
  mistakes: "house" took a dark fence, "siding" the neighbor's fence panel, "exterior wall" the brick
  chimney. Dark navy → Alabaster with the ratio tint: lit ΔE 0.21, but the stain's grain, knots and
  mottling come out as blotchy grey ("weathered whitewash"), and 18.7% of the painted pixels clip.
- **Tint v2** (a guided filter on the log lighting inside the mask, detail damped by
  k = (Ybase/Ypaint)^(1/3), the light's color kept at α·k, OKLCH gamut mapping): lit ΔE unchanged
  (0.47 / 0.64 / 0.56); at settings that keep thin shadow edges it is only slightly calmer than the
  ratio tint on the dark house (L* spread 6.45 vs 6.77 at texture scale). A stronger filter (radius 30,
  eps 1) looks like fresh paint but loses thin branch shadows and adds a bright speckle on lap lines.
  These photos show no measurably blue shade; an unscaled α of 0.5 tints the dark house's shade cyan.
  For dark → light, the open problem is the wood texture, not sensor noise.
- **Masked AI** (stable-diffusion.cpp + FLUX.2 klein 4B, house1 → Positive Red, 4 steps): `-r` with a
  mask turns everything outside grey-brown; `-i` with a mask (strength 0.75–1.0 are identical at 4
  steps) invents a different building. `-i` + `-r` + mask (strength 1.0) is coherent, aligned and
  seamless — 18.4 s, 6.41 GB — but nothing outside is pixel-identical (the whole frame goes through the
  VAE: an all-black mask alone changes it by 8.3/255, PSNR 26.3 dB), so a pixel paste-back is still
  needed; with it, no seams are visible. The lock then hits the paint (lit ΔE 0.43) but inherits the
  AI's lighting: it lit the left wing lighter and pinker, so one paint reads as two colors (whole-wall
  ΔE 17.6, against 1.97 for the plain tint on the same mask). The pink trim comes from white trim inside
  the body mask, not from misalignment.

**The paint data module, built** (*agent (measured on this machine; one live fetch per feed), 2026-10-17/18*,
not re-run by this session; code in the app's `server/src/paints/`):
- **Feeds, live:** SW `/sherwin` 200 — 2,004 rows → 1,948 after dropping 56 `ignore` duplicates; LRV on 1,911
  (37 had LRV ≤ 0, treated as missing); exterior flags on all (1,795 true, 153 false); coordinating colors on
  1,746. `/lowes` 200 — 2,496 rows = all 1,596 of `/valspar` (same hex) + 900 of `/hgtv`'s 930, all with LRV,
  no exterior flags. `/dutchboy` 200 — 1,340 with LRV. Behr `query-index.json` 200 — 5,178 rows (2,549
  archived), LRV on all, no exterior flags, no coordinating colors. Behr's HTML pages answer 403 (Cloudflare)
  even with a browser User-Agent; the JSON needs no headers. No evasion was tried.
- **Field shapes:** SW host — colorNumber, name, hex, red/green/blue, hue/saturation/lightness, lab{L,A,B},
  lrv, isExterior/isInterior (SW only), colorFamilyNames[], brandedCollectionNames[],
  coordinatingColors{coord1ColorId, coord2ColorId, coord3ColorId | whiteColorId}, similarColors[],
  storeStripLocator, isDark, archived, ignore; HGTV's colorNumber is the SW number (894 of 930 match an SW row's
  number and hex). Behr — an AEM sheet {total, offset, limit, data, columns} with color-code, color-name,
  rgbhex (no "#"), color-r/g/b, lrv (strings), color-family, premium-color, archived, tags, description.
  The feeds' own Lab equals culori 4's lab65 of their hex within 0.01.
- **Official files** (no login, no licence text on the pages): Benjamin Moore per-collection ASE at
  `benjaminmoore.com/-/media/sites/benjaminmoore/files/palettedownloads/ase/en-us/benjaminmoore_<collection>_en-us.ase`
  (classiccolors 1,680 colors, colorpreview 1,232, …; no single all-colors file); PPG/Glidden: a 2025 XLSX
  ("PPG-Voice-of-Colour-Palette_RGB-and-LRV-Values-2025.xlsx", R/G/B + LRV, no hex) and 2020 ASE/ACO — **2,108**
  colors each (was: 2,168 in this register until 2026-10-18). The 2025 XLSX revises the colors: same codes,
  only 158 hexes identical, mean ΔE2000 1.24, max 19.8, 34 names differ — the XLSX is the current one.
- **The palette pages, read by the app** (2026-10-18, the user's go "color list is fine go"): Benjamin Moore's
  `benjaminmoore.com/en-us/architects-designers/download-benjamin-moore-color-palettes` (HTTP 200, 250 KB) links 11
  ASE files — affinity, americascolors, classiccolors, colorpreview, colorsforvinylsiding, colorstories,
  designerclassics, historicalcolors, off-whitecolors, williamsburgcolorcollection (`/-/media/…/palettedownloads/ase/
  en-us/benjaminmoore_<collection>_en-us.ase`) and `media.benjaminmoore.com/…/ColorTrends/2027/PaletteDownloads/
  2027_BenjaminMoore_ColorTrends_en-us.ase`; PPG's `ppgpaints.com/designers/professional-color-tools/palette-downloads`
  links the 2025 XLSX on its site host (`cdn.prod.website-files.com/<generated>/…RGB-and-LRV-Values-2025.xlsx`) and the
  2020 ASE/ACO (`sttageus2prd001.blob.core.windows.net/tag/other/VOC_2020_NumberSort.*`). Through the app's server
  (`paints/files.js`: the page's current links, the Import button's importers): **Benjamin Moore 4,056 colors in 4 s**
  (11 files, each code once — Chantilly Lace is both 2121-70 and OC-65, as BM sells it), **PPG / Glidden 2,108 in
  2 s** (PPG1136-2 Rainsong LRV 79, #dee8e3 — as published). The page, not a file address, is the source: PPG's
  file name is generated by its site host and BM's trends file carries the year.
- **No maintained ASE parser on npm** (adobe-ase 1.0.0: one release, 46 downloads/week; ase-utils: 2015,
  repo gone; ase-util: 2019; adobe_swatch_exchange_parser: 2023, 6/week); Adobe publishes no ASE spec. ACO
  follows Adobe's Photoshop File Formats Specification ("Color Swatches"); PPG's ASE and ACO agree on all
  2,108 colors read by the two parsers.
- **Speed:** nearest paint (OKLab shortlist, then ΔE2000) ~1.1 ms per query over 5,178 rows; five schemes
  6–13 ms. SW's coordinating colors are mostly whites and tans, so they rarely make a full body/trim/accent
  scheme alone.

**The SAM 3 part finder, built — ONNX Runtime in Node** (*agent (measured on this machine), 2026-10-18*, not
re-run by this session; code in the app's `server/src/segment/`; measurements and overlays in session
e638ccef's scratchpad `hp-staging/measure/`):
- onnxruntime-node 1.30.0 (MIT) on Electron 44's Node 24.21.0; the samexporter bundle pinned to
  `nrl-ai/samexporter-onnx-models@5050a79c` (`sam3/`, 7 files with the CLIP tokenizer from
  `openai/clip-vit-base-patch32@3d74acf9`, 3,364,167,120 bytes, SHA-256 checked). tokenizers.js
  `@huggingface/tokenizers` 0.2.0 (Apache-2.0). sharp's Windows binary is Apache-2.0 AND LGPL-3.0-or-later
  (libvips).
- **Image encoder on DirectML: 1.44 s warm (1.80 s cold) against 16.1 s on the CPU**; the language encoder is
  faster on the CPU (61–79 ms vs 80–333 ms); **the decoder can't be created on DirectML** (E_INVALIDARG, ORT
  1.30.0 Node and 1.24.4 Python — narrowed to `Reshape` with `allowzero=1`); a patched copy runs on DML but
  slower (3.05 s vs 2.0 s CPU); WebGPU 2.8 s and 7.7 GB GPU. So **~2 s per prompt on the CPU**, and a whole
  house (14 prompts) takes **28.5–29.3 s** with image-on-DML / language + decoder on the CPU (5.2 s load,
  peak RSS 5.9–6.8 GiB, +5.7 GB GPU while the image session lives). All on CPU: load 6.1 s, encode 16.1 s,
  RSS 6.28 GiB. CPU and DML garage-door masks: IoU 1.000000 (score 0.970; IoU 0.9914 against sam3.cpp's).
- **The decoder has no point input** — only `box_coords [8,1,4]`, `box_labels`, `box_masks`. A tap as a tiny
  box finds nothing at 0.5 without a phrase; **a box works**: a garage-door box 0.983 (IoU 0.992 vs the text
  mask), and one shutter box in "all" mode finds all 18 shutters.
- Parts found (threshold 0.5) on house1 / house2 / house3: body by subtraction 0.888 / 0.898 / 0.876; trim 1
  (eave band only) / 11 / 20; garage door 0.970 / 0.942 / none; shutters 18 / none / none; gutters none / 3 /
  1; windows 18 / 8 / 4; roof 2 / 4 / 5; stone none / 4 / none; "brick wall" none / 4 (the same pixels as
  stone) / 1 (the chimney). On house2 only one "house" instance scored over 0.5 (no neighbor).
- **Overlaps:** "door" contains the garage door (99.9% / 99.7%); "trim" contains the gutters (96–99%) and
  overlaps windows and doors by 21–27%; the body picks up bits of a black fence (house3) and concrete steps
  (house2). Not resolved by the engine.

**The AI photo engine, built — stable-diffusion.cpp's sd-cli** (*agent (measured on this machine), 2026-10-18*, not
re-run by this session; code in the app's `server/src/aiphoto/`; outputs in session e638ccef's scratchpad
`hp-staging/real/`):
- Pinned release `master-973-f0aac52` (2026-10-17), from
  `github.com/leejet/stable-diffusion.cpp/releases/download/master-973-f0aac52/`: win-cuda12-x64 343,638,522 B +
  a separate `cudart-sd-bin-win-cu12-x64.zip` 563,452,046 B (cudart + cuBLAS DLLs); win-vulkan 29.4 MB; win-cpu
  17.7 MB; macOS one universal arm64 + x86_64 zip (Metal present by symbol only, not run); Linux Vulkan / ROCm /
  CPU — **no Linux CUDA zip** (Docker images only). ROCm assets were renamed between master-951 and -954, so
  assets are matched by name pattern. SHA-256s in `ENGINE_RELEASES.pinned`.
- Models (Apache-2.0, pinned commits; SHA-256 match Hugging Face's LFS hashes): `leejet/FLUX.2-klein-4B-GGUF`
  flux-2-klein-4b-Q8_0.gguf 4,300,629,440 B · `unsloth/Qwen3-4B-GGUF` Qwen3-4B-Q8_0.gguf 4,280,405,792 B ·
  `black-forest-labs/FLUX.2-klein-4B` vae/diffusion_pytorch_model.safetensors 168,120,878 B.
- **sd-cli logs its progress on stdout**, not stderr (stderr carried only ggml start-up). Non-ASCII paths work.
- house1 body → Positive Red #ad2c34, working size 1024×768: **20.6–21.0 s** wall (sampling 4 steps at 2.6 s/it,
  the first 4.9 s; compose 1.2 s at 2765×2074); GPU peak 6,569–6,581 MiB; lit ΔE after the lock 0.00, the AI's
  own 10.26 (#7b3435), whole surface 13.03. At ~1 MP (1184×880): 25.7 s, 7,096 MiB, 3.77 s/it.
- **Another GPU user mid-run breaks it** — sd.cpp doesn't wait for memory (one run died at step 2, "cannot
  make enough memory available"; another took 37.9 s). Cancel kills sd-cli and frees the VRAM.
- Three surfaces in one run (one union mask, each named with its color in the prompt): 20.2–20.5 s; no color
  swaps, but every AI color is off (ΔE 7.9 / 14.1 / 12.4) until the lock (0.47 / 0.33 / 0.33).
- After the lock, white trim inside the body mask turns hot pink (the AI had kept it white); the left wing
  renders lighter, so one paint reads as two colors; holes in the mask show the old siding. With French
  surface labels the AI barely changed the color (ΔE 32.9) — the prompt's words must stay English.
- sharp returns 3 channels after blurring a 1-channel image (it silently broke the paste-back once).

- **Ordering by color** (measured 2026-10-18 on the user's ~17,100 loaded colors): the brands' own color
  families can't order a mixed list — Benjamin Moore and PPG / Glidden carry none; SW splits "White & Pastel"
  from "Neutral"; Valspar adds "Pink" and "Teal"; Dutch Boy and HGTV Home "Brown". The stored CIELAB gives
  every paint a hue angle and chroma (CIE LCh: h = atan2(b*, a*), C = √(a*² + b*²)). Chroma against the brands'
  labels: their Gray p50 3.8 / p90 7.7, Black 3.1 / 6.4, White 6.3 / 13.3, Neutral 9.4 / 17.1 (beiges), Brown
  15.3 / 26.1. A near-gray cut at C < 8 catches 62% of their Neutral/White/Gray/Black and pulls in 11% of their
  hue families (pale tints); at 6: 46% / 5%; at 10: 73% / 18%; at 12: 82% / 25%. The server's better-sqlite3
  has SQLite's math functions (`atan2`, `degrees`, `sqrt` — checked), so the order can be an ORDER BY over
  `lab_a`/`lab_b`/`lab_l` with no new column. The npm package color-sorter sorts an in-memory array by HSL —
  no paging, and HSL's hue is less even than LCh's.
  - **The family cuts** (2026-10-18, the same colors, chroma ≥ 8; the brands' Pink with Red, Teal with Blue): the
    LCh hue that misfiles the fewest brand-labelled colors between neighbours — red|orange **45°** (188 of 2,107
    misfiled), orange|yellow **72°** (227 / 2,177), yellow|green **98°** (189 / 2,587), green|blue **181°**
    (125 / 2,588), blue|purple **271°** (140 / 1,834), purple|red **333°** (68 / 1,763). Per family, p5–p95 of
    hue: red 354–44 (wrapping), orange 40–78, yellow 70–98, green 95–184, blue 183–270, purple 249–341. These
    are the seeded `paints.colorOrder` families; the hue bands of the order start at the reds' 333°, so the pinks
    near 350° open the reds instead of closing the purples. On SW (1,575 exterior colors): Neutrals 463, Reds 169,
    Oranges 212, Yellows 356, Greens 143, Blues 178, Purples 54 — the darkest navies (Indigo, Blueblood) land in
    Purples at the 271° cut, the price of the cut that misfiles least.
  - **SQLite's `mod` and `floor`** are there too (the server's tests run the order and the families on the
    synthetic OKLCH grid, every color in exactly one family).

- **The graphics card, one job at a time** (2026-10-18, the review before the release): the part finder (SAM 3,
  ~5.7 GB), the AI photo (sd-cli, ~6.4 GB) and a local AI model don't fit an 8 GB card together, so the server
  refuses (409 "gpu-busy", `jobs.js assertGpuFree`) an AI photo, a part search, a box or the local AI's schemes
  beside a running GPU job. The local check asks the kit's `resolveRoute(buildLlmConfig(), feature)` whether
  the feature's provider is `local-llamacpp` (a preset's override isn't seen — the kit's own
  `setLocalBusyGuard` sees it, but the kit installs that hook for its arbiter and keeps no way to chain a
  second). The kit's runner arbiter (`packages/core/src/runner/arbiter.js`: kinds, busy, admission and
  eviction) is the family's GPU-sharing piece for its own runner's models; putting SAM 3 and sd-cli under it
  is the standard route if one-at-a-time ever has to become sharing.

## 11 · The app, run for real (2026-10-18)

*Measured by this session on this machine (RTX 2070-class, 8 GB), through the app's own server on the
checkout's data folder (`npm run server`), then the desktop app (`dist/electron/UnPackaged`) driven by
Playwright against that server. Screenshots: session e638ccef's scratchpad `real-ui/shots/`.*

- **Installing the part finder through the app:** with the four ONNX files already in `data/models/sam3`
  (hard links to the probe's), `POST /v1/segment/install` checked each one's SHA-256 and downloaded only the
  missing `tokenizer.json` and `tokenizer_config.json` (the kit's `streamDownload`) — the job finished in a few
  seconds. The status's `downloadBytes` was then the whole bundle (3,364,167,120 B) even with most of it
  present ("3.1 GB" on the card for a 2 MB download); since fixed — it counts only the files not here at
  their full size (both engines; `tests/finder_status.test.js`).
- **Finding the parts of house1** (2765×2074, display copy 2048×1536): **39 s** for the job, the model's load
  included; 10 parts — body 492,210 px (0.91), trim 13,859 (0.58), front door 13,880 (0.71), garage door 61,370
  (0.97), shutters 55,835 (0.90), columns 2,500 (0.58), chimney 8,076 (0.92), roof 186,637 (0.95), windows 78,121
  (0.90), lamps 2,496 (0.75).
- **Behr's public list through the app:** 5,178 colors loaded and saved in 0.6 s; `exterior` is unknown (null)
  on every Behr row, and the "exterior only" filter keeps unknowns (2,629 left — the rest are marked
  interior). Nearest to #3a5f7d: M510-6 Tidal ΔE 1.13, M500-6 Express Blue 2.34, M490-7 Shasta Lake 3.06.
- **The instant preview** on house1, body M510-6 Tidal and trim PR-W08 Ambience White: the Parts tab's ΔE to the
  chip **0.4** (body) and **0.0** (trim). The trim the finder found is 2% of the house: the white fascia and the
  scalloped boards stay in the body's mask and take the body's color at their own brightness (light blue).
- **The AI photo through the app:** body Tidal, trim Ambience White, front door PPU2-16 — **22.1 s** of render,
  28 s for the job. The worst surface's ΔE after the lock **14.47**: the same fascia boards (in the body's mask,
  painted the body's paint at white's brightness). A finder recall gap on thin trim, not the lock; the user's
  fix is a Box or the Brush on Trim.
- **A kit bug the settings form found:** the kit's `UiNumber` handed Quasar its formatted text ("2,048"), so a
  schema rule said "Must be a number" for every value of 1,000 and more — fixed in the kit (`3d83749`): the
  rules now judge the parsed number.
- **House2 and house3 through the app** (2026-10-18): house2 (3840×2880) 11 parts in 40.1 s — body 11.6%,
  trim 0.7%, front door 0.7%, garage door 4.8%, gutters 1.2%, chimney 1.5%, roof 4.6%, windows 4.4%,
  stone 8.0%, brick 0.0%, lamps 0.1%; house3 (4032×3024) 8 parts in 30.0 s — body 30.9%, trim 2.4%,
  front door 2.1%, gutters 1.3%, chimney 2.9%, roof 7.6%, windows 1.8%, brick 0.0%.
- **Trim recall, three recipes on the three photos** (the app's own `finder.parts` setting, the share
  of the display photo; overlays in session e638ccef's scratchpad `real-ui/shots/trim-*.jpg`):

  | recipe | house1 | house2 | house3 |
  |---|---|---|---|
  | `["trim"]` at 0.5 (was the default) | 0.44% — the main eave only | 0.70% | 2.42% |
  | `["trim"]` at 0.35 | 1.23% | 1.84% | 4.69% — **takes the road's painted line** and the plinth |
  | `["trim", "fascia", "window trim"]` at 0.4 (**now the default**) | 1.56% — + the gable rake boards, the window casings | 1.62% — + the garage door casing, a corner board, the window frames | 3.05% — no road line |

  Still missed by every recipe: house1's corner boards, the frieze under the main eave, the scalloped
  skirt, the garage door's casing; house2's white eave fascia (in no part — it stays unpainted).
- **The AI photo after the trim change** (house1, the same three colors): the rake boards and window
  casings now come out white; the boards above stay light blue (in the body's mask). Worst surface ΔE
  after the lock 13.97 (was 14.47). Render time 60.9 s, then 34.4 s on a repeat with the GPU otherwise
  idle — against 22.1 s on the first run, same inputs; not explained yet.
- **"Classic" schemes' door** — a complementary flip gave a green body a purple door (SW's data). Now
  the door takes the first traditional door hue (`classicAccentHues`: brick red 25°, navy 255°, forest
  green 150° — data in `schemes.harmony`) at least 60° from the body's: green → brick red, red → navy.
- **The AI's color schemes, for real** (2026-10-18): the app had no cache chosen, so the kit shared
  JustWrite's (`justwrite-app/data/ai-cache` — llama.cpp b11239 and Gemma 4 12B / 26B already there; no
  download). The General preset set to `gemma-4-12b-qat` (what Quick Setup does); `POST /v1/schemes/ai` on
  house1, Behr, "classic and welcoming": 3 schemes, every color snapped to a Behr paint (ΔE to the AI's
  target 0.5–7.1), 416 prompt / 272 answer tokens. Through the desktop app's Schemes tab: shown 16.2 s after
  the click, Apply paints the house. Times vary widely — 29 s, 16 s, then 66 s / 33 s and 99 s after server
  restarts (the model loaded again each time) — not explained yet. Not the disk: E: is an NVMe SSD
  (Samsung 990 PRO); other sessions ran builds and tests on this machine at the same time.
- **The prompt's first answers described what isn't there** ("mossy window frames", "warm wood tones" on a
  white house); with "base each reason on [the listed parts and colors]" they quoted hex codes ("the #373530
  roof"); with "name colors in plain words" too: "the dark roof and the olive windows". Both lines are in the
  default prompt (`schemes_ai.js` SCHEMES_PROMPT — the prompt row, editable in the AI Lab).
- **A scheme painted the brick chimney** (the body role included the chimney): the default roles now leave
  it out — the chimney is often brick or stone; the Colors tab still paints it.
- **The user's own house, through the app** (2026-10-18; the photo and its results stay in the gitignored
  data folder): a 2000×684 PNG — a single-storey stucco house, coral trim bands, two trees in front, an SUV
  parked across the garage's corner, a second car at the edge. Parts in 44 s: body 14.4%, trim 4.9–5.0%, front
  door, garage door, roof, windows, lamps. The trees and the plants were left out of every part from the
  start. **The SUV was not**: "door" found its doors (front door 2.3% → 1.4% once fixed) and "trim" its
  running board. Fix (`segment/parts.js`): every piece a part's prompts find must lie mostly on the house —
  the union of the "house" instances grown by `finder.houseMargin` (0.02 of the longer side), kept when at
  least `finder.houseMinShare` (0.5) of it is on it, then clipped to it. Clipping pixels alone (the first
  try) left part of the car door: the car stands inside the house's outline in front of the garage.
  Left: a thin trim outline on the SUV's front window ("window trim"); the coral gable medallions sit in the
  body. The probe houses kept every part (house1 and house2 unchanged; house3 trim 3.05 → 2.7%, stray bits).
- **Painting it**: the AI's schemes in 29.5 s (3 schemes: Pebbled Shore / Blanca Peak / Chipotle Paste;
  Simply Sage / Blanca Peak / Espresso Beans; Cameo White / Red Curry / Off Broadway); the first applied —
  ΔE to the chips 0.0 (body), 0.6 (trim), 0.3 (front door), 0.5 (garage door, the body's paint); saved as a
  design; its AI photo in 22.3 s.
- **Soffits — which words find them** (2026-10-18; SAM 3 through the app's segmenter on the display copies,
  threshold 0.3; each piece's score and share of the photo; overlays in session e638ccef's scratchpad
  `real-ui/shots/soffit/`):

  | word | house1 | house2 | house3 | the user's |
  |---|---|---|---|---|
  | "soffit" | 0 | 0 | 0 | 0 |
  | "eaves" | 0 | 0 | 0 | 0 |
  | **"roof overhang"** | 3 pieces, 0.89% (0.54, 0.53, 0.32) | 5, 3.09% (0.79–0.35) | 1, 1.45% (0.35) | 5, 2.64% (0.78–0.31) |
  | "underside of the roof" | 0 | 2, 1.77% (0.43, 0.34) | 1, 7.37% (0.33) | 1, 5.47% (0.34) |

  SAM 3 doesn't know "soffit" or "eaves". "Roof overhang" finds the overhang's boards — the soffit and the
  fascia, as the street sees them — with no false hit down to 0.3; "underside of the roof" returns a few
  large, low-score pieces (7% of house3). The default recipe gained a paintable **soffit** part:
  `["roof overhang"]` at 0.3, trim group, before the roof and the trim in the priority, painted by a
  scheme's trim color.
- **Window trim as its own part** (2026-10-18; the app's own `findParts` + `resolveOverlaps` with the house
  rule, "window trim" moved out of Trim's words into a `windowTrim` part placed after the soffit in the
  priority — so after the windows; SAM 3 asked once at 0.3, higher thresholds filtered by score; overlays
  in session e638ccef's scratchpad `real-ui/shots/wtrim/`):

  | | house1 | house2 | house3 | the user's |
  |---|---|---|---|---|
  | Trim today (with "window trim") | 1.12% | 1.60% | 2.64% | 4.41% |
  | what "window trim" finds at 0.5 | 12 pieces, 1.59% | 7, 2.23% | 4, 0.80% | 5, 2.16% |
  | — of it inside the windows part | 59% | 81% | 62% | 82% |
  | Window trim paints at 0.3 / 0.4 / **0.5** | 0.81 / 0.69 / **0.56%** | 0.42 / 0.42 / **0.42%** | 0.31% at all three | 0.60 / 0.45 / **0.38%** |
  | Trim after the move | 0.43% | 1.21% | 2.35% | 3.98% |

  "Window trim" finds whole windows; the windows part keeps the glass (first in the priority), so the new
  part is the ring of casing and frame around each window — on house1 every window's casing, on house2 the
  white frames, on house3 the frames (the sills stay in Trim), on the user's house the white frames (the
  coral bands around them stay in Trim: "trim" finds those). At 0.4 it also outlined the parked SUV's
  front window on the user's photo (a 0.48 piece — the same false hit Trim had); at 0.5 that piece is gone,
  and house1 loses only the door's sidelight casings. **Kept at 0.5.**
- **Window trim = frame, casing and sill; Windows = the glass** (2026-10-18, the user: "the frame is what i am
  talking about"). The 0.5 part above was only a thin rim: SAM 3's "window" outline takes glass AND the white
  frame, and Windows won the overlap (the user's two big front windows: casings in Windows). Which word finds the
  glass alone (score ≥ 0.3; the window outline = "window" ∪ "window trim" at 0.5; overlays in session e638ccef's
  scratchpad `real-ui/shots/glass/`):

  | word | house1 | house2 | house3 | the user's |
  |---|---|---|---|---|
  | "glass" | 0 pieces | 16, 58% of the outline | 0 | 0 |
  | "pane" | 30 (0.43–0.30), 65% | 16, 58% | 49, 63% | 23, 60% |
  | "window pane" | 23, 71% | 16, 58% | 33, 73% | 20, 63% |
  | **"window glass"** | 24, 78% (+0.67% outside: a car's windshield, door glass) | 19, 77% | 4, 78% | 13, 73% |

  **Kept: Windows = "window glass" at 0.3; Window trim = ("window" ∪ "window trim" at 0.5) minus Windows** (a
  part's new `minus` in the recipe). Through the app's pipeline (the house rule, the priority): Window trim house1
  0.57%, house2 1.12%, house3 0.47%, the user's **1.38%** (was 0.38%) — the white casings round every window, the
  coral bands staying in Trim; no hit on the parked SUV. Glass the finder finds off the windows (a car, a door's
  glass) lands in Windows, which stays unpainted. Overlays: `real-ui/shots/wtrim2/`.
- **A better default now reaches an existing install**: `upgradeSettings` (seed.js) replaces a setting that still
  holds an EARLIER default — its fingerprint (SHA-256 of its canonical JSON) listed in `previous_defaults.js`,
  taken from git history — and never a value its owner edited. The user's `finder.parts` was exactly the 8972a89
  default and was upgraded on the next start.
- **More trim words — none kept** (2026-10-18, the user's "your rec go" on trim recall; the app's pipeline on the four
  photos, each word added to Trim's prompts at 0.4, then to Window trim's outline; overlays in session e638ccef's
  scratchpad `real-ui/shots/trimwords/`, `wtwords/`): "molding" (found on three photos, 0.40–0.76), "band", "corner
  board", "trim band", "stucco band" add **nothing** — not found, or what they find is already another part.
  "window surround" on Trim adds 0.17% on house1 (window casings — Window trim's, not Trim's), ~0 elsewhere; on
  Window trim it adds house1's missed casings (+0.11%, from Body) but on the user's house takes **0.11% of Trim** — the
  coral bands round the windows, which the user keeps apart from the white frames; "window frame" does the same
  there (+0.15%, 0.09% from Trim); "window casing" adds nothing. A gain on one photo and a wrong move on another —
  not kept. The missed coral pieces stay a Box-tool fix.
- **Why the app's photo looked duller than Windows Photos** (2026-10-18; the user's "the colors do not match it
  should be same photo", their side-by-side screenshot measured):
  - **The photo:** an iPhone JPEG, 3580×1224, a 536-byte ICC profile (wide gamut), and an **HDR gain map** (Apple
    `HDRGainMap`, an ISO 21496-1 marker, an MPF secondary JPEG of 1790×612, one channel). A copy pasted into a chat
    loses the profile and EXIF and is shrunk (2000×684), but its colors were already converted: its mean RGB
    (119.5, 116.2, 102.0) equals the original converted to sRGB (119.5, 116.3, 102.0).
  - **The app's intake converts correctly to sRGB:** a Display P3 test red stored as 202/60/50 comes out 220/40/39
    in the app's display copy (sharp converts an embedded profile by default); the copy keeps no profile.
  - **Not the gain map:** sharp 0.35.5 (libvips 8.18.7) reads it (`metadata().gainMap`) and applies it
    (`withGainMap()` → HDR scRGB, up to 2.75× SDR white on the gable); clipped to SDR the gable's mean goes 156 →
    190 with blown whites and streaks from the map's half resolution — not what Photos shows.
  - **The gamut:** in the user's screenshot the walls and the white door match (wall 148/148/115 in Photos, 148/147/118
    in the app; door 211/213/205 vs 209/211/202); the coral band doesn't (red 173 vs 157). The monitor is wide-gamut
    (`WmiMonitorColorCharacteristics`, 1/4096 units: red 0.632/0.332, green 0.204/0.700, blue 0.148/0.080 — green well
    past sRGB's 0.300/0.600; panel SHP1079): Photos shows the photo's P3 colors on it, the app's sRGB canvases clip
    the out-of-sRGB reds and oranges.
  - **What it takes:** a display copy kept in Display P3 and canvases opened with `colorSpace: "display-p3"`
    (Chromium since 94; WebKit — webkit.org/blog/12058). Konva 10.9 opens its contexts with only
    `{ willReadFrequently }` (lib/Context.js:668,798) — no color-space option, and no upstream support found.
  - **What this screen gets from Chromium** (2026-10-18, measured in the app's Electron 44.7 / Chrome 152 on this
    machine): CSS `(color-gamut: p3)` is **false** (`srgb` true, no HDR); a `display-p3` canvas keeps P3 numbers
    (`color(display-p3 1 0 0)` reads back 255/0/0 in P3, 255/0/0 clipped to sRGB) — the canvas side works. But
    Windows sends the display plain SDR: DisplayConfig's advanced-color info 2 for the one display ("SHARP HDMI",
    SHP1079) is flags 0x45 (advanced color supported, **wide color supported but not enabled**, no HDR),
    `activeColorMode` 0 (SDR), and no ICC profile is associated with it (only Windows' generic sRGB profile is
    installed). So Chromium converts everything — a P3 canvas, a P3 `<img>` — to sRGB for this screen, and the
    panel shows those numbers on its own native gamut. A P3 pipeline changes what this screen shows only once
    Windows manages color for it (Settings → Display → "Automatically manage color for apps", which the flags say it
    supports, or HDR, or the monitor's ICC profile); on a Mac's P3 screen, or with any of those, it does. With
    Windows' auto color management on, Chrome is reported to clamp wide-gamut images to sRGB (issues.chromium.org
    328856550 — status not readable without signing in); a display ICC profile with it off renders them.
  - **The "gamut" diagnosis above was wrong** (2026-10-18, measured in the app's Electron on the user's photo, the
    parts' masks at 2048×700, script `real-ui/convert-compare.mjs` in session e638ccef's scratchpad):
    - the server's display copy (sharp's conversion at intake) **equals Chromium's own conversion** of the original
      P3 JPEG — the coral trim's median 149/83/71 vs 150/83/70, p95 192/180/173 vs 191/182/176; the body
      112/109/82 both; the front door 104/48/41 both;
    - the coral is **inside sRGB**: its P3 numbers (median 140/86/73) convert to sRGB with no channel clipped;
    - **0.22%** of the whole photo lies outside sRGB at all (a channel past 0–1 by more than 0.002), **0.01%** by
      more than 2%.
    So keeping the photo in P3 end to end would change ~0.2% of its pixels, by little, and only on a screen the
    system reports as wide-gamut — not this one. The red 173 vs 157 on the user's side-by-side screenshot is not
    the gamut; the likeliest cause (not verified — the screenshot isn't on disk) is how each viewer scales a thin
    band down: the coral trim is a few pixels wide at that zoom and mixes with the white and green beside it
    differently, while the large walls and the door matched.
  - **Intake without clipping:** `sharp(original).resize().keepIccProfile()` keeps the P3 numbers and the profile
    (a coral pixel: 139/131/108 in the original, 139/131/108 in the copy, 536-byte profile kept); sharp reading that
    copy (`.raw()`, what the finder and the AI schemes do) still gets sRGB (141/131/105) — so the server's readers
    need no change. Today's copy (converted at intake): 140/130/103, no profile.

## 12 · The installed app and the first release (2026-10-19)

- **Playwright can't drive the installed app.** The packaged build sets Electron's fuses
  (`quasar.config.js` `electronFuses`; electronjs.org/docs/latest/tutorial/fuses), which turn off the
  `--inspect` / remote-debugging switches Playwright's `_electron.launch` needs: the launch timed out
  at 90 s. The e2e smoke drives the unfused UnPackaged build on purpose. The installed app was checked
  the way a user starts it: the exe started with `JUST_HOUSE_PAINT_DATA_DIR` (the data-folder ladder's
  first rung) or none, its own server's `/v1/*` asked, its window captured with `PrintWindow`
  (`PW_RENDERFULLCONTENT`; a screen copy took whatever covered the window), closed with its window's close.
- **Measured on the installed v0.1.0** (Windows, per-user install `%LOCALAPPDATA%\Programs\justhousepaint`):
  the server up 1.3–2.2 s after the exe starts; an older install's data folder (10/18) opens on 0.1.0
  with its seven brands; a fresh folder loads the brands by themselves; the user's house photo
  (2048×700 display copy) gets 10 parts in 63.7 s from a cold start (the model loaded first); closing
  the window leaves no process and frees 17499.
- **The first release run** (39301532253): ~6 minutes, all three runners; the feed files name exactly
  the files attached. The AppImage's block map is inside it (`blockMapSize` in latest-linux.yml), so
  Linux has no `.blockmap` file. GitHub says `ubuntu-latest` moves to Ubuntu 26 from 2026-10-19 (the
  setup job only) and that actions/checkout@v4 and setup-node@v4 run forced onto Node 24.
- **`execSync` with stdout inherited returns null** (Node's child_process docs): release.js trimmed it
  and reported the started run as failed.
- **The installed app updating itself** (v0.1.0 → v0.1.1, 2026-10-19, the app's GitHub release; driven
  through Windows UI Automation — App Settings → Updates, Download, Restart now): the start-up check
  said "Version 0.1.1 is out."; Download took 6 s (electron-updater's differential download from the
  block maps); **Restart now** then quit the app and ran the installer as `--updated --force-run` —
  without `/S` the assisted NSIS installer opened its wizard ("Who should this application be installed
  for?", with "There is already a per-user installation … Will reinstall/upgrade.") and waited. The same
  downloaded installer with `--updated /S --force-run` upgraded in place and the app answered again
  15.8 s later as 0.1.1 (the uninstall entry 0.1.1, the exe 0.1.1.0); the data folder beside the exe
  (`data/`, its database and brands) came through untouched. Fixed in the kit (8a9b3fb,
  `quitAndInstall(true, true)`), shipped in v0.1.2; copies of 0.1.0 and 0.1.1 run the old shell, so
  their one update to 0.1.2 still shows the wizard.
- **Why the AI photo's time varies** (2026-10-19; the probe house1, the same two colors, the dev server,
  Windows' per-process GPU memory counters sampled each second): with the card free, **20.2 s**, and
  **20.4 s** right after the part finder had run (the app's hand-off frees its 6.2 GB first — not the
  60.9 s of 10/18). With another family app's idle Gemma 4 26B resident (JustVoice's server, 6.9 GB of the
  8 GB card), **28.3 s**: Windows paged that model down to 1.5 GB to make room. sd-cli's own memory was the
  same every run — 5,959 MB dedicated at its peak, ~7.4 GB shared (its host buffers; not the slowdown). So
  the 22–61 s of 10/18 is other programs on the same card — the app's GPU gate keeps only its own jobs apart
  — and a program *working* on the card at the same time costs more than an idle one. Explained in
  troubleshooting; a hint naming what holds the card is in IDEAS.md.

## 13 · The weak spots: trim, ornaments, a dark finish (2026-10-19)

*Measured by this session on this machine, the four photos of §11 (house1, house2, house3, the user's house)
at the app's display size, through the app's own code; scripts and overlays in session e638ccef's scratchpad
`weak/`.*

- **More words for the trim SAM 3 misses — 40 tried** (each added to Trim's prompts at 0.4, through `findParts`
  with the house rule and `resolveOverlaps`; what it adds to Trim and from which part):
  - **found nothing on any photo:** "corner trim", "corner boards", "pilaster", "white board", "trim board",
    "frieze", "frieze board", "cornice", "crown molding", "rake board", "barge board", "skirt board",
    "water table", "scalloped trim", "belt course", "horizontal band", "baseboard", "door casing", "gable vent",
    "vent", "medallion", "ornament", "round vent", "louver", "emblem", "decorative vent" — SAM 3 doesn't know them,
    or what they find is already another part ("eave", "eave trim", "white trim", "wood trim", "doorway",
    "garage door trim", "entryway" add under 0.1%);
  - **"garage door frame"** — house1 **+0.21%** (the garage door's whole casing, from the body), house2 +0.09%,
    the user's +0.04%, no false hit; **"door frame"** — house2 +0.14% (the front door's casing), the user's
    +0.03%, house3 +0.01%; both **kept** in Trim;
  - **"vertical trim"** — house2's corner board (+0.29%), but on house3 the fence posts beside it; **not kept**;
  - **"decorative trim"** — house3 +1.38%: the brick plinth; **not kept**;
  - **"decoration"** — the user's two coral gable medallions (0.62, 0.58), and every garden statue in front;
    house1 a porch piece and a 0.06-on-the-house one.
- **How much of each piece lies on the house itself** (the "house" instances, no margin — the app's house rule
  grows them by 2% of the photo's side, which lets things beside the house through): the medallions 1.00 and
  0.78 (the left one half behind a tree), the statues **0.00**; the "vertical trim" corner boards 0.99–1.00, the
  fence posts 0.00–0.38; today's Trim pieces 0.82–1.00 except **house3's fence end board at 0.01** (painted as
  trim until now) and two at 0.20 and 0.35 (house3's right corner, half off the house's outline). Hence a part's
  **`onHouse`**: Trim 0.15 (drops the fence board, keeps the corner), the new **Decorations** part
  (`["decoration"]` at 0.4, group trim, last but the body in the priority) 0.5 (the medallions, no statue).
  Through the pipeline: house1 Trim 0.43 → 0.64%, house2 1.21 → 1.29%, house3 2.35 → 1.69% (the fence board
  gone), the user's 3.92 → 3.96% and Decorations 0.42% (both medallions).
- **SAM 3's "find all like this" (an exemplar box, mode "all") on white-on-white trim** (house1, "visual",
  threshold 0.3 / 0.5): a box on a corner board found 30 / 6 pieces — whole walls (21.9% / 9.9% of the
  photo); on the scalloped skirt 13 / 1 — part of the skirt and patches of wall; on the frieze 37 / 3; on a
  shutter 21 / **18 — every shutter**. It finds distinct objects, not a board the same white as the wall: not
  a fix for the corner boards, frieze and skirt of a one-color house, which stay a Box-tool fix (the docs say so).
- **The old finish's grain, dark → light** (house3 body painted Alabaster #EDEAE0): the fine detail
  d = ln(Y ÷ the part's masked blur at the painter's radius) has a MAD of 0.27 on house3's stain against
  0.05 (house1), 0.17 (house2) and 0.03 (the user's stucco) on painted walls. The blotches live at the
  *middle* scale — a few to tens of board-heights long — so the Texture slider's blur (radius 10), a soft
  threshold on d, and a 1-D blur at that radius all left them. What worked: the light from a blur a 25th of
  the photo's short side wide, times d averaged **along the boards** (±that reach, the direction from the
  structure tensor of ln Y — any slant), 15% of the rest kept, and detail darker than e^−0.5 of its line kept
  past that (shadows, knots) — painted-weatherboard look, lap lines kept. The same smoothing on the light
  houses smeared house2's branch shadows and house1's scallops and board-and-batten, so it runs only on a
  **dark** finish (L* of its normally lit level under 45, fully under 30 — house3 22.6; house1 73.7, house2
  79.4, the user's 52.4) painted **lighter** by 15–40 L* and more; where the part has no direction
  (coherence under 0.2–0.5: stucco) its detail is kept — not running-bond brick: its courses give it a direction,
  so its head joints soften (the fifth review, a synthetic dark brick wall at 2048×1536: light-mortar head joints
  0.66 → 0.11, dark ones −0.70 → −0.24, bed joints kept). On a synthetic dark board wall the faces'
  L* spread fell 16.9 → 7.2 and the lap lines kept 31.6 of 33.7 L*. The app's painter on house3: the first
  light paint 0.58 s at 2048×1536 (the structure and the light worked out on a grid 4× coarser; 1.6 s at full
  resolution), then 0.08 s; 2.5 s once for Save image at 4032×3024; ΔE to the chip 0.21.
- **The obstruction test set** (2026-10-19, TASKS "The obstruction test set"): the house photos the 10/17 probes had
  already fetched from Wikimedia Commons (500 px thumbnails; c01–c12, b01–b02, d01–d12, e01–e03, house3's own photo and
  two non-houses left out — no new download), each through the app's intake and default recipe, with SAM 3's "car",
  "tree", "person", "bush", "fence" and "pole" at 0.5 as a stand-in for what stands in front. First 7 (the run was
  paused for another app's render): the trees, bushes and cars were left out of the parts on all 7 except c06, whose
  body ran into the lower part of an evergreen beside the house (body ∩ "tree" 3.07% of the photo, part of it bare
  branches the house shows through); trim ∩ tree 0.05% on c01. **The bigger fault: neighbors' parts** — on c02, c04 and
  c07 the window trim, soffits, doors and railings of the houses beside were painted (and c01's neighbor's window trim),
  because the house rule took every "house" instance, the neighbors' included. First fix: the main instance and the
  instances touching it — which still took in the neighbors beside it (below, "What else SAM 3 calls house"); now the
  main instance alone (pickMainInstance, as the body).
- **The packaged app on every runner** (2026-10-19, the release workflow's new "Start the packaged app" step,
  dry run 39339201987 — nothing published): Windows answered in 1.6 s, **macOS in 9.4 s (the first time the Mac build
  ever ran)**, and **Linux never**: its server exited at its first import — `Could not load the "sharp" module using the
  linux-x64 runtime — libvips-cpp.so.8.18.7: cannot open shared object file`. The build unpacked only `**/*.node` from
  app.asar; sharp's libvips (and onnxruntime-node's `libonnxruntime.so.1`) are named `.so.<n>`, which electron-builder
  doesn't take for libraries, so they stayed inside the archive, where the native module can't load them. (Windows'
  DLLs sit beside the `.node`; macOS's `.dylib` is unpacked.) The AppImage of v0.1.0–v0.1.2 has this fault. sharp's own
  guidance: unpack `**/node_modules/sharp/**/*` and `**/node_modules/@img/**/*` (sharp.pixelplumbing.com/install,
  electron-builder) — done, with onnxruntime-node's `bin/`; the start check now also asks `/v1/segment/runtime` (the
  part finder's runtime loads). onnxruntime-node ships every platform's binaries (darwin 86 MB, linux 69 MB, win32
  134 MB): each installer now carries only its own.
- **The AI photo's note on other programs** (2026-10-19): the kit's `otherGpuHolders` on this machine named Windows'
  `dwm.exe` (317 MB) and would have named the app's own window — both left out by the kit since 2c7c98d. The note
  shows when the others hold more than `aiphoto.sharedGpuNoteMb` (1024 MB): an idle 6.9 GB model cost 8 s (§12).
- **The AppImage opened as a user does** (2026-10-19, dry run 39341716579, the new linux-user job on GitHub's
  ubuntu-24.04: the `.AppImage` itself, no flags): user namespaces restricted (1), no `libfuse.so.2` — it stopped
  at once, "AppImages require FUSE to run": the published AppImage wouldn't have opened on a fresh Ubuntu 24.04
  even with sharp fixed. Now built on the static runtime (`toolsets.appimage: "1.0.3"`); Chromium's sandbox, which an
  AppImage can't have there, is electron-builder's own launcher's to drop — it adds `--no-sandbox` when user
  namespaces are blocked (the kit's RESEARCH §2; a kit switch added for it was removed). The build runners' own start
  check: Windows 1.6 s, macOS 6.6 s, Linux 3.1 s, the part finder's runtime loading on all three.
- **What else SAM 3 calls "house"** (2026-10-19, "house" at 0.5 on the 26 set photos and the four app houses, each
  instance drawn: the main one — pickMainInstance, as the body uses — the ones touching it within the 2% margin, the
  rest): the main instance held the whole house every time, wings and garages included (house1's garage wing,
  house2's garage, the user's garage); **every other instance was a neighbor's house**, the touching ones included
  (2–11% of the photo on b02, c02, d01, d02, d03, d05, d09, d11, e01, e02, e03, house2). So "touching the main one"
  can't tell a wing from a neighbor — it took the neighbors in — and the house rule is the main instance alone.
- **The obstruction test set, done** (2026-10-19, all 26 photos again with the main-house rule; overlays in session
  e638ccef's scratchpad `obst/shots/`): no neighbor's part on any photo. What stands in front — cars (d03, d11, c02),
  trees and hedges (c01, c10, d04, d07, d12), people (d01), poles, fences (d06, d09, e01) — stays out of the parts
  on 25 of 26: SAM 3's own "house" outline leaves them out. The one leak: c06's walls run into the lower edge of an
  evergreen beside the house (~1.5% of the photo). **Cutting obstacles out with SAM 3's "tree"/"bush" (0.5) — not
  done:** on the nine photos checked (c06, c01, d04, d07, d12, e01, the user's, house1, house2) no tree or bush mask
  touches the paint except on c06, and there it is the BARE tree in front of the entrance, outlined as a blob over
  the columns and doors the house shows through (5.45% of the photo) — cutting it would leave an unpainted patch —
  while the evergreen's leaking edge isn't in any tree mask. The leak stays an Eraser fix. Smaller misses seen:
  c06's glass double doors outlined as window trim (no "door" found), d02 a hanging ornament as a Decoration, d04 a
  wooden gate beside the entrance in the walls.
- **The day's changes in the real app** (2026-10-19, the desktop app's UnPackaged build against the server on the
  checkout's data folder; scratchpad `weak/real/`): the server's start upgraded this install's settings (Decorations
  in the parts list, the trim's door-casing words, Decorations in the schemes' trim role, the 1 GB note); a copy of the
  user's house found 11 parts in 50–53 s with Decorations 5,982 px (both medallions; "Decorations 1%" on the Parts
  tab); house3's body painted SW 7008 Alabaster reads as freshly painted weatherboard (the lap lines kept), no console
  error. Found on the way: **deleting the copy right after its parts were found failed — 500, EPERM — halfway** (the
  row gone, two masks and the photos left in the folder; the same folder removed fine seconds later; sharp doesn't
  hold a file it read by path, tested): Windows holds a just-written file for a moment. The removal now retries
  (Node's async rm with maxRetries, the server never held up), the delete answers 204 whatever the folder does (a
  retry 30 s later, if the house is still gone), and the server removes at start only the folders a held removal or an
  unfinished photo add marked (`.removed`, `.adding`) — never an unmarked one, so a lost database can't take the
  photos (the second review). Also seen: house3's dark fence panel lies inside its "house" outline and is painted
  with the walls; SAM 3's "fence" (0.5) doesn't outline it there and, on d06, outlines the iron fence over the front
  door — cutting fences out would cut the door, so not done (an Eraser fix, as the evergreen's edge).
- **Darkness judged against the photo's bright end** (2026-10-19, the fifth review: a light house photographed dark
  got 26–74% of the calming): each body's normally lit level against the photo's 99th-percentile luminance (the sky,
  white trim), as taken and dimmed to 35%: house1 L* 73.8 → relative 78.7 (dimmed: absolute 26.7, relative 80.7),
  house2 79.4 → 82.2 (dimmed 29.0 → 83.5), the user's 52.5 → 53.8 (dimmed 17.7 → 58.0), house3's stain 22.8 → 26.9
  (dimmed 5.7 → 34.6). So `calmStrength` judges a finish's darkness relative to `photoExposure`: the dimmed light
  houses stay light (no calming), house3 stays dark. A photo with nothing bright in it reads every part as light —
  the calming then misses (conservative).
  **The 95th percentile since the sixth review**: the 99th is moved by 1% of the photo — a dim photo's lamps or lit
  windows — and then a light house reads dark. At p95 (the same photos, measured the same way): house1 94.4
  (dimmed 95.2), house2 91.1 (91.8), the user's 55.8 (59.9), house3's stain 28.4 (dimmed 36.3) — the light ones far
  over the 45 limit, house3 still fully calmed as taken (under 30) and partly when dimmed. **Limits:** a backlit
  house (a bright sky over most of the photo, the walls in their own shadow) reads darker than it is — a light finish
  there under L* 45 relative would be calmed; a close-up with no sky or white trim reads every part light and is
  never calmed. Neither is in the probe or obstruction sets' bodies. Both are settled when the part's paint now is
  set (On it now): that paint's own L* is the finish then, exact whatever the photo's light (below).
- **What the body loses to pieces the house rule drops** (2026-10-19, the fifth review): the body is the main "house"
  instance minus every piece a text prompt found, before the house rule and `onHouse` drop some — so a dropped piece's
  pixels on the house are left out of the body too. Kept on purpose: what a prompt finds and the rule drops is almost
  always in front of the wall (a car's door, a garden statue, a lamp post), and painting it with the walls is the
  worse mistake.
- **Corrections to today's records:** commit 3245957's "measured on house3: the faces' spread halves, the laps keep
  94%" — those are the synthetic wall's numbers (16.9 → 7.2, 33.7 → 31.6); on house3 the calming was seen, not
  measured that way. c5125ff's "the AI photo started after an install waits for a busy card" — it is skipped then
  (the user presses AI photo again). The AI photo's note on other programs is one reading as the render starts, not
  "while it drew" (the words say so now).
- **The window too** (2026-10-19, dry run 39357687376): the kit's shell prints "[shell] window loaded" when its window's
  page loads, and the start check waits for it — every runner showed it: Windows 1.6 s, macOS 5.5 s, Linux (unpacked,
  22.04) 1.5 s, the AppImage itself on Ubuntu 24.04 2.5 s, each with the part finder's runtime loading.
  Since the sixth review the line means more: Electron's `did-finish-load` says the document loaded, not that the
  app is on screen (a script that throws still "finishes"), so the shell now prints "window loaded" only once the
  app drew its layout (`#q-app .q-layout`, polled for up to a minute),
  and "[shell] window failed: <why>" for a failed load, a crashed page or a layout never drawn; the start check stops
  at that line instead of waiting out its two minutes.
- **The sixth review** (2026-10-19, the removals, restores and releases under a fresh angle — two things at once):
  a restore stopped between its two renames left no `houses` folder, and the next start's sweep deleted the staged
  copy — the only one of the restored photos (the database is restored first, so the staged copy is the one that
  matches; the sweep now puts the newest `houses.restoring-*`, else `houses.replaced-*`, back, and removes nothing
  when that fails); the kit's restore now retries a held rename and never leaves the folder missing (the old one
  back, or the backup copied over it — tested with a held file); a reset while a photo was being read left its
  files nowhere to go (a 500; the folder is now made in the same step as the writes); the part finder's model was
  let go mid-run — the idle release (one minute is allowed, a CPU part search can be longer), a removal, a reset, the
  AI photo starting while a box ran — now each waits for the finds and boxes running on it; installing or using an
  engine while it was being removed (now 409 "…is being removed"); an outline re-found while the old one was being
  removed lost the new file (checked first now); the bright end at p99 (above). And the calming compared two scales:
  since the fifth review the finish was read against the photo's bright end, but with a paint now set the new paint
  was taken in the photo's light (chip × gain) — on a dim photo a dark stain painted light read as barely lighter and
  wasn't calmed (a synthetic dim board wall: the faces' spread unchanged, 0.069). Now, with a paint now set, its own
  L* is the finish and the new paint's chip L* is compared with it (0.069 → 0.035); without one, the chip against the
  photo's reading, as before. ΔE's "normally lit" pixels are picked in the same light the part was painted with
  (they were picked with the lit chip's own calming).
- **The seventh review** (2026-10-19, three agents — the upgrade from 0.1.2, the headless server in a browser,
  regressions since 0.1.2 — and my own pass on the untouched neighbors; each finding checked against the code, most
  reproduced by a test that fails on the old code). Fixed: a restore replaced the access tokens with the backup's or
  none (a headless server opened to the network — family-wide: the template's `keepAuth`, the guard checks it); a
  restore ran no seed or settings upgrade (an older backup's settings stayed old until the next start); a backup
  keeps no empty folder, so a house restored before its first parts or AI photo had no masks/renders folder and both
  failed (each writer makes its folder); outline saves raced a delete or reset (one step now: the house checked, the
  files and rows written, else a 404 — and the box's several outlines no longer half saved); a deleted house's 404
  read "no house <uuid>" (`houseNotFound`: its own words and id, and the page shows its gone state for any change);
  a Reset after a restore whose leftovers Windows held could bring the old photos back at the next start (the Reset
  takes the leftovers and leaves an empty houses folder — reproduced by an agent, then tested); v0.1.2's
  half-deleted folders stayed forever (an unmarked orphan folder missing part of its photo's copies goes; a whole
  one still stays); Find the parts again keeping a Trim drawn by hand left the doors' casings in no part (what the
  finder gave a kept part, and no part has, goes to the body); each brush stroke on a dark part painted light redid
  the calming, ~0.6 s at 2048 px (kept while strokes go on, redone 600 ms after the last); Copy failed in a browser
  on plain http (no Clipboard API there — Quasar's copyToClipboard, kit included, a guard rule); the help said the
  window's address works from another device (the server listens on 127.0.0.1 — a section on starting it on its own
  with `--host 0.0.0.0`), that a second copy always says the folder is in use (the desktop app takes over a server
  on its port, a kit design: said so), and named a headless command only Windows had (a shell launcher for macOS
  and Linux, the release starts it on every runner without a display — dry run 39363747241: Windows' .cmd 1.0 s,
  Linux 1.0 s with no display, the Mac app's Resources script 1.0 s, the extracted AppImage on 24.04 1.5 s, each
  serving the page; the windows too, 2.0 / 2.5 / 5.1 / 3.1 s). Settled, not changed: with the server on its
  own, a browser showing the app on that computer counts among the AI photo's "other programs" — it does hold the
  card, and the note shows only past 1 GB (the words now say "the computer that draws it"); the finder's release
  can't wait forever (`running` drops in `finally`, a cancelled find stops at its next prompt). Left as it is: a
  0.1.3 backup restored into 0.1.2 — 0.1.2's Advanced refuses the parts list's `onHouse` (a downgrade; 0.1.2 can't
  change).
- **The eighth review** (2026-10-19, three agents: security, accessibility, the seventh's fixes attacked). Security —
  the family's servers (the kit's RESEARCH §2, "The servers' guards, attacked"): CORS for every origin let any web
  page read this computer's server (backups with the AI keys, the tokens); DNS rebinding passed the CSRF check and
  could set an engine binary that the next install runs; a malicious backup's engine rows did the same; a reverse
  proxy made every client loopback; backups carried the tokens; a restore's zip could fill the disk — all fixed in
  the kit and the template, with tests. The seventh's fixes: Keep's reassignment now stays on the house's own
  outline (the finder's `house`), a put-back that fails is copied instead (and owed to the next start by
  `.houses-put-back`, never removed as a leftover), the Linux help names the real lower-case AppImage, the Windows
  command is `.\…` (PowerShell) and the help says to quit the desktop app first, a new app gets its launcher
  executable (`new-app.js` stages it +x; the guard checks the git mode), the shell's failed-load line counts the
  page itself only. Accessibility (fixed by an implementing agent, checked on the built app with the e2e
  driver; contrast computed with culori, worst case over every accent hue): a kit `:focus-visible` ring — a
  box-shadow, as QBtn's `.no-outline` (`outline: 0 !important`) beats any outline — of `--focus-ring` (2 px
  `--accent-ink`, ≥6.25:1; was undefined, ~1.16:1); `--muted` light #888 → #6b6b6b (3.39 → 5.10:1 on the
  background, 3.06 → 4.56 on the selected tint), dark #8a8780 → #a09d96 (≥4.77:1); `--success-ink` 4.22 → 6.29:1;
  `--warn-ink` 2.43 → 8.76:1; Quasar's captions at 75% of the ink (3.61 → 7.03:1 here; the kit's five ink palettes'
  muted text now ≥4.55:1 light, ≥4.56:1 dark, with a test); aria-pressed / aria-current on the main buttons of rows
  that are no longer buttons themselves (the stretched-link pattern — no control inside another); the paint grid
  one Tab stop (roving tabindex, arrows by laid-out row, Home/End); the photo a Tab stop panning by arrows when
  zoomed (drawing stays pointer-only); two-tone outlines and tool marks; Ctrl+Z/Y never under a dialog, yes from a
  read-only input; aria-disabled keeps focus on a busy button; the kit's UiSlider no longer sets its minimum when
  focus leaves an untouched number box (Tab moved Texture 1 → 0). The window: content needed per width (with the
  AI photo's longest reason) — 960 wide: 696 high (769 with Brush and Compare), photo 400; 1080: 653 (702); 1160:
  602 (660); so the minimum is 960 × 700 outer (half a 1920 screen snaps with no scroll at full height; the very
  smallest height scrolls the widest toolbars a little); the side panel clamp(300px, 40%, 380px), rows wrap.
  Real data checked against the new sweep rule: the dev folder keeps its four houses and its one whole orphan;
  the installed 0.1.2's has no houses folder yet — nothing removed. Dry run 39370907295 (app 436915f, kit
  c01d769): every runner's window drew and every launcher served the page (windows 2.6–9.5 s, headless 1.0–1.6 s).
- **The ninth review** (2026-10-20, two agents: the help's every claim against the code; failure paths and real size,
  measured with the app's own modules). The help: the data folder off Windows (a Mac app's bundle, an extracted
  AppImage), "Require a token on this computer too", and a proxy's HTTPS origin — fixed in the kit (its RESEARCH
  §2); What's new said the window grew narrower (its minimum grew: 800 → 960); labels as they read (**Quit Just
  House Paint**, **Install (3.1 GB)**, the models' "(QAT)"); the help now says where the Windows app's folder is,
  Windows' firewall question, how to find the network address, and that an unpacked AppImage doesn't update.
  Failure paths and size (measured by an agent with the app's own modules, then fixed — the renderer by an
  implementing agent, measured again; the server and the kit by me, each with a test that fails on the old code):
  a Texture change re-prepared every part over the whole photo — each part is now prepared inside its mask's box
  plus the blur radius (identical inside the mask, pinned exactly), and the slider applies on release (QSlider's
  `change`): 2048×1536, 15 parts, 2.1–2.2 s → 0.57 s per change (calmed body 3.2 → 0.9 s), preparing 1648 → 180 ms,
  arrays 261 → 85 MB; Save image painted the full original on the main thread — now at most
  `photos.fullSizeMaxMegapixels` (seeded 16, Settings → General) in a module worker (OffscreenCanvas): 12 MP 3.6 s
  in the worker with the page's longest freeze 25 ms (was 2.06 s frozen, 485 MB on the page → 63 MB), 48 MP with a
  dark body saved at 16 MP in 13.5 s, page freeze 23 ms (was 47 s / 4.2 GB); the AI photo composes at the same cap;
  a backup is written to a file and streamed (the kit), and the desktop shell streams it to the chosen file
  (`saveFromUrl`) — no copy in the window or the shell; a removed or reloaded brand's paints leave the cache (an
  import too) and the house repaints; a page opened or reloaded during a part search or an AI photo attaches to it
  (`GET /v1/houses/:id/jobs`) and Brush, Eraser and Box are off during any search (they weren't, even when the page
  started it); outlines are written beside their place and renamed in together, and one that can't be read is
  taken as empty; a transparent photo is flattened onto white when added (the AI photo read the hidden colors); a
  photo past sharp's 268 MP limit says its size (413), not "not an image"; a killed AI photo's picture without a row
  and its day-old work folder go at start; Cancel answers during the part finder's hash check; saves land whole (the
  kit's `.part` then rename).
- **The tenth review** (2026-10-20, three agents: the checks themselves — mutations in a scratch copy; the kit's
  changes as the other apps meet them; the screens, 173 captures of the built app). The checks: each weak test now
  fails on its mutant (a backup that carries a token built by hand; the scrub checked in the backup's own database;
  the finder's Cancel inside the hash with one file; a disk filling on the second outline leaves both whole —
  `outline_save.test.js` stubs node:fs; the start's tidy moved into `startup.js` and tested with real rows); the
  guard reads code without comments and catches the variants (CORS `"*"` anywhere in the list, a named list, a
  match-all regex; `afterCopy` as code; `?.` and aliased clipboard writes; the release's window and `--headless`
  steps each on their own uncommented line; `continue-on-error`; an untracked launcher); `--headless` loads the
  page's script and starts from the temp folder (a stale dist/spa can't stand in); the window line waits for the
  first page inside the layout; the data-folder comparison runs on every build runner; e2e saves a backup through
  the shell's stream. The other apps (the kit's RESEARCH §2): the token page made opt-in, the restore keeps only
  this computer's runner rows, the editor's ring, a dev checkout never a bundle, work beside the database, the
  save's held rename. The screens: being fixed (TASKS).
