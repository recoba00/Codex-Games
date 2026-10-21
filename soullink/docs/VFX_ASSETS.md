# Generated Combat Light Atlas

- Tool: built-in image generation, transparent background; no API/CLI fallback.
- Saved game source: `assets/effects/soul-energy-atlas-v1.png`.
- Original output: `C:/Users/user/.codex/generated_images/01a0f0f7-b037-7701-9063-3304a551c6dc/exec-5fd8f284-0260-43e4-bb8e-bffe1da338ed.png`.
- Copied unchanged, not painted/cropped from the user's GIF or another game.
- Actual output: 1254x1254 RGBA, 2,165,461 bytes. Alpha min 0, max 255, mean 67.78.
- Godot uses lossless import with alpha-border fix, no premultiplication or mipmaps.
  Quadrants are sampled directly, tinted and animated by the renderer.
- User GIF is a quality/motion reference only: charge, energetic luminous peak,
  ring and dissipating sparks. It is not a distributed game asset.
- UI direction references the official NIKKE site https://nikke-en.com/ and the
  user's request. Existing Soul Link artwork, Lucide icons and Pretendard remain.
  No third-party game asset was extracted or included.

## Exact Generation Prompt

```text
Use case: stylized-concept. Asset type: production VFX texture atlas for a fast mobile puzzle battle game. Generate ONE square 1024x1024 RGBA texture atlas with four isolated effects in a precise 2x2 equal grid, each effect centered in its own 512x512 quadrant with at least 40px transparent padding so no sprite crosses into another quadrant. True transparent background. No labels, no text, no logos, no checkerboard, no border, no background scene. All effects monochromatic brilliant white and silver so the game can tint them red/cyan/green/violet at runtime. Top-left: a luminous circular magic energy ring seen straight from above, hollow transparent center, fine double concentric arcs, intricate abstract tiny dashes, bright filaments and delicate wisps, like a premium spell charge with sculpted light and soft peripheral bloom. Top-right: a forceful radial impact explosion with a compact white-hot center, multiple sharp uneven tapered rays, spark fragments, feathery light streaks and translucent turbulent halo, high contrast, dramatic energy, not a simple star icon. Bottom-left: one spectacular diagonal curved sword slash from lower left to upper right, white-hot thin blade edge, layered brush-like tapered luminous ribbon trailing behind it and small flying sparks, large negative transparent regions. Bottom-right: a soft intricate swirling cloud of rising energy threads, glowing dust and tiny pinprick sparkles orbiting a small bright core, balanced circular footprint, premium spell afterglow. These are game-ready additive light sprites, cinematic VFX texture quality, crisp luminous cores with detailed soft dissipating edges, readable down to 64 pixels. Do not create UI, character, object, scenic background, colored floor or baked shadows. Four discrete independent square sprites, not four animation frames.
```

The generator returned a different square resolution; runtime region dimensions
come from the actual texture size rather than the requested 1024px size.
