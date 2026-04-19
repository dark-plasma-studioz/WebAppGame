# 2D Platformer Boss Game

This game is a static web app. It does not require Node.js, npm, or a build step.

## Run in Cursor Built-In Browser

1. Open `index.html` in the editor.
2. Right-click the file tab and choose Open Preview (or use the preview button).
3. The game should load directly.

If preview shows a blank page, reopen preview and make sure it is loading `index.html` from this project folder.

## Controls

- Player 1: `A/D` move, `W` jump, `F` attack, `G` ability.
- Player 2: `Enter` join/leave in select scene, `Left/Right` move, `Up` jump, `K` attack, `L` ability.
- Character select: `Space` start, `Backspace` unlock picks.
- End screen: `R` retry, `B` back to select.

## Gameplay Notes

- Character select includes a `P2 Leave (ENTER)` button for quick join/leave toggling.
- Battle HUD includes a controls/attacks panel for each active player plus boss pattern info.
- Attacks and abilities now have on-hit/telegraph visual effects for readability.

## Test Checklist

- Lock Player 1 and start a solo run.
- Join Player 2, lock both picks, and start co-op.
- Verify boss is random across multiple runs.
- Confirm abilities trigger and cooldown text updates.
- Confirm both victory and defeat screens work.
