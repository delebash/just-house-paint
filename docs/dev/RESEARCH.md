<!-- SPDX-License-Identifier: MIT -->
# Research register — what we already know, and where the proof is (just-house-paint)

**Read the section for your subject before researching anything.** The family rule and the entry
format are in the kit's register (`../../../just-core/docs/dev/RESEARCH.md`, "The rule" and
"How an entry reads"). This register holds just-house-paint's domain: finding a house's paintable
surfaces, recoloring them, generative edits, and what the existing visualizers do. The shared
stack's facts (the kit, llama.cpp, the memory arbiter) stay in the kit's register.

Plans: [`../plans/2026-10-18-v1.md`](../plans/2026-10-18-v1.md) — the v1 build (what each piece is, and the
standard it follows).
and [`../plans/2026-10-18-brand-permission-request.md`](../plans/2026-10-18-brand-permission-request.md)
— the request to the paint brands (option D), drafted for the user to send.

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
[10 · Paint color data](#10--paint-color-data)

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

