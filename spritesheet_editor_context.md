# Context: Spritesheet Editor

## Workspace

- Project path: `d:\Projects\SpritesheetEditor`
- Main application file: `SpritesheetEditor.html`
- Release documentation:
  - `README.md`
  - `RELEASE_NOTES.md`
- Third-party browser dependency folder: `vendor/`
  - Currently includes `vendor/ag-psd.bundle.js`
  - Used by `SpritesheetEditor.html` for PSD import support in-browser

## Product Summary

Spritesheet Editor is a browser-based tool for preparing sprite sheets, editing frames, managing references, creating bitmap fonts, building compositor timelines, and exporting sprite animation assets.

The app is currently implemented primarily as a single HTML file with inline CSS and JavaScript.

## Core Workflows

### Spritesheet Import and Export

- Upload spritesheets, images, GIF, PSD, MP4, and related source assets.
- Configure spritesheet grid rows/columns, start/end frames, playback speed, frame skip, and ping pong.
- Adjust frame offsets and cage size.
- Export GIF, repacked spritesheets, and individual sprite batches.

### Display and Transform

- Display controls include:
  - preview background
  - channel preview
  - cage
  - rulers
  - scanlines
  - shadows
- Display subsections are collapsible:
  - Cage
  - Rulers
  - Scanlines
  - Shadows
- Transform controls include:
  - per-frame and all-frame offsets
  - scale controls
  - flip horizontal / vertical
  - pivot controls

### Edit Tools

- Pencil, brush, eraser, paint bucket, and eyedropper tools.
- Brush/Pencil Size and Hardness controls.
- Pixel Mode appears only when the eraser tool is selected.
- Pencil color strip and color picking.
- Pencil layers with add, merge, visibility, mask, blend, rename, and remove controls.
- Edit Colors section includes:
  - Hue
  - Saturation
  - Lightness
  - Brightness
  - Contrast
  - Sharpness
  - Reset Edit
- Outline section includes:
  - outline enable
  - outline color
  - outline width
- Edit Colors and Outline are collapsible.

### Mask

- Mask Brush, Mask Eraser, and Magic Wand tools.
- Hide Mask, Anti-alias, and Contiguous controls are above Brush Size.
- Brush Size, Hardness, Hide Mask, Anti-alias, and Contiguous show only when Mask Brush or Mask Eraser is selected.
- Wand tolerance shows only when Magic Wand is selected.
- Halo cleanup, reset frame mask, reset all masks, and bake all masks.

### Index Color

- Palette and indexed color workflow.
- Collapsible sections:
  - Colors
  - Color Layer
  - Color Table
- Colors section includes color count, keep transparency, preview, highlighting, re-ordering, edit color, palette dropper, selection, merge, reset, and apply-all controls.
- Color Layer section includes layer selection, add/remove layer, add/remove colors, and layer palette adjustment.
- Color Table section includes primary color table, auxiliary color table, open/save palette, and transfer selected colors.

### Reference

- Multiple reference layers.
- Reference layer visibility, offsets, scale, transparency, flip, and shadow controls.
- Reload References button in the Reference panel and main left menu.
- References are preserved when loading a new spritesheet; they reset only on New Project.
- Link to Compositor creates or updates compositor tracks/clips from reference layers.
- Link to Compositor should update existing linked clips instead of duplicating them.

### Compositor

- Timeline-based compositor workspace.
- Tracks/layers with visibility and remove controls.
- Sprite clips, text clips, fades, and audio clips.
- Clip selection and multi-selection.
- Multi-selected clips can be moved and scaled together.
- Shift+Arrow moves selected compositor clip sprites.
- Left/Right arrows move the compositor frame when compositor is active.
- Timeline zoom keeps layer visibility and remove buttons static and visible.
- Remove layer buttons should not move at high zoom and clips should not appear behind them.
- Timeline End is a small unlabeled draggable handle.
- Hold Frames extends clip visual length.
- Context menu Refresh automatically reimports the asset instead of opening a window.
- Mask Outside Cage clips compositor fade overlays and scanlines.

Compositor clip settings include:

- name
- X / Y position offset
- scale
- cast shadow
- shadow color
- flip horizontal
- flip vertical
- repeatable Rotate 90 button
- type
- Anim Speed
- Reverse Anim
- Hold Last Frame
- Hold Frames
- outline
- outline color
- outline width

Compositor text clips:

- Opening `+ Text` should show the text settings window immediately.
- The text settings window uses an Open Font button instead of a font spritesheet drop zone.

Compositor export:

- GIF export
- MP4/WebM export
- export progress bar
- audio inclusion option
- quality option
- video Mbps option, default `20`
- audio kbps option

Compositor resolution presets:

- Custom: default `320 x 240`
- Street Fighter II: `384 x 224`
- Mortal Kombat: `400 x 254`
- King of Fighter: `320 x 224`

### Font Maker

- Bitmap font import, open, save, and reset/new font workflows.
- Save Text as PNG.
- Rows, columns, and letter order.
- Collapsible Letter Settings section:
  - Letter Gap
  - Space
  - Row Gap
  - Alignment
  - Letter
  - Gap
  - Offset X
  - Offset Y
- Collapsible Shadow section:
  - shadow color
  - cast shadow
  - shadow offset X/Y
- Color and Force Upper Cases are above the Text field.
- Text remains outside the collapsible Letter Settings and Shadow sections.

### Shortcuts and About

- Shortcuts button opens a shortcut reference modal.
- About Us button is below Shortcuts.
- About modal includes:
  - RenderPop Studio credit
  - `https://renderpopstudio.com/`
  - `https://renderpopstudio.com/SpritesheetEditor/`
  - current release version

## Current Release Notes State

The last release before the current release-note expansion was `v1.1.0`.

Current release notes are split into:

- `v1.2.0 - 2026-06-02`
- `v1.3.0 - 2026-06-05`
- `v1.4.0 - 2026-06-09`
- `v1.5.0 - 2026-06-12`

Major features:

- Font Maker is documented under `v1.4.0`.
- Compositor is documented under `v1.5.0`.

Latest `v1.5.0` notes include:

- Compositor workspace
- compositor clip settings
- compositor animation controls
- multi-selection scaling
- compositor keyboard controls
- multi-file compositor import
- Link to Compositor
- draggable Timeline End
- GIF and MP4 export
- export progress
- compositor resolution presets
- About Us dialog
- Index Color collapsible sections
- Mask panel visibility/layout changes
- Brush/Pencil Size rename
- shortcut documentation updates
- Mask Outside Cage clipping fade overlays and scanlines
- compositor clip settings no longer showing sprite resolution beside the name

## Validation Commands

Run these after edits:

```powershell
git diff --check -- SpritesheetEditor.html README.md RELEASE_NOTES.md spritesheet_editor_context.md
@'
const fs = require('fs');
const html = fs.readFileSync('SpritesheetEditor.html', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
if (dupes.length) { console.error('Duplicate ids: ' + dupes.join(', ')); process.exit(1); }
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
for (const script of scripts) new Function(script);
console.log(`No duplicate ids; parsed ${scripts.length} inline script(s)`);
'@ | node -
```

The in-app browser was not available during the last validation attempt and returned:

```text
Browser is not available: iab
```

## Working Tree Notes

Do not reset or revert unrelated files. The working tree may include user/session changes and generated files.

Known untracked items seen during recent work:

- `COMPOSITION.json`
- `KathyLong_BIO.json`
- `icons/flip-horizontal.svg`
- `icons/flip-vertical.svg`
- `icons/square-square.svg`
- `vendor/`

The old context filename was:

- `sprite_to_hd_character_tool_context.md`

It was renamed to:

- `spritesheet_editor_context.md`
