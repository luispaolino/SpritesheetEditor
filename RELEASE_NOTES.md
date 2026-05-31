# Release Notes

## v1.1 - 2026-05-31

### New Features

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

### Improvements

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

### Bug Fixes

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

## v1.0 - Initial Release

### New Features

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
