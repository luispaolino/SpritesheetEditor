# Release Notes

## v1.5.0 - 2026-06-12

### New Features

- Added the Compositor workspace for building layered sprite scenes with tracks, clips, text, fades, audio, playback controls, and save/load support.
- Added compositor clip settings for sprite transform, scale, speed, flip horizontal, flip vertical, repeatable rotate 90 degrees, cast shadow, shadow color, outline, outline width, and outline color.
- Added animation controls for compositor sprite clips, including animation type, animation speed, reverse animation, hold last frame, and hold frames.
- Added multi-selection scaling for compositor clips.
- Added keyboard controls in the Compositor: left/right arrows move between frames, and Shift+Arrow moves the selected clip sprite.
- Added multi-file asset import into compositor layers.
- Added reference-to-compositor linking so reference layers can create or update compositor layers and clips.
- Added compositor timeline end manipulation with a draggable end marker.
- Added compositor GIF and MP4 export.
- Added compositor MP4 export options for quality, video Mbps, audio kbps, and audio inclusion.
- Added compositor export progress for GIF and MP4 rendering.
- Added compositor resolution presets for Street Fighter II, Mortal Kombat, King of Fighter, and Custom projects.
- Added an About Us dialog with RenderPop Studio and official Spritesheet Editor links.

### Improvements

- Improved compositor timeline zoom behavior so layer show/hide and remove buttons remain visible while horizontally zoomed.
- Improved compositor layer remove controls so they stay fixed, use neutral styling, and no longer cover the last visible timeline frames.
- Improved compositor clip settings layout by grouping Type with Anim Speed and moving animation hold options into a dedicated row.
- Improved compositor transform controls so Flip Horizontal and Flip Vertical stay on the same row.
- Improved Rotate 90 degrees as a repeatable button with consistent Apply-button height.
- Improved compositor text clips so text settings open first and fonts can be loaded from the text settings window.
- Improved compositor text clip font loading by replacing the font spritesheet drop zone with an Open Font button.
- Improved MP4 export defaults by setting Video Mbps to 20.
- Improved MP4 export timing and quality controls for better audio/video output.
- Improved Index Color organization with collapsible Colors, Color Layer, and Color Table sections.
- Improved Mask panel layout so Hide Mask, Anti-alias, and Contiguous sit above Brush Size, with Brush Size/Hardness shown only for brush and eraser workflows.
- Improved Edit Tools naming by changing Tool Size to Brush/Pencil Size.
- Improved shortcut documentation with the current keyboard and mouse shortcuts.
- Improved collapsible subsection spacing so title gaps are consistent above and below.

### Bug Fixes

- Fixed compositor assets being duplicated when Link to Compositor was clicked more than once; later clicks now update the linked compositor content.
- Fixed Link to Compositor opening multiple sections instead of keeping the user in Reference.
- Fixed New Project canvas length after using the Compositor.
- Fixed compositor timeline remove buttons moving or allowing clips to appear behind them at high zoom.
- Fixed the timeline end marker displaying unwanted label text.
- Fixed Hold Frames not visually extending compositor clips.
- Fixed MP4 audio sync issues during compositor export.
- Fixed Refresh from the compositor right-click menu opening a window instead of automatically reimporting the asset.
- Fixed Compositor Mask Outside Cage so fade overlays and scanlines are clipped to the cage.
- Fixed compositor clip settings showing unwanted sprite resolution beside the clip name.

## v1.4.0 - 2026-06-09

### New Features

- Added the Font Maker workflow for creating, opening, editing, saving, and reusing bitmap font definitions.
- Added font spritesheet import with configurable rows, columns, and letter order.
- Added per-font text preview and Save Text as PNG.
- Added text color, force uppercase, alignment, letter gap, space, row gap, and offset controls.
- Added per-letter settings for letter selection, per-letter gap, and per-letter X/Y offsets.
- Added font shadow settings with shadow color and X/Y offsets.
- Added collapsible Letter Settings and Shadow sections in the Font panel.

### Improvements

- Reorganized the Font panel so New Font, Open Font, Save Font, and Save Text as PNG are grouped more clearly.
- Moved Color and Force Upper Cases above the text input for faster text styling.
- Moved Letter and Gap controls above Offset X/Y for a more natural font-editing flow.
- Renamed Text Color to Color.
- Removed the redundant Spritesheet Grid subtitle in the Font panel.
- Standardized collapsible submenu spacing in the Font panel.

### Bug Fixes

- Fixed the compositor text workflow that incorrectly required a font before opening text clip settings.
- Fixed oversized gaps below collapsible Font subtitles.
- Fixed inconsistent spacing around the Font Letter Settings and Shadow sections.

## v1.3.0 - 2026-06-05

### New Features

- Added Reference transparency controls for making selected reference layers transparent.
- Added Reload References in the Reference panel and the main left menu.
- Added reference preservation when loading a new spritesheet; references now reset only when starting a new project.
- Added collapsible Display subsections for Cage, Rulers, Scanlines, and Shadows.
- Added outline settings to Edit Tools under the layer controls.
- Added Edit Colors controls to Edit Tools, including Hue, Saturation, Lightness, Brightness, Contrast, and Sharpness.
- Added collapsible Outline controls in Edit Tools.
- Added arrows beside titles for collapsible menu sections.

### Improvements

- Improved Reference reload behavior so all reference sprites can be reloaded together.
- Improved project loading so reference sprite layers restore their sprites instead of showing only the layer shell.
- Improved Reference panel layout with consistent spacing near Upload Spritesheet and Reload References.
- Improved Edit Tools so color edits are always available when a sprite exists; Reset Edit now uses the full button width.
- Improved outline controls by moving the outline color swatch beside outline width and removing the hex field.
- Improved Pixel Mode visibility so it appears only when the Erase tool is selected.
- Improved right-click Refresh behavior so it reimports the asset directly.

### Bug Fixes

- Fixed Reload References being disabled after opening projects with reference layers.
- Fixed reference sprites not loading when a saved project was opened.
- Fixed references resetting unexpectedly after loading a new spritesheet.
- Fixed outline controls not being activatable even when a sprite was available.
- Fixed canvas/reference guide alignment so outlines and dashed guides render more predictably at high zoom.
- Fixed inconsistent gaps below collapsible submenu titles.

## v1.2.0 - 2026-06-02

### New Features

- Added broader import workflow support for spritesheets, individual images, GIF, PSD, and MP4 sources.
- Added PSD layer/frame import support through the bundled PSD parser.
- Added MP4/video frame import with frame skipping controls.
- Added collapsible menu sections across the editor for denser tool organization.
- Added shadow color controls where cast shadows are available.
- Added sprite outline controls with width and color support.

### Improvements

- Aligned primary project buttons into one row for a cleaner left-panel workflow.
- Improved button, field, and submenu spacing across the left panel and floating inspectors.
- Improved Display menu organization for cage, rulers, scanlines, and shadow controls.
- Improved Edit Tools layout so repeated layer, color, and outline controls are easier to scan.
- Improved icon and button sizing consistency across tool panels.

### Bug Fixes

- Fixed layout breaks caused by uneven button rows and oversized gaps.
- Fixed several collapsed-section spacing issues.
- Fixed Pixel Mode appearing outside the Erase tool workflow.
- Fixed multiple UI alignment issues in outline, shadow, flip, and rotate controls.
- Fixed inconsistent canvas and guide presentation after switching tools or loading new assets.

## v1.1.0 - 2026-05-31

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

## v1.0.0 - Initial Release

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
