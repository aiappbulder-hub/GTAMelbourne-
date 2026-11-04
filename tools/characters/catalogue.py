"""STAGE 7 - writes characters/catalogue.json (every character, outfit and export) for the catalogue page.

    python tools/characters/catalogue.py      (Blender's Python module, because it reads CHARACTERS from stage1_base)
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stage1_base as S   # noqa: E402

NICE = {"aussie_bloke": "Everyday Aussie bloke", "aussie_girl": "Everyday Aussie woman", "tradie_dazza": "Tradie",
        "student_minh": "Uni student", "student_amara": "Uni student", "gym_jono": "Gym and running", "gym_kayla": "Gym and running",
        "street_kai": "Streetwear", "old_bruce": "Older Aussie bloke (footy)", "old_marg": "Older Aussie woman", "night_jess": "Nightlife",
        "gang_tama": "Street gang", "bearded_gaz": "Bald and bearded", "trent": "Player character (Trent)"}
out = []
for name, C in S.CHARACTERS.items():
    files = {}
    for suf in ("", "_base", "_crowd"):
        f = os.path.join(S.ROOT, "exports", name + suf + ".glb")
        if os.path.exists(f):
            files[suf.strip("_") or "outfit"] = {"file": "exports/" + name + suf + ".glb", "kb": os.path.getsize(f) // 1024}
    out.append({"id": name, "type": NICE.get(name, name), "sex": C["sex"], "hair": C["hair"], "beard": bool(C.get("beard")),
                "tattoo": C.get("tattoo", []), "skin": C["skin"], "eye": C["eye"],
                "outfit": [{"kind": k, **{kk: vv for kk, vv in o.items() if isinstance(vv, (str, int, float, bool))}} for k, o in C["outfit"]],
                "files": files})
json.dump({"characters": out, "clips": ["idle", "walk", "run", "aim", "shoot", "runShoot", "punch", "jump", "die"]},
          open(os.path.join(S.ROOT, "catalogue.json"), "w"), indent=1)
print("catalogue:", len(out), "characters")
