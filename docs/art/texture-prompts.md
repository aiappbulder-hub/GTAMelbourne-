# GTA Melbourne: Texture Prompt Pack

Copy-paste prompts for generating real textures with ChatGPT (DALL-E / gpt-image) or Higgsfield.
The game loads each one from `textures/<slot>.jpg`, so a texture only works if it uses the exact slot name given below.

---

## 1. Art bible (short form)

- **Mood:** grounded, sunlit, present-day Melbourne. A dry, bright southern sun, long clean shadows and a faint haze off the bay. The city looks lived in, a bit worn, and never cartoonish.
- **Grade:** slightly desaturated, with warm highlights over cool shadows. **The grade is applied in the engine** (AgX tone curve plus the GTA grade pass), so textures must stay *neutral*. Do not bake a colour grade, vignette, HDR look or "cinematic" tint into a texture.
- **Palette:** asphalt charcoal greys, pale concrete, bluestone blue-grey, Victorian red-brown brick, honey sandstone, eucalyptus and dry-lawn greens, tan crushed granite, Colorbond neutrals (Surfmist, Monument, Woodland Grey, Basalt), terracotta orange-red, blue-grey glazing. Saturated colour is kept for small accents: shop awnings, trams, signage, hi-vis.
- **Material rules for tileable textures:**
  - Albedo only, made to look like a PBR base colour. Lighting must be flat, even and diffuse, as if shot under overcast sky or a light tent.
  - No baked strong shadows, specular highlights, sun glints, puddle reflections or ambient-occlusion gradients. The engine supplies light, AO and wetness.
  - Seamless on every edge, with no single feature so distinctive that the repeat jumps out (one big crack, one oil stain, one odd brick).
  - No text, numbers, logos, brands, graffiti tags, signage or people. Any brand that does appear (billboards only) must be invented.
  - Real-world scale. Each slot states how many metres one tile covers. Keep the detail consistent with that.
- **What "modern" means here:** the target is GTA IV/V. Surfaces carry wear (tyre polish, kerb grime, weathered paint, rust streaks, patched asphalt), the material response looks believable, colour is restrained, and noise is high-frequency but subtle. It is not toy-like: no flat primary colours, no outlines, no clean plastic surfaces, no stylised or hand-painted look. **Photographic always beats painterly.**
- **Facade rules:** a flat, front-on elevation, as if photographed with a tilt-shift lens from exactly opposite. There is no perspective, no sky and no ground. Windows show dark interior reflections, not views through to rooms. Windows sit on an exact grid so they line up when the texture repeats.

---

## 2. Prompt pack: world textures

**Universal suffix.** Every prompt below already includes it, but if you write your own, add this:
> seamless tileable texture, orthographic, flat, even diffuse lighting, no shadows, no text, no logos, no people, photorealistic, high detail, 4k photo-scanned material quality

**Sizes.** The default is **1024x1024 square**. ChatGPT also offers 1024x1536 (portrait) and 1536x1024 (landscape), which is fine wherever a non-square size is listed. Higgsfield can do 1:1, 2:3 and 3:2.

### Ground (top-down, seamless)

#### 1. `road_asphalt`
- **Purpose:** the base surface of every road and freeway. This is the biggest single visual upgrade.
- **Prompt:**
  > Seamless tileable texture of weathered Australian road asphalt, viewed straight down from directly above, orthographic top-down. Dark charcoal-grey bitumen with fine exposed grey and blue-grey aggregate stones, slightly polished smooth where tyres run, a few subtle hairline cracks and faint darker patched areas, light dust. Covers about 4 x 4 metres of road surface. Flat, even diffuse overcast lighting, no shadows, no highlights, no reflections. No road markings, no lines, no manhole covers, no text, no logos, no people. Photorealistic, photo-scanned PBR albedo, high detail, uniform density so it repeats without visible pattern.
- **Size:** 1024x1024
- **Avoid:** painted lines, arrows, puddles, oil-stain blotches, tyre marks running in one direction, vignette, perspective, a sun-lit glare.

#### 2. `road_asphalt_wet` *(optional)*
- **Purpose:** an alternative road albedo for rain. The engine already darkens roads and adds gloss, so this is only worth making if it looks clearly better.
- **Prompt:**
  > Seamless tileable texture of rain-soaked Australian road asphalt, viewed straight down from directly above, orthographic top-down. Darkened wet charcoal bitumen with grey aggregate, slightly saturated darker tone, damp sheen implied by colour only. Covers about 4 x 4 metres. Flat, even diffuse overcast lighting, no shadows, no reflections of sky or lights, no puddles. No road markings, no text, no logos, no people. Photorealistic PBR albedo, uniform, repeats without visible pattern.
- **Size:** 1024x1024
- **Avoid:** mirror reflections, street lights or neon reflected in the surface, puddles, raindrops, splashes, perspective.

#### 3. `footpath_concrete`
- **Purpose:** footpaths along every street.
- **Prompt:**
  > Seamless tileable texture of an Australian city concrete footpath, viewed straight down from directly above, orthographic top-down. Pale warm-grey broom-finished concrete with faint fine brush texture, square slab expansion joints about 1.5 metres apart forming an even grid, subtle weathering, a few light old gum stains and faint grime near joints. Covers about 3 x 3 metres. Flat, even diffuse lighting, no shadows, no highlights. No text, no logos, no people, no leaves. Photorealistic PBR albedo, high detail, seamless on all four edges.
- **Size:** 1024x1024
- **Avoid:** perspective, kerb edges, tactile yellow pavers, drains, grates, strong dark stains, paving-stone patterns, cracks that end at the tile border.

#### 4. `grass_lawn`
- **Purpose:** parks, nature strips, front lawns, ovals.
- **Prompt:**
  > Seamless tileable texture of a mown Australian park lawn, viewed straight down from directly above, orthographic top-down. Couch and kikuyu grass, natural slightly dry summer green with subtle variation of olive and pale yellow-green patches, a few tiny clover leaves and fine dry blades, short and even. Covers about 2 x 2 metres. Flat, even diffuse overcast lighting, no shadows, no sun highlights. No flowers, no leaves, no objects, no text, no people. Photorealistic PBR albedo, uniform, repeats without visible pattern.
- **Size:** 1024x1024
- **Avoid:** saturated golf-course green, mowing stripes, large bare patches, a single big weed, depth-of-field blur, perspective.

#### 5. `gravel_tan`
- **Purpose:** the Tan running track around the Botanic Gardens. Melbourne's Tan is crushed granitic sand.
- **Prompt:**
  > Seamless tileable texture of a compacted crushed granite running path, viewed straight down from directly above, orthographic top-down. Fine warm tan and ochre decomposed granite gravel, 2-8 mm grains with occasional slightly larger pale stones, compacted smooth with faint scuffs from footsteps, light dust. Covers about 2 x 2 metres. Flat, even diffuse lighting, no shadows. No footprints, no leaves, no text, no logos, no people. Photorealistic PBR albedo, uniform, seamless on all four edges.
- **Size:** 1024x1024
- **Avoid:** clear footprints or shoe treads, puddles, large rocks, orange or red tints, beach sand, perspective.

#### 6. `sand_beach`
- **Purpose:** bayside beaches (St Kilda, Brighton, Port Melbourne).
- **Prompt:**
  > Seamless tileable texture of Port Phillip Bay beach sand, viewed straight down from directly above, orthographic top-down. Fine pale golden-beige sand, slightly uneven with soft wind ripples and faint scattered shell grit, very subtle. Covers about 3 x 3 metres. Flat, even diffuse lighting, no shadows, no wet edge. No footprints, no seaweed, no objects, no text, no people. Photorealistic PBR albedo, uniform, seamless on all four edges.
- **Size:** 1024x1024
- **Avoid:** tropical white sand, strong ripple shadows, footprints, waterline, shells big enough to repeat visibly, perspective.

#### 7. `tram_tracks_cobble`
- **Purpose:** bluestone cobbles for laneways and the tram corridors. The rails are separate geometry, so this is the paving only.
- **Prompt:**
  > Seamless tileable texture of Melbourne bluestone cobblestone laneway paving, viewed straight down from directly above, orthographic top-down. Rectangular dark blue-grey basalt setts about 10 x 20 cm, laid in straight staggered courses, worn smooth and slightly rounded on top, thin dark grout and grit lines between them, subtle variation in stone tone. Covers about 2 x 2 metres. Flat, even diffuse lighting, no shadows, no highlights. No rails, no drains, no text, no logos, no people. Photorealistic PBR albedo, seamless on all four edges, courses align across the tile borders.
- **Size:** 1024x1024
- **Avoid:** round European cobbles, brown or red stones, tram rails, moss clumps, wet reflections, perspective, courses that bend.

#### 8. `dirt_park`
- **Purpose:** bare ground under trees, worn paths, verges, construction sites.
- **Prompt:**
  > Seamless tileable texture of dry compacted bare earth in an Australian park, viewed straight down from directly above, orthographic top-down. Light brown and grey-brown dusty soil with fine grit, small scattered pebbles, a few dry eucalyptus leaf fragments and tiny twigs, faint sparse dry grass tufts. Covers about 3 x 3 metres. Flat, even diffuse lighting, no shadows. No text, no logos, no people, no footprints. Photorealistic PBR albedo, uniform, seamless on all four edges.
- **Size:** 1024x1024
- **Avoid:** mud, puddles, red outback dirt, large rocks or sticks, tyre tracks, perspective.

### Building facades (front-on elevation, tile horizontally AND vertically)

**Facade rule for all of them:** each image is **exactly 2 storeys tall** (except the shopfront, which is 1). Start and end the image *halfway through the solid band between floors*, so the bottom edge continues straight into the top edge. Windows sit on a perfect grid with equal margins on the left and right. There is no sky, no ground, no roofline and no street, and the wall fills the whole frame.

#### 9. `facade_glass_tower`
- **Purpose:** CBD towers.
- **Prompt:**
  > Seamless tileable architectural facade texture, flat front-on orthographic elevation of a modern Melbourne office tower curtain wall, exactly two storeys tall, about 8 metres wide by 8 metres tall. Blue-grey reflective glass panels in a regular grid of slim dark grey aluminium mullions, each storey about 4 metres with a narrow opaque spandrel band at floor level, glass shows soft dark interior and faint even sky tint but no clear reflections. Image starts and ends mid-spandrel so it tiles vertically, and mullions align at left and right edges so it tiles horizontally. Flat, even diffuse lighting, no shadows, no sun glare. No sky, no ground, no text, no logos, no people, no visible office contents. Photorealistic PBR albedo, perfectly straight lines, no perspective.
- **Size:** 1024x1024
- **Avoid:** perspective or converging lines, reflected clouds or buildings, sun flare, lit interiors, curved glass, roof edge, people at windows, a mirror-gold or green tint.

#### 10. `facade_office_concrete`
- **Purpose:** mid-rise offices around the CBD (1970s-90s ribbon-window blocks).
- **Prompt:**
  > Seamless tileable architectural facade texture, flat front-on orthographic elevation of a 1970s Melbourne concrete office building, exactly two storeys tall, about 8 metres wide by 7.5 metres tall. Horizontal bands of pale weathered precast concrete spandrels alternating with continuous ribbon windows of dark tinted glass in thin bronze-grey aluminium frames, subtle rain-streak staining below each sill, slight concrete texture. Image starts and ends mid-concrete band so it tiles vertically; window mullions are evenly spaced and align at left and right edges. Flat, even diffuse lighting, no shadows. No sky, no ground, no text, no logos, no signs, no people. Photorealistic PBR albedo, perfectly straight lines, no perspective.
- **Size:** 1024x1024
- **Avoid:** perspective, balconies, air-con units, signage, heavy black streaks, lit windows, roofline, brutalist sculptural detail that breaks the repeat.

#### 11. `facade_red_brick`
- **Purpose:** inner-suburb Victorian terraces, Carlton, Fitzroy and Collingwood warehouses converted to flats.
- **Prompt:**
  > Seamless tileable architectural facade texture, flat front-on orthographic elevation of a Victorian-era Melbourne red brick building, exactly two storeys tall, about 6 metres wide by 7 metres tall. Weathered red-brown and rust-orange handmade bricks in English bond with slightly recessed pale lime mortar, two tall double-hung timber sash windows per storey painted off-white, with stone sills and brick soffit arches above, dark glass showing faint net curtains. Windows evenly spaced with equal margins so it tiles horizontally; image starts and ends mid-wall between window rows so it tiles vertically. Flat, even diffuse lighting, no shadows. No sky, no ground, no text, no logos, no people, no graffiti. Photorealistic PBR albedo, straight lines, no perspective.
- **Size:** 1024x1024
- **Avoid:** perspective, modern aluminium windows, bright orange new brick, ivy, graffiti, drainpipes at one edge only, balconies, doors.

#### 12. `facade_sandstone`
- **Purpose:** heritage CBD buildings and banks (Collins Street style).
- **Prompt:**
  > Seamless tileable architectural facade texture, flat front-on orthographic elevation of a 19th-century Melbourne heritage building, exactly two storeys tall, about 7 metres wide by 9 metres tall. Honey-cream sandstone ashlar blocks with fine joints over a dark blue-grey bluestone string course, two tall round-arched windows per storey with carved keystones and moulded stone surrounds, dark multi-pane timber windows, light soot weathering in the recesses. Windows evenly spaced with equal margins so it tiles horizontally; image starts and ends mid-wall between window rows so it tiles vertically. Flat, even diffuse lighting, no shadows. No sky, no ground, no cornice or roofline, no text, no logos, no people. Photorealistic PBR albedo, straight lines, no perspective.
- **Size:** 1024x1024 (or 1024x1536 portrait if the arches look squashed)
- **Avoid:** perspective, statues, columns that end at the frame edge, heavy black soot, a cathedral or church look, lit interiors, doors, flags.

#### 13. `facade_weatherboard`
- **Purpose:** suburban houses (Californian bungalows, workers' cottages).
- **Prompt:**
  > Seamless tileable architectural facade texture, flat front-on orthographic elevation of an Australian painted timber weatherboard house wall, exactly one storey tall, about 3 metres wide by 3 metres tall. Horizontal overlapping timber weatherboards about 15 cm high, painted soft heritage cream with slightly weathered and chalky paint, one white-framed timber double-hung window centred in the wall, dark glass with a faint venetian blind, with plain boards above and below it. Boards run straight across so it tiles horizontally, and the top and bottom edges are plain boards so it tiles vertically. Flat, even diffuse lighting, no shadows from the board laps. No sky, no ground, no eaves, no text, no logos, no people. Photorealistic PBR albedo, straight lines, no perspective.
- **Size:** 1024x1024
- **Avoid:** perspective, vertical boards, American clapboard with shutters, bright white or saturated colour, verandah, doors, gutters, peeling paint everywhere.
- **Variant tip:** generate the same prompt with "painted pale sage green", "painted Monument dark grey" and "painted duck-egg blue" if you want more than one. The engine can also tint the cream version.

#### 14. `facade_shopfront`
- **Purpose:** the ground floor of shops on main roads (Chapel St, Sydney Rd, Brunswick St). **1 storey, tiles horizontally only.**
- **Prompt:**
  > Seamless horizontally tileable architectural texture, flat front-on orthographic elevation of a Melbourne strip-shop ground floor, exactly one storey tall, about 8 metres wide by 3.6 metres tall. Two large glazed display windows on low painted tiled stall-boards with a recessed glazed timber entry door between them, slim dark painted timber or aluminium frames, glass showing a dim, softly blurred generic shop interior without readable products, plain painted fascia band across the top left blank for signage. Left and right edges cut through matching pilasters so it repeats horizontally. Flat, even diffuse lighting, no shadows, no reflections of the street. No text, no signs, no logos, no prices, no posters, no people, no awning, no footpath. Photorealistic PBR albedo, straight lines, no perspective.
- **Size:** 1536x1024 landscape
- **Avoid:** any lettering or signage, reflections of cars or people, roller shutters, awning, footpath or kerb, mannequins, neon, perspective.

#### 15. `facade_warehouse`
- **Purpose:** port sheds, industrial estates, factories in the west and south-east.
- **Prompt:**
  > Seamless tileable texture, flat front-on orthographic view of an Australian industrial shed wall clad in corrugated Colorbond steel sheeting, about 4 metres wide by 7 metres tall. Vertical corrugations at even spacing, Surfmist off-white and slightly chalky pre-painted steel, faint horizontal fixing-screw lines at even intervals, light dust and subtle rain streaks, no windows. Corrugations run straight off all edges so it tiles in both directions. Flat, even diffuse lighting, no shadows or highlights along the ribs. No sky, no ground, no text, no logos, no people. Photorealistic PBR albedo, perfectly straight vertical lines, no perspective.
- **Size:** 1024x1024
- **Avoid:** strong stripe shading from lighting, heavy rust, holes, roller doors, signage, perspective, shiny galvanised mirror finish.
- **Variant tip:** "Woodland Grey" and "Basalt" (dark charcoal) versions both read as very Melbourne.

#### 16. `roof_terracotta`
- **Purpose:** pitched roofs on suburban houses.
- **Prompt:**
  > Seamless tileable texture of an Australian terracotta tiled house roof, viewed straight down perpendicular to the roof plane, orthographic. Rows of Marseille-pattern interlocking terracotta roof tiles in weathered orange-red and brick-red, slight colour variation between tiles, faint lichen speckles and dust, rows straight and evenly spaced. Covers about 3 x 3 metres. Flat, even diffuse lighting, no shadows under the tile laps. No ridge caps, no gutters, no chimneys, no text, no people. Photorealistic PBR albedo, seamless on all four edges.
- **Size:** 1024x1024
- **Avoid:** Spanish barrel tiles, perspective, heavy moss, broken tiles, solar panels, saturated orange, strong shadow stripes.

#### 17. `roof_flat_gravel`
- **Purpose:** flat roofs of CBD and commercial buildings, seen from the overhead camera and from towers.
- **Prompt:**
  > Seamless tileable texture of a commercial flat roof, viewed straight down from directly above, orthographic top-down. Light grey ballast gravel of mixed small rounded stones over a membrane, a few faint darker damp patches and dust, uniform density. Covers about 4 x 4 metres. Flat, even diffuse lighting, no shadows. No vents, no equipment, no drains, no text, no logos, no people. Photorealistic PBR albedo, seamless on all four edges.
- **Size:** 1024x1024
- **Avoid:** air-con units, pipes, puddles, perspective, beige beach-like gravel, large individual rocks.

### Optional extras (highest impact first)

#### 18. `facade_apartment_balcony` *(optional)*
- **Purpose:** modern mid-rise apartments, the most common new building type in present-day Melbourne (Southbank, Docklands, Brunswick). It reads as "now" more than anything else.
- **Prompt:**
  > Seamless tileable architectural facade texture, flat front-on orthographic elevation of a modern Melbourne apartment building, exactly two storeys tall, about 8 metres wide by 6.2 metres tall. Charcoal and white fibre-cement panels with a vertical timber-look batten accent, floor-to-ceiling dark-framed sliding glass doors, frameless glass balcony balustrades with thin slab edges, faint blinds behind the glass. Units evenly spaced so it tiles horizontally; starts and ends mid-slab so it tiles vertically. Flat, even diffuse lighting, no shadows. No sky, no ground, no furniture or plants on balconies, no text, no logos, no people. Photorealistic PBR albedo, straight lines, no perspective.
- **Size:** 1024x1024
- **Avoid:** perspective, balcony clutter, washing, lit interiors, curved balconies, saturated feature colours.

#### 19. `billboard_ad_01` to `billboard_ad_04` *(optional)*
- **Purpose:** roadside and rooftop billboards, which give the city instant "real place" density. Run the prompt once per ad and change the bracketed brand line each time.
- **Prompt:**
  > Flat front-on billboard advertisement artwork filling the whole frame, 3:1 landscape, photographic modern Australian advertising style, clean layout. [BRAND LINE]. Only the fictional brand name and short slogan given here may appear as text, spelled exactly. No real brands, no real logos, no real people or celebrities, no frame, no billboard structure, no sky.
- **Brand lines (all fictional):**
  1. "A cold beer bottle beaded with condensation on a sunny bayside deck, brand name 'SOUTHERLY LAGER', slogan 'Brewed for the Bay'"
  2. "A modern ute driving a red-dirt road at golden hour, brand name 'FJORD STRAINGER', slogan 'Built Tough. Built Here.'"
  3. "Teal and white plumbing supplies, PVC pipes and a tradie's gloved hands, brand name 'PLUMBRIGHT', slogan 'Trade Prices. Trade Hours.'"
  4. "Hot meat pie with tomato sauce on a paper bag, brand name 'BIG RED PIES', slogan 'Half-Time Hero'"
- **Size:** 1536x1024 (we crop to 3:1)
- **Avoid:** misspelled or extra text (regenerate if so), real logos, cartoon style, real footy club colours combined with a logo.

#### 20. `sky_horizon_panorama` *(optional)*
- **Purpose:** a distant horizon band (the Dandenong Ranges, the far suburbs and haze) behind the real sky, so the map edge never looks like it stops.
- **Prompt:**
  > Wide seamless horizontally tileable panoramic strip of a distant Australian horizon seen from Melbourne, eye level: low blue-grey Dandenong Ranges silhouette with hazy eucalyptus forest, faint distant suburbs and a few far-off low buildings, atmospheric haze getting lighter towards the top, the top third plain pale hazy sky fading to near-white. Soft midday light, slightly desaturated, no sun, no clouds with strong detail. Left and right edges match exactly. No text, no logos, no people, no foreground, no roads.
- **Size:** 1536x1024 (we use the lower half as the strip)
- **Avoid:** dramatic sunset, recognisable CBD towers (the game has its own), birds, aircraft, lens flare, mountains taller than gentle ranges.

#### 21. `keyart_loading` *(optional)*
- **Purpose:** the loading-screen and title image, which sets the "this is a real game" tone before the first frame.
- **Prompt:**
  > Cinematic key art for a mature open-world crime video game set in present-day Melbourne, Australia, in the style of modern Rockstar-era photoreal-illustrated loading screens. A lone figure in a dark jacket leaning on a muscular Australian sedan in a wet bluestone laneway at dusk, a yellow-and-green tram passing at the end of the lane, the Melbourne CBD skyline glowing behind with warm sodium street light against cool blue dusk. Grounded, gritty, desaturated warm-cool grade, film grain, strong composition with space at the top for a title. No text, no logos, no real brands, no real people, no weapons pointed at the viewer.
- **Size:** 1536x1024 landscape (also make a 1024x1536 portrait for mobile)
- **Avoid:** cartoon or comic style, real Rockstar or GTA logos, any lettering, real car badges, real club colours, gore.

---

## 3. Character skin prompts

Image generators cannot produce skins laid out on the MakeHuman UV map, so do not ask for "a UV texture". Make two kinds of image instead:
- (a) **Reference sheets.** We match these by hand when we script the outfits in `tools/characters/`.
- (b) **Fabric swatches.** We tile these onto the clothing meshes.

### (a) Reference / concept sheets

**Shared base. Paste it first, then add one outfit line.**
> Character reference sheet for a realistic modern video game, full body, neutral A-pose with arms angled 45 degrees down, relaxed neutral face, two views side by side: front view and exact side profile, same character, same scale, orthographic, plain flat light grey background, even studio lighting, no shadows on the background, photoreal, accurate clothing construction and seams visible, natural proportions. No text, no logos, no brand marks, no real people or celebrities. Outfit:

| Name | Outfit line to append |
|---|---|
| `ref_tradie` | "Australian tradie in his 30s, fluorescent orange-and-navy hi-vis long-sleeve work shirt with silver reflective tape bands across chest and arms, navy cargo work shorts, tan leather steel-cap work boots, grey work socks, sunglasses pushed up on a cap, tanned forearms, slight stubble." |
| `ref_footy` | "AFL footy supporter in her 20s, generic navy and white hooped knitted football jumper with no club emblem, matching knitted striped scarf, faded blue jeans, white sneakers, beanie in the same colours." |
| `ref_student` | "Melbourne university student around 20, oversized washed charcoal hoodie, light-wash wide-leg jeans, white canvas sneakers, tote bag on one shoulder, small backpack, wired earbuds." |
| `ref_runner` | "Runner on the Tan track, in his 40s, bald with a short grey beard, fitted moisture-wicking running singlet in muted teal, black running shorts, compression socks, lightweight running shoes, sports watch, lean build." |
| `ref_nightclub` | "Chapel Street nightclub-goer in her late 20s, black satin slip dress or fitted black shirt and tailored trousers, cropped leather jacket, ankle boots, small clutch, minimal gold jewellery, evening make-up." |

- **Size:** 1536x1024 landscape (two views side by side).
- **Avoid:** dynamic poses, cropped feet or hands, perspective lens distortion, dramatic lighting, anime or cartoon style, club logos or crests, real brand swooshes or stripes.

### (b) Fabric swatches (seamless, tileable)

**Shared suffix:**
> seamless tileable fabric texture, flat lay viewed straight down, orthographic, flat even diffuse lighting, no shadows, no folds or wrinkles, fills the entire frame, no text, no logos, no people, photorealistic macro textile scan, PBR albedo

| Slot | Prompt (add the shared suffix) | Scale |
|---|---|---|
| `fabric_denim` | "Mid-blue washed cotton denim twill with visible diagonal twill weave, slight indigo fading and white weft flecks, even wash, no seams or stitching" | about 15 x 15 cm |
| `fabric_hivis` | "Fluorescent orange polyester hi-vis workwear fabric with a single horizontal silver-grey retro-reflective tape stripe 5 cm wide running straight across the middle, fine polyester weave visible" | about 30 x 30 cm (one stripe per tile) |
| `fabric_hivis_yellow` | Same as `fabric_hivis` but "fluorescent lime-yellow" | about 30 x 30 cm |
| `fabric_flannel_check` | "Brushed cotton flannel in a red, black and charcoal buffalo and tartan check, soft fuzzy surface, check pattern perfectly aligned to the tile edges" | about 20 x 20 cm (two repeats of the check) |
| `fabric_cotton_jersey` | "Plain heather-grey cotton jersey T-shirt knit, fine visible knit loops, subtle melange of light and mid greys" | about 10 x 10 cm |
| `fabric_hoodie_fleece` | "Washed charcoal cotton-poly sweatshirt fleece outer face, matte soft surface, faint fine knit texture, slight pilling" | about 10 x 10 cm |
| `fabric_footy_knit` | "Chunky knitted wool football jumper fabric with even horizontal hoops: wide navy and white stripes, visible knit stitches, stripes perfectly horizontal and aligned to tile edges, no emblem, no numbers" | about 30 x 30 cm (two hoops per tile) |

- **Size:** 1024x1024 each.
- **Avoid:** folds, buttons, seams, labels, shadows, a vignette, any crest or number. For the footy knit, avoid colour pairs that read as one real club *with* a logo. Stripes alone are fine; the engine can recolour them.

---

## 4. How to make them (for the owner)

1. **One texture per chat message.** Paste a single prompt exactly as written. Ask ChatGPT for "**square 1024x1024**" (or the size listed). In Higgsfield, set the aspect ratio before you generate.
2. **Check for seams.** Picture four copies side by side and stacked. Hard edges, a line that stops at the border, or one corner darker than the others means it isn't seamless. Regenerate, or reply "make the edges match seamlessly, same texture". Small seams are fine, because we can blend them in code.
3. **Check for the usual faults** and regenerate if you see any: perspective (it should look flat, like a scan), shadows or a sunny glare, text or logos, people, or a strong colour tint.
4. **Higgsfield tips:** use a photoreal model rather than a stylised one, turn any "cinematic" or style preset **off** for textures (keep it on for key art), and use the "negative" or avoid field for the Avoid line.
5. **Download** as PNG or JPG at the highest size offered. We convert to JPG and resize.
6. **Send it in the chat** and either name the file with the slot (for example `road_asphalt.jpg`) or just say "this is road_asphalt". If you make more than one version, send them all and we'll pick or use them as variants.
7. **Priority order** if you're short on time: `road_asphalt`, `footpath_concrete`, `facade_glass_tower`, `facade_red_brick`, `grass_lawn`, `facade_shopfront`, `roof_terracotta`, then the rest.
