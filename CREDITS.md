# Credits

The pixel office draws art that other people made. This is where it came from,
what it is licensed under, and what that obliges us to do.

Everything below lives under [`src/office/pixels/assets/`](src/office/pixels/assets)
and is refreshed by [`scripts/vendor-assets.mjs`](scripts/vendor-assets.mjs),
which names its sources in the same terms as this file.

## Character sprites

**[MetroCity Free Top-Down Character Pack](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack)**
by **jik-a-4**, released under **CC0 1.0 Universal** (public domain).

`src/office/pixels/assets/characters/`

CC0 waives all rights, so no credit is required and no permission is needed for
commercial use — the author confirms both on the pack's page. The credit is here
because the art is good and somebody should say so.

The same pack is what the offices this project learned from use, which is why
the characters look familiar next to
[Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents),
[agent-office](https://github.com/harishkotra/agent-office) and
[agents-in-the-office](https://github.com/gukosowa/agents-in-the-office).

## Furniture, floors, carpets and walls

From **[Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents)**,
licensed **MIT**.

`src/office/pixels/assets/{furniture,floors,carpets,walls}/`

```
MIT License

Copyright (c) 2026 Pablo De Lucca

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

MIT requires that notice to travel with the files, which is the reason this
section quotes it in full rather than linking to it.

## What was not taken

**RPG Maker tilesets.** `agents-in-the-office` reads the RPG Maker asset format
but deliberately bundles none of it, and neither do we. Those assets are
licensed to whoever bought the editor.

## Ideas, which have no licence but deserve saying

The sprite sheet layout is read the way Pixel Agents reads it — 16x32 frames,
seven per row, rows for down, up and right with left mirrored, frames 0-2 for
walking, 3-4 for typing, 5-6 for reading. Working that out from their source
saved a day of guessing at somebody else's spritesheet.

Floors that divide a room into areas, an activity mark above a character's
head, an inspector paired with the room, and a pet that means nothing all came
from looking at what they had built and deciding it was right.
