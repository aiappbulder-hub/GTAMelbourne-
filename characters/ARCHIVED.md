# Archived: the character authoring sources

`characters/exports/` stays: the retired root game (`index.html`) loads `trent.glb` and the `*_crowd.glb` files from it.

The authoring sources were removed from the working tree because nothing loads them: `base_models/` (27 MB), `source/`
(16 MB) and `textures/` (32 MB). `tools/characters/` needs them to rebuild the characters. They are in git history:

    git checkout 1d90ec3 -- characters/base_models characters/source characters/textures
