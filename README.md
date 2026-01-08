# VS Code Border

Branch-based border and hover colors for VS Code.

## Features

- Sets window, side bar, and panel borders based on the current git branch.
- Colors tab hover and active tab top border to match.
- Remembers a color per branch and lets you randomize it on demand.
- Activity Bar button (magnifying glass + square) to trigger randomization.

## Quick Start

1. Open a git workspace.
2. Run `VS Code Border: Randomize Color` from the Command Palette.
3. Or click the Border icon in the Activity Bar.

## Commands

- `VS Code Border: Randomize Color`

## Settings

- `vscodeBorder.primaryColors`: Array of hex colors to randomize from.

## Notes

- Colors are applied via `workbench.colorCustomizations` at the workspace level.
- If another extension or setting overrides colors, re-run the command.
