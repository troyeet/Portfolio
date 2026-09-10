# Portfolio site

A static site for a web developer who also models buildings and 3D environments. One
page, no build step, no framework, no dependencies. The hero is a real glTF file being
drawn by a WebGL2 renderer written into `script.js` — not a video and not a screenshot.

## Looking at it locally

Double-clicking `index.html` will not show the hero. The model is loaded with `fetch`,
and browsers block that on `file://` URLs — you get a note in the viewport explaining it.
Two ways around that:

- **`serve.bat`** — double-click it. It starts a local server and opens your browser at
  `http://localhost:8000`. Leave the window open while you look; `Ctrl+C` stops it. It
  uses Python if you have it, Node if you don't, and tells you if you have neither.
- **`preview-offline.html`** — one self-contained file with the stylesheet, the script,
  and every model built into it. It opens with no server at all. It is about 4.5 MB, so it
  is for looking at, not for deploying. Rebuild it with `python build-preview.py` after you
  change anything.

Either way, everything except the models works fine straight from the file system.

```
index.html            hero viewport, the arena, the models shelf, pipeline, what I make,
                      skills, background, contact
styles.css            all styling, tokens at the top
script.js             glTF reader, renderer, camera rail, models shelf, pipeline wires
model/                every .glb the page shows — the hero reads grand-arena.glb, and the
                      shelf reads whatever each <li> points at
img/                  the portrait used in Background and on the résumé
resume/               the downloadable PDF linked from Contact
build-resume.py       rebuilds that PDF
serve.bat             local server, double-click to run
build-preview.py      rebuilds preview-offline.html
preview-offline.html  single-file build, no server needed
```

## How the page is laid out

Seven bands after the hero, in this order. The arena comes first on purpose: the thing a
visitor has just been dragging is the thing they should read about next.

| Section | id | What it carries |
| --- | --- | --- |
| Work | `#work` | The Grand Arena, the measured facts, the three camera chips, and **Also built** — capstone, records system, Android |
| The models | `#models` | The shelf: every model, each with a 3D view and three 2D drawings |
| Pipeline | `#pipeline` | Blender → export → parse → merge → draw. No nav tab; you arrive by scrolling |
| What I make | `#make` | Two columns: web and application development, 3D and environments |
| Skills | `#skills` | Four grouped lists, plus a note on the IT-support side |
| Background | `#background` | Two paragraphs, your portrait, and the specs list — degree, honours, certifications, location, hours, availability |
| Contact | `#contact` | Email, the résumé download, GitHub, and the colophon |

Every claim on the page traces to the résumé or is measured off the model file. Nothing is
in square brackets any more — `[hidden]` is a real HTML attribute, not a placeholder.

Only one thing is still waiting on you: **LinkedIn**. It sits commented out at the bottom
of `#contact`. Paste the profile URL into the empty `href` and delete the two comment
markers around that `<li>`.

If you add a skill later, put it in the group it belongs to in `#skills` and, if it is
something you would take work in, in the matching `.caps` list in `#make`. The two lists
answer different questions — *what I can do for you* versus *what I have used* — so a tool
you have touched once belongs in Skills only.

Worth knowing before an interview: the WebGL renderer, the glTF parser and the camera rig
in `script.js` were written for this page rather than by you. The page never claims
otherwise — it says the renderer was "written for this page" and lists your own skills
separately — but if someone asks how it works, the rest of this file is the answer, and it
is worth a read.

## The résumé and the portrait

`#contact` links `resume/Jeth-Roy-Delos-Santos-Resume.pdf`, and `#background` shows
`img/jeth-delos-santos.jpg`. The portrait is your studio photograph cropped to 4:5 and
saved small; its backdrop is almost exactly the page's own dark grey, which is why it sits
in the layout without a border or a cut-out. The downloadable résumé is rebuilt from
scratch by `build-resume.py` rather than edited.

That rebuild is deliberate, because anyone on the internet can download this file. Three
things you would put on a copy sent to a named employer are left out of the public one:

- **The mobile number.** The page publishes email only. A phone number on a public PDF
  gets scraped within days of going up.
- **The house address.** The public version gives the town and province, which is all a
  recruiter needs to know about where you are.
- **The scanned signature.** A signature published as an image is a signature anyone can
  lift and paste onto a document you never saw.

None of that is painted over — it is simply never written into the file, so nothing can be
recovered by copy-paste or by `pdftotext`. This README does not repeat the withheld details
either, because the repository may end up as public as the PDF. Keep sending employers your
own full copy directly; this one is for strangers.

Rebuild it with `python build-resume.py` if anything changes. The content lives in that
script as plain Python lists, so a new certification is a new line, not a layout job.

## The hero model

`model/grand-arena.glb` is read by a glTF parser written into `script.js` — about 150 lines
covering the two GLB chunks, strided accessors, the node hierarchy, and the parts of a
material that survive without textures. No Three.js. The file arrives as 1,504 separate
primitives and gets merged into one interleaved buffer, so the whole building draws in
five calls a frame instead of fifteen hundred. The numbers in the corner are counted off
that buffer, not typed in.

To use a different model, drop it in `model/` and change `MODEL_URL` near the top of the
viewport section. Anything triangulated will work: the loader normalises whatever it gets
so the footprint fits inside `EXTENT` and the base sits on `y = 0`. Materials collapse to
a constant colour per primitive, and anything with a strong `emissiveFactor` (or the
`KHR_materials_emissive_strength` extension) is treated as a light rather than a surface.

Swapping the model does invalidate the camera rail — see below.

### The camera rail

Eight shots, grouped the way the building is:

| # | Outside | | # | Inside |
| --- | --- | --- | --- | --- |
| 1 | Establishing | | 4 | Centre spot |
| 2 | Facade | | 5 | The stand |
| 3 | Roof plan | | 6 | Upper tier |
| | | | 7 | Stair run |
| | | | 8 | Roof canopy |

They live in the `VIEWS` array in `script.js`, one object each. Beyond the usual orbit
values (`yaw`, `pitch`, `radius`) and a look-at point (`tx`, `ty`, `tz`), each carries an
`inside` value between 0 and 1. That number blends the framing rules — how far the camera
sits back, how much it lifts, how wide the lens goes, and how tightly the orbit is
clamped — so a move from the roof plan down to the stair run is one continuous shot
rather than a cut. Set `inside: 0` for a shot outside the envelope and `1` for one under
the canopy.

The interior positions were measured, not eyeballed: candidate points were raycast
against the actual mesh to find spots that sit in open air, see a useful amount of the
building, and do not clip through geometry. If you swap the model, the eight numbers stop
meaning anything — re-measure them, or start from the exterior three and work inward.

### Interaction

| Action | Mouse | Touch | Keyboard |
| --- | --- | --- | --- |
| Orbit | drag | one finger | arrow keys, `shift` for bigger steps |
| Move closer or back | — | pinch | `+` and `-` |
| Jump to a shot | click it in the rail | tap it | `1`–`8` |
| Play the tour | click **Tour** | tap it | `t` |
| Clay shading | click the toggle | tap it | `tab` to it, then `enter` |

Orbiting by hand drops the rail out of a named shot: the caption reads *Free look* and no
button stays lit, because claiming a preset is live while the camera has moved off it is
a small lie. Picking any camera puts you back.

The three chips in the work section (`data-goto`) are wired to the same cameras. If you
have scrolled past the hero, a chip scrolls the viewport back into frame first and times
the flight to land as the scroll settles — under `prefers-reduced-motion` both happen at
once, instantly.

The scroll wheel deliberately does nothing. A full-height hero that swallows the wheel is
a trap, and the rail covers framing anyway.

The render loop idles. It only draws while something is actually moving — a flight, a
drag, the tour, a resize — so a page sitting open is not spinning a GPU. The build reveal
runs once, on load, and `prefers-reduced-motion` skips it and makes the camera moves
instant.

## The models shelf

`#models` is the band you add work to. Every model on it gets one frame with four views:
a 3D view you can turn, and plan, front and side drawings.

### Adding a model

Three steps, and none of them touch `script.js`.

1. Put the `.glb` in `model/`.
2. In `index.html`, find the `<ul class="shelf">` and copy a whole `<li class="piece">`
   block, top to bottom.
3. In the copy, change three things: the path in `data-model`, the `<h3>` name, and the
   `<p class="piece__note">` sentence underneath. Point the canvas's `aria-label` at the
   new name too.

Leave the `<dl class="piece__facts">` alone. Those three numbers — triangles, pieces, file
size — are counted off the file when it loads, so a wrong number is not something you can
type. Leave `data-channel="model"` alone as well; that is what makes the rule under the
name red rather than blue or green.

Then run `python build-preview.py`. It reads the page to find out which models exist, so
the new one turns up in the single-file build without being listed anywhere.

One model fills the width of the band. Two or more pair up into columns on a wide screen
and stack on a narrow one, with no breakpoint to set.

### What the 2D views actually are

They are not pictures of the model and they are not separate files to keep in sync. Each
one is the same `.glb`, drawn with the perspective switched off — an orthographic camera
locked square to an axis. That is what makes a drawing measurable: parallel lines stay
parallel, nothing shrinks with distance, and you can compare one part against another the
way you would on paper.

Two details fall out of that, both deliberate:

- The renderer fades distant geometry into the background using the clip-space `w`. Under
  an orthographic camera `w` is always 1, so the fade collapses to nothing on its own and
  a drawing comes out flat and even. No separate code path.
- Plan view keeps the ground grid; the elevations drop it. Seen edge-on the whole grid
  projects onto a single line, and a few hundred blended segments stacked on the same
  pixels read as a hard black band. The two setting-out lines survive in every view, so
  the ground datum and the origin are still there.

Shading in 2D goes most of the way to clay but not all the way. The trace of emissive left
behind is what makes the lighting runs read as brighter lines in the drawing, which is
information rather than decoration.

Switching views is a cut, not a flight. Pressing a numpad key in a 3D application takes you
straight there, because the point is to compare two framings of the same thing without
watching the trip in between.

### Interaction on the shelf

| Action | Mouse | Touch | Keyboard |
| --- | --- | --- | --- |
| Turn the model | drag | one finger | `tab` to the frame, then arrow keys, `shift` for bigger steps |
| Switch view | click **3D**, **Plan**, **Front** or **Side** | tap it | `tab` to it, then `enter` |

Dragging and the arrow keys do nothing in a 2D view — a drawing you can knock off square is
not a drawing. Vertical swipes scroll the page rather than being swallowed by the frame, so
a viewport halfway down the page does not trap a phone.

Each frame loads only when it is nearly on screen, and the hero and the shelf share one
download of the arena rather than fetching 3.1 MB twice. Like the hero, these loops idle:
they draw when you move something and then stop.

## The colour system

Three accents, borrowed from the axis colours in a 3D viewport, used as a taxonomy rather
than decoration:

- red `#C2554E` — 3D and environment work
- blue `#6699C7` — web engineering
- green `#8AA85E` — data work

They are applied through `data-channel` attributes (`model`, `web`, `data`), which is
what colours the rule above each discipline column and each pipeline node. Amber
`#E0A33E` is reserved for selection and keyboard focus and is used nowhere else — if you
add it as decoration, the selected state stops reading as selected.

All tokens are CSS custom properties at the top of `styles.css`. Changing `--stage` means
also changing the `BG` constant in `script.js`, which feeds the renderer's clear colour
and its distance fog.

## Fonts

Archivo and IBM Plex Mono load from Google Fonts. Archivo is a variable font and the
design uses its width axis, so the headings lose some character if it fails to load —
the fallback stack keeps everything readable but flatter. If you would rather not depend
on Google, download both families, drop them next to the CSS, and swap the `<link>` for
`@font-face` rules.

## Deploying

Upload the folder. Netlify, GitHub Pages, Cloudflare Pages, or any static host will serve
it as is — they all serve over HTTP, so the models load without anything extra. Make sure
the whole of `model/` goes up with it; at 3.1 MB the arena is the largest thing on the page,
and it is worth checking your host compresses `.glb` responses. `img/` and `resume/` need
to go up too, or the portrait and the download break.

Leave `serve.bat`, `build-preview.py`, `build-resume.py`, and `preview-offline.html` out of
the upload. They are local conveniences, and the single-file build would cost every visitor
4.5 MB that the real site downloads once and caches.

## Design notes

Kept here so a later pass does not undo a deliberate choice:

- The viewport surface is **lighter** than the chrome around it. This is how Blender and
  Rhino actually look, and it is the opposite of the usual dark website, where the content
  area is the darkest thing on screen.
- The model gets the full screen and the top bar floats over it, fading to solid only once
  you have scrolled past. The first thing on the page is the building, not a headline
  about the building.
- Chrome carries information. The stats read the real mesh, the gizmo tracks the real
  camera, the loading bar reads real bytes. Nothing in the interface is dressed up to look
  technical without being it.
- Two type scales in tension: application chrome at 11–13px, editorial content at 17px.
  The gap between them is what makes the page feel like software rather than a template.
- One orchestrated motion moment — the model building on load — and after that, motion
  only answers something you did. No scroll-triggered fades, no idle drift, no hover
  animation on every card.
- One 3D project leads the page, and it is the one you are already looking at. The other
  three sit underneath it as a short list rather than as full case studies, because a
  portfolio with one piece of real work shown properly reads better than four shown
  thinly. Every number quoted about the arena is measured from the file itself.
- The models band breaks the light/dark alternation and sits on the darker `--void`. The
  frames on it are the lightest thing on the page, and that only reads if what surrounds
  them is dark. The two bands of padding on either side do the separating instead of a rule.
- A model is declared in exactly one place — the `data-model` attribute on its `<li>`. The
  numbers under it are counted, the offline build discovers it by reading the page, and the
  renderer never learns its name. Adding the second model should cost what the first one
  cost, which is most of why the shelf is built the way it is.
- The page reads as a fresh graduate on purpose. It says so in `#background` rather than
  padding the years out, and then spends its credibility on the one thing that is
  genuinely hard to fake: a building you can walk around in a browser tab.
