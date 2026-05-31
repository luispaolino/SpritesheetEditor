# Spritesheet Editor

<p align="center">
  <img src="https://renderpopstudio.com/SpritesheetEditor/logo_big.png" alt="Spritesheet Editor" width="520" />
</p>

<p align="center">
  A free browser-based tool for cleaning, previewing, aligning, editing, indexing, and exporting 2D sprite animations.
</p>

<p align="center">
  <a href="https://renderpopstudio.com/SpritesheetEditor/"><strong>Official Page</strong></a>
  &middot;
  <a href="https://renderpopstudio.com/SpritesheetEditor/SpritesheetEditor.html"><strong>Demo</strong></a>
  &middot;
  <a href="#features">Features</a>
  &middot;
  <a href="#quick-start">Quick Start</a>
  &middot;
  <a href="#release-notes">Release Notes</a>
  &middot;
  <a href="https://renderpopstudio.com/SpritesheetEditor/#suggestions"><strong>Feedback</strong></a>
</p>

<p align="center">
  <img alt="No install required" src="https://img.shields.io/badge/install-not%20required-18d8ff" />
  <img alt="License required: no" src="https://img.shields.io/badge/license%20required-no-ffd73d" />
  <img alt="Runs in browser" src="https://img.shields.io/badge/runs%20in-browser-66f0a6" />
  <img alt="Made for spritesheets" src="https://img.shields.io/badge/made%20for-spritesheets-ff5ca8" />
</p>

---

## Overview

**Spritesheet Editor** is a lightweight web tool for preparing 2D sprite animations for games, prototypes, animation pipelines, and asset cleanup workflows.

It lets you upload a spritesheet or individual frame images, preview the animation, remove backgrounds and halos, adjust frame placement, paint pixels, reduce colors, import or export palettes, and repack everything into a final PNG spritesheet.

The tool runs directly in the browser. No installation, no backend, and no license is required to use it.

Official page: **https://renderpopstudio.com/SpritesheetEditor/**

---

## Preview

<p align="center">
  <img src="https://renderpopstudio.com/SpritesheetEditor/preview.png" alt="Spritesheet Editor interface preview" width="900" />
</p>

Demo video: **https://renderpopstudio.com/SpritesheetEditor/intro.webm**

---

## Features

### Spritesheet slicing

Upload a spritesheet and define rows, columns, start frame, end frame, and playback speed. The editor slices frames left-to-right and top-to-bottom, making it easy to inspect existing animation sheets.

### Animation preview

Preview your animation directly in the browser. Scrub through frames, play or stop playback, reorder frames, duplicate frames, delete frames, and import loose PNG frames into the timeline.

### Mask cleanup

Clean sprite backgrounds with mask brush, erase mask, magic wand, automatic background masking, and halo removal. This helps remove unwanted pixels while preserving the original sprite data where needed.

### Pixel editing

Use the built-in pencil, eyedropper, and paint bucket tools to edit frame pixels directly. The brush is square and pixel-perfect, which makes it useful for pixel art and precise sprite cleanup.

### Alignment tools

Adjust cage size, frame offsets, scale, pivot position, and ruler guides. These tools help keep frames stable and aligned when preparing animation sheets for game engines.

### Indexed color tools

Preview and apply indexed color reduction, preserve transparency, import color tables, edit palette entries, and export ACT or PAL palette files.

### PNG repack/export

Export a clean repacked PNG spritesheet using the current frame order, cage size, offsets, scale, masks, imported frames, and layout settings.

---

## Workflow

1. **Upload**  
   Add a spritesheet or import individual frame images.

2. **Preview**  
   Set grid dimensions, playback speed, and scrub through the timeline.

3. **Clean and align**  
   Remove backgrounds, fix halos, paint pixels, adjust pivot guides, and nudge frames into place.

4. **Export**  
   Repack the final animation into a clean PNG spritesheet.

---

## Quick Start

Clone or download the official GitHub repository:

```text
https://github.com/luispaolino/SpritesheetEditor/
```

---

## Release Notes

For the full release history, see [RELEASE_NOTES.md](RELEASE_NOTES.md).

### v1.1 - 2026-05-31

#### New Features

- Added support for importing multiple individual sprite images into the timeline. Imported frames share the same grid, animation, mask, scale, palette, and export settings.
- Added Ping Pong animation playback.
- Added one-row spritesheet packing for exporting all frames in a single row.
- Added GIF animation export.
- Added individual sprite batch export for saving every frame as a separate image.
- Added a floating canvas toolbar with dedicated Transform, Display, Pencil Tool, Mask, True Pixel Filter, and Index Color tools.
- Added a floating inspector that appears only when a canvas tool is selected.
- Added zoom percentage display inside the canvas.
- Added tool version display in the header.
- Added fullscreen shortcut support for the main preview.
- Added True Pixel Filter reference image import, pixel-resolution detection, preview, reset, apply-all, and resize support.
- Added scale units for percent and pixel-based scaling.
- Added visibility toggles for cage/ruler guides and pivot controls.
- Added Index Color palette layers, including a Default layer and named custom layers.
- Added color-layer controls for adding/removing layers and adding/removing selected colors from a layer.
- Added color table selection mode with click, double-click, and drag selection support.
- Added Hue, Saturation, and Lightness controls for selected palette colors.
- Added direct palette color editing through a color picker, including empty palette slots.
- Added an Auxiliar Color Table for loading a secondary palette and transferring selected colors into the main color table.
- Added palette color picker/dropper support for selecting a sprite color and highlighting it in the color table.
- Added channel preview buttons for red, green, blue, and alpha mask inspection.

#### Improvements

- Reworked the main layout so the canvas has more usable space while keeping advanced tools available on top of the canvas.
- Merged Scale and Pivot & Frame Offset into a single Transform tool.
- Moved preview background, cage size, and ruler controls into the Display tool.
- Renamed Preview & Export to Export.
- Renamed Repack PNG to SpriteSheet.
- Combined ACT and PAL palette saving into one Save Palette action.
- Replaced Color Table loading with Open Palette and Save Palette actions.
- Reworked Index Color controls for a cleaner palette workflow.
- Improved cage, ruler, and pivot rendering so guide lines are pixel-perfect and centered consistently.
- Improved cage and ruler sizing so guide spacing is stable across zoom levels.
- Improved canvas zoom behavior so wheel zoom no longer changes the canvas element size.
- Improved canvas centering and added the `F` shortcut to center the sprite in the canvas.
- Improved undo behavior so pan and zoom are preserved when undoing sprite edits.
- Improved timeline previews so they match the main preview more closely.
- Improved right-side tool panels with animated open/close behavior.
- Reduced visual noise in floating panels and aligned button/input sizing with the rest of the UI.
- Limited True Pixel Filter resolution to a maximum of 512.

#### Bug Fixes

- Fixed masks not moving correctly when a sprite frame was moved.
- Fixed Apply Halo so it can apply halo cleanup across all sprites.
- Fixed the magic wand Contiguous option.
- Fixed timeline frame reordering reliability.
- Fixed grid column edits from automatically changing row counts incorrectly.
- Fixed zoom and position resetting after undo.
- Fixed offset drift after undoing a pan or sprite movement.
- Fixed ruler creation changing apparent ruler size based on zoom.
- Fixed cage, ruler, and pivot guides rendering with inconsistent spacing.
- Fixed the pivot guide rendering so only the pivot marker is shown.
- Fixed palette Apply All behavior so selected color adjustments can be applied across sprites.
- Fixed Index Color preview updates after creating or switching palette layers.
- Fixed Color Layer switching from automatically enabling Select Colors.
- Fixed palette reset so the Default palette is reset together with sprite colors.
- Fixed auxiliary palette transfers so added colors do not unexpectedly remap active sprite colors.
- Fixed palette transfer targets so empty main color table slots can be selected.
- Fixed double-click color editing for both main and auxiliary color tables.
- Fixed several centered-icon alignment issues in tool buttons and nudge buttons.

### v1.0 - Initial Release

#### New Features

- Initial browser-based Spritesheet Editor release.
- Spritesheet upload and slicing by rows, columns, start frame, and end frame.
- Animation preview with frame scrubbing and playback speed control.
- Timeline frame management.
- Mask brush, erase mask, magic wand, automatic background masking, and halo cleanup.
- Pencil, eyedropper, and paint bucket pixel editing tools.
- Cage size, frame offset, scale, pivot, and ruler alignment controls.
- Indexed color preview and application.
- Color table import and palette export support.
- PNG spritesheet repack export.
- Project save and load support.
