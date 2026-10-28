"""Builds map/melbourne.js, the game's map of Melbourne, from OpenStreetMap data.

Usage: python3 tools/build_map.py <directory-data.js> map/melbourne.js

The source is the OSM extract bundled with k-dhingra/melbourne-street-directory (OpenStreetMap
contributors, ODbL). It covers Melway pages 16-68: Sunshine to Croydon, Essendon to Brighton.
The Monash and EastLink south to Dandenong, and the suburbs around Glen Waverley, sit just
outside it and are filled in by hand below.

The whole metro area is far too big to drive at game scale, so the projection is a fisheye:
the CBD keeps close to full size and the suburbs are squeezed (distance from the CBD grows
with its square root). Streets are then thinned so that parallel streets keep enough room
between them for footpaths and buildings; freeways and arterials win over side streets.
"""
import json, math, sys, collections

SRC, OUT = sys.argv[1], sys.argv[2]
DEBUG = sys.argv[3] if len(sys.argv) > 3 else None

# ------------------------------------------------------------------ projection
LON0, LAT0 = 144.9628, -37.8142
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110950
R0M, S0 = 1100.0, 1.6           # metres of near-true scale, and px per metre at the centre
RR = R0M * S0
BOUNDS = (144.79, -38.0, 145.30, -37.70)
MARGIN = 160


def warp(lon, lat):
    dx, dy = (lon - LON0) * KX, (LAT0 - lat) * KY
    r = math.hypot(dx, dy)
    if r < 1e-9:
        return 0.0, 0.0
    f = 2 * RR * (math.sqrt(1 + r / R0M) - 1)
    return dx * f / r, dy * f / r


_edge = []
for i in range(401):
    t = i / 400
    lo = BOUNDS[0] + (BOUNDS[2] - BOUNDS[0]) * t
    la = BOUNDS[1] + (BOUNDS[3] - BOUNDS[1]) * t
    _edge += [warp(lo, BOUNDS[1]), warp(lo, BOUNDS[3]), warp(BOUNDS[0], la), warp(BOUNDS[2], la)]
OX = -min(p[0] for p in _edge) + MARGIN
OY = -min(p[1] for p in _edge) + MARGIN
WPX = int(max(p[0] for p in _edge) + OX + MARGIN)
HPX = int(max(p[1] for p in _edge) + OY + MARGIN)


def P(lon, lat):
    x, y = warp(lon, lat)
    return x + OX, y + OY


def in_bounds(lon, lat):
    return BOUNDS[0] <= lon <= BOUNDS[2] and BOUNDS[1] <= lat <= BOUNDS[3]


def coast_lon(lat):
    """Longitude of the bayside shore south of Brighton (outside the OSM pages), by latitude."""
    pts = [(-37.918, 144.987), (-37.930, 144.992), (-37.948, 145.002), (-37.963, 145.012), (-37.976, 145.022), (-37.990, 145.034), (-38.0, 145.040)]
    if lat > pts[0][0]:
        return 0
    for (a, x), (b, y) in zip(pts, pts[1:]):
        if b <= lat <= a:
            return x + (y - x) * (a - lat) / (a - b)
    return pts[-1][1]


def in_extension(lon, lat):
    """Land outside the OSM pages that we fill in by hand."""
    return (lon > 145.066 and lat < -37.8742) or (lon > 144.976 and lat < -37.9183)


# ------------------------------------------------------------------ geometry helpers
def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a][0], pts[a][1]
        bx, by = pts[b][0], pts[b][1]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-9
        best, bi = -1, -1
        for i in range(a + 1, b):
            d = abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L
            if d > best:
                best, bi = d, i
        if best > eps:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def rdp_ring(pts, eps):
    """Simplify a closed ring: split it at the point farthest from the start and simplify each half."""
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if len(pts) < 4:
        return pts
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    a = rdp(pts[:far + 1], eps)
    b = rdp(pts[far:] + [pts[0]], eps)
    return a[:-1] + b[:-1]


def area(poly):
    return abs(sum(poly[i][0] * poly[i - 1][1] - poly[i - 1][0] * poly[i][1] for i in range(len(poly)))) / 2


def plen(pts):
    return sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1))


def flat(pts):
    out = []
    for p in pts:
        out += [round(p[0]), round(p[1])]
    return out


def chaikin(pts, it=2, closed=False):
    for _ in range(it):
        q = [] if closed else [pts[0]]
        n = len(pts)
        rng = range(n) if closed else range(n - 1)
        for i in rng:
            a, b = pts[i], pts[(i + 1) % n]
            q += [(a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25), (a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75)]
        if not closed:
            q.append(pts[-1])
        pts = q
    return pts


class Grid:
    def __init__(self, cell):
        self.c = cell
        self.d = collections.defaultdict(list)

    def add(self, x, y, v):
        self.d[(int(x // self.c), int(y // self.c))].append(v)

    def near(self, x, y, r):
        c = self.c
        for gx in range(int((x - r) // c), int((x + r) // c) + 1):
            for gy in range(int((y - r) // c), int((y + r) // c) + 1):
                yield from self.d.get((gx, gy), ())


# ------------------------------------------------------------------ load
raw = open(SRC, encoding="utf-8").read()
DATA = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
PAGES = DATA["pages"]
print("pages", len(PAGES), "world", WPX, "x", HPX)

FREEWAY_WORDS = ("Freeway", "CityLink", "EastLink", "Ring Road", "Bypass", "Tollway")
SKIP_NAMES = {"Aughtie Drive", "Lakeside Drive"}   # the Albert Park circuit replaces these


def road_kind(r):
    cls = r["r"]
    tags = r.get("tags") or {}
    name = r.get("n") or ""
    if cls == 6 and name == "North East Link":
        cls = 0      # still being built in the OSM data; finished in the game
    if cls > 5 or r.get("t"):
        return None
    if tags.get("service") or tags.get("tunnel") == "building_passage":
        return None
    fw = cls == 0 and (any(w in name for w in FREEWAY_WORDS) or name in ("North East Link", "West Gate Tunnel"))
    tun = fw and tags.get("tunnel") == "yes"
    if tags.get("tunnel") and not fw:
        return None
    if name in SKIP_NAMES:
        return None
    if cls == 4 or "Service Road" in name or name.endswith(" Lane") or name.startswith("Little "):
        return None    # laneways, service roads and little streets only clutter the game map
    return (name, cls, fw, tun)


# ---------------------------------------------------------------- road topology: segments keyed by OSM node position
def key(lon, lat):
    return (round(lon * 1e6), round(lat * 1e6))


NODE_LL = {}
SEG = {}          # (ka,kb) sorted -> attr
for pg in PAGES:
    for r in pg["roads"]:
        k = road_kind(r)
        if not k:
            continue
        for ls in r["g"]:
            prev = None
            for lon, lat in ls:
                kk = key(lon, lat)
                NODE_LL[kk] = (lon, lat)
                if prev and prev != kk:
                    s = (prev, kk) if prev < kk else (kk, prev)
                    if s not in SEG or k[1] < SEG[s][1]:
                        SEG[s] = k
                prev = kk

# weld page-boundary cut points: loose ends within ~1.5 m of each other are the same node
adj = collections.defaultdict(set)
for a, b in SEG:
    adj[a].add(b)
    adj[b].add(a)
ends = [k for k, v in adj.items() if len(v) == 1]
eg = Grid(30)
for k in ends:
    eg.add(k[0], k[1], k)
alias = {}
for k in ends:
    if k in alias:
        continue
    for o in eg.near(k[0], k[1], 25):
        if o != k and o not in alias and abs(o[0] - k[0]) < 25 and abs(o[1] - k[1]) < 25:
            alias[o] = k
if alias:
    NS = {}
    for (a, b), v in SEG.items():
        a, b = alias.get(a, a), alias.get(b, b)
        if a == b:
            continue
        s = (a, b) if a < b else (b, a)
        if s not in NS or v[1] < NS[s][1]:
            NS[s] = v
    SEG = NS
print("segments", len(SEG), "welded", len(alias))

# ------------------------------------------------------------------ hand-made roads for the area outside the OSM pages
HAND = [
    ("Monash Freeway", 0, True, [(145.0655, -37.8735), (145.075, -37.879), (145.087, -37.8845), (145.105, -37.889), (145.128, -37.894),
                                 (145.150, -37.8995), (145.170, -37.9055), (145.190, -37.9125), (145.205, -37.9185), (145.2165, -37.9245),
                                 (145.235, -37.935), (145.255, -37.948), (145.275, -37.962), (145.298, -37.976)]),
    ("EastLink", 0, True, [(145.2175, -37.8725), (145.2165, -37.888), (145.2160, -37.905), (145.2165, -37.9245), (145.212, -37.945),
                           (145.206, -37.963), (145.199, -37.982), (145.196, -37.999)]),
    ("Princes Highway", 0, False, [(145.049, -37.8805), (145.065, -37.888), (145.088, -37.899), (145.110, -37.912), (145.128, -37.924),
                                   (145.148, -37.940), (145.170, -37.957), (145.192, -37.972), (145.214, -37.986), (145.240, -37.996)]),
    ("Springvale Road", 0, False, [(145.1635, -37.8715), (145.1625, -37.890), (145.1615, -37.910), (145.1600, -37.930), (145.1585, -37.950),
                                   (145.1575, -37.975), (145.1570, -37.999)]),
    ("Stud Road", 1, False, [(145.2345, -37.8715), (145.2335, -37.890), (145.2310, -37.910), (145.2270, -37.930), (145.2210, -37.955),
                             (145.2150, -37.975), (145.2120, -37.999)]),
    ("Warrigal Road", 1, False, [(145.0945, -37.8715), (145.0935, -37.890), (145.0925, -37.910), (145.0910, -37.930), (145.0880, -37.955),
                                 (145.0860, -37.980)]),
    ("Blackburn Road", 1, False, [(145.1505, -37.8715), (145.1495, -37.890), (145.1480, -37.912), (145.1465, -37.935), (145.1450, -37.960)]),
    ("Ferntree Gully Road", 1, False, [(145.0950, -37.8850), (145.120, -37.8860), (145.150, -37.8870), (145.180, -37.8885),
                                       (145.210, -37.8900), (145.240, -37.8915), (145.270, -37.8925), (145.299, -37.8935)]),
    ("Police Road", 2, False, [(145.110, -37.9285), (145.140, -37.9290), (145.170, -37.9300), (145.200, -37.9310), (145.230, -37.9320)]),
    ("Heatherton Road", 2, False, [(145.150, -37.965), (145.180, -37.968), (145.205, -37.973), (145.230, -37.980), (145.260, -37.984)]),
    ("Centre Road", 1, False, [(144.995, -37.9300), (145.030, -37.9310), (145.060, -37.9320), (145.090, -37.9330), (145.120, -37.9345)]),
    ("South Road", 1, False, [(144.990, -37.9530), (145.030, -37.9550), (145.060, -37.9570)]),
    ("Nepean Highway", 0, False, [(145.0205, -37.9165), (145.027, -37.932), (145.036, -37.948), (145.046, -37.965), (145.057, -37.983),
                                  (145.064, -37.999)]),
    ("Kingsway", 2, False, [(145.1650, -37.8715), (145.1650, -37.879), (145.1652, -37.887)]),
    ("Waverley Road", 1, False, [(145.1000, -37.8742), (145.1300, -37.8760), (145.1600, -37.8775), (145.1900, -37.8790), (145.2200, -37.8800),
                                 (145.2500, -37.8805), (145.2990, -37.8815)]),
    ("Wellington Road", 1, False, [(145.1650, -37.9150), (145.2000, -37.9125), (145.2300, -37.9145), (145.2600, -37.9170), (145.2990, -37.9185)]),
    ("Clayton Road", 2, False, [(145.1205, -37.8740), (145.1210, -37.900), (145.1215, -37.925), (145.1220, -37.950)]),
    ("Jells Road", 2, False, [(145.1860, -37.8890), (145.1870, -37.905), (145.1880, -37.925)]),
]
LOCAL_NAMES = ["Coleman Pde", "Bogong Ave", "Myrtle St", "Euneva Ave", "Railway Pde", "Snedden Dr", "Lechte Rd", "Highbury Rd", "Glen Tce",
               "Montclair Ave", "Kerrie Rd", "Strickland Dr", "Gallaghers Rd", "Brentwood Dr", "Wantirna Rd", "Lum Rd", "Jacana St",
               "Callaghan Ave", "Dunlop Rd", "Larpent St", "Grandview Rd", "Watsons Rd", "Hanover St", "Napier St", "Stephensons Rd",
               "Huntingdale Rd", "Golf Rd", "Ellen St", "Garnett Rd", "Wallace Ave"]
# a loose street grid through the new suburbs so there is somewhere to drive besides the arterials
_k = 0
for i, lon in enumerate([145.076 + j * 0.0135 for j in range(18)]):
    pts = [(lon + 0.0004 * math.sin(lat * 900), lat) for lat in [-37.8745 - j * 0.0025 for j in range(51)]]
    HAND.append((LOCAL_NAMES[_k % len(LOCAL_NAMES)], 3, False, pts))
    _k += 1
for lat in [-37.8830 - j * 0.0115 for j in range(10)]:
    pts = [(lon, lat + 0.0003 * math.sin(lon * 700)) for lon in [144.978 + j * 0.0032 for j in range(101)]]
    HAND.append((LOCAL_NAMES[_k % len(LOCAL_NAMES)], 3, False, pts))
    _k += 1

# ------------------------------------------------------------------ chains (ways) from the segment graph
adj = collections.defaultdict(list)
for (a, b), v in SEG.items():
    adj[a].append((b, v))
    adj[b].append((a, v))


def is_break(n):
    e = adj[n]
    return len(e) != 2 or e[0][1] != e[1][1]


seen = set()
CHAINS = []   # dict(attr, keys[list of node keys or None], pts[list of world xy], hand)


def add_chain(attr, keys):
    pts = [P(*NODE_LL[k]) for k in keys]
    CHAINS.append({"attr": attr, "keys": keys, "pts": pts, "hand": False})


for n in list(adj):
    if not is_break(n):
        continue
    for m, v in adj[n]:
        s = (n, m) if n < m else (m, n)
        if s in seen:
            continue
        seen.add(s)
        keys = [n, m]
        while not is_break(keys[-1]):
            nxt = [q for q, _ in adj[keys[-1]] if q != keys[-2]]
            if not nxt:
                break
            q = nxt[0]
            s2 = (keys[-1], q) if keys[-1] < q else (q, keys[-1])
            if s2 in seen:
                break
            seen.add(s2)
            keys.append(q)
        add_chain(v, keys)
for (a, b), v in SEG.items():   # loops with no break
    s = (a, b)
    if s in seen:
        continue
    seen.add(s)
    keys = [a, b]
    while True:
        nxt = [q for q, _ in adj[keys[-1]] if q != keys[-2]]
        if not nxt:
            break
        q = nxt[0]
        s2 = (keys[-1], q) if keys[-1] < q else (q, keys[-1])
        if s2 in seen:
            break
        seen.add(s2)
        keys.append(q)
    add_chain(v, keys)

# join chains into whole streets: at each junction, pair up the pieces of the same road that carry straight on
def end_dir(c, e):
    pts = c["pts"]
    a, b = (pts[0], pts[min(2, len(pts) - 1)]) if e == 0 else (pts[-1], pts[max(-3, -len(pts))])
    L = math.hypot(a[0] - b[0], a[1] - b[1]) or 1
    return (a[0] - b[0]) / L, (a[1] - b[1]) / L


at_node = collections.defaultdict(list)
for ci, c in enumerate(CHAINS):
    if c["keys"][0] == c["keys"][-1]:
        continue
    at_node[c["keys"][0]].append((ci, 0))
    at_node[c["keys"][-1]].append((ci, 1))
link = {}
for n, lst in at_node.items():
    if len(lst) < 2:
        continue
    cand = []
    for i in range(len(lst)):
        for j in range(i + 1, len(lst)):
            (ci, ei), (cj, ej) = lst[i], lst[j]
            if ci == cj:
                continue
            A, B = CHAINS[ci]["attr"], CHAINS[cj]["attr"]
            if A[3] != B[3]:
                continue     # a tunnel and the road outside its portal stay separate
            same = A[0] and A[0] == B[0]
            if not same and not (not A[0] and not B[0] and A[1] == B[1]):
                continue
            da, db = end_dir(CHAINS[ci], ei), end_dir(CHAINS[cj], ej)
            dot = da[0] * db[0] + da[1] * db[1]
            if dot < (-.35 if same else -.8):
                cand.append((dot, (ci, ei), (cj, ej)))
    cand.sort()
    for dot, x, y in cand:
        if x in link or y in link:
            continue
        link[x] = y
        link[y] = x
strokes, used_c = [], set()


def walk(ci, enter):
    keys, pts = [], []
    while ci not in used_c:
        used_c.add(ci)
        c = CHAINS[ci]
        k, p_ = (c["keys"], c["pts"]) if enter == 0 else (c["keys"][::-1], c["pts"][::-1])
        if keys:
            k, p_ = k[1:], p_[1:]
        keys += k
        pts += p_
        out = (ci, 1 - enter)
        if out not in link:
            break
        ci, enter = link[out]
    return keys, pts


order = [ci for ci in range(len(CHAINS)) if (ci, 0) not in link or (ci, 1) not in link] + list(range(len(CHAINS)))
for ci in order:
    if ci in used_c:
        continue
    enter = 0 if (ci, 0) not in link else 1
    keys, pts = walk(ci, enter)
    strokes.append({"attr": CHAINS[ci]["attr"], "keys": keys, "pts": pts, "hand": False})
print("chains", len(CHAINS), "-> streets", len(strokes))
CHAINS = strokes

# hand roads: clip local grid streets to the extension zone, keep arterials whole
for name, cls, fw, ll in HAND:
    runs, cur = [], []
    for lon, lat in ll:
        ok = in_bounds(lon, lat) and (in_extension(lon, lat) or cls < 3)
        if cls >= 3:
            ok = ok and in_extension(lon, lat) and lon > coast_lon(lat) + .005
        if ok:
            cur.append((lon, lat))
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    for r in runs:
        if len(r) < 2:
            continue
        CHAINS.append({"attr": (name, cls, fw, False), "keys": [None] * len(r), "pts": [P(*q) for q in r], "hand": True})
print("chains", len(CHAINS))

# ------------------------------------------------------------------ trams (to boost the streets they run along)
TRAM_LINES, RAIL_LINES = [], []
for pg in PAGES:
    for r in pg["rails"]:
        tags = r.get("tags") or {}
        if tags.get("tunnel"):
            continue
        for ls in r["g"]:
            pts = [P(lon, lat) for lon, lat in ls if in_bounds(lon, lat)]
            if len(pts) < 2:
                continue
            if r.get("t") == "tram":
                TRAM_LINES.append(pts)
            elif r.get("t") == "rail" and tags.get("service") not in ("yard", "siding", "spur", "crossover"):
                RAIL_LINES.append(pts)
tram_grid = Grid(40)
for L in TRAM_LINES:
    for i in range(len(L) - 1):
        a, b = L[i], L[i + 1]
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) // 8))
        for k in range(n + 1):
            t = k / n
            tram_grid.add(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 1)


def near_tram(x, y, r=14):
    g = tram_grid
    for gx in range(int((x - r) // g.c), int((x + r) // g.c) + 1):
        for gy in range(int((y - r) // g.c), int((y + r) // g.c) + 1):
            if (gx, gy) in g.d:
                return True
    return False


# ------------------------------------------------------------------ greedy street selection
WIDTH = {0: 88, 1: 80, 2: 72, 3: 64, 4: 56, 5: 56}
GAP = {0: 40, 1: 60, 2: 90, 3: 135, 4: 170, 5: 170}


def sample(pts, step=10):
    out = []   # (x,y,dx,dy,s)
    s = 0
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L < 1e-6:
            continue
        dx, dy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        n = max(1, int(L // step))
        for k in range(n):
            t = k / n
            out.append((a[0] + dx * L * t, a[1] + dy * L * t, dx, dy, s + L * t))
        s += L
    if len(pts) >= 2:
        a, b = pts[-2], pts[-1]
        L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
        out.append((b[0], b[1], (b[0] - a[0]) / L, (b[1] - a[1]) / L, s))
    return out


# rivers, to spot the bridges: a street that crosses the Yarra or the Maribyrnong must survive
river_grid = Grid(64)
for pg in PAGES:
    for w in pg["waters"]:
        if w.get("t") in ("river", "canal") and not (w.get("tags") or {}).get("tunnel"):
            for ls in w["g"]:
                q = [P(lo, la) for lo, la in ls]
                for i in range(len(q) - 1):
                    river_grid.add((q[i][0] + q[i + 1][0]) / 2, (q[i][1] + q[i + 1][1]) / 2, (q[i], q[i + 1]))


def crosses_river(pts):
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        for (c_, d_) in river_grid.near((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, L / 2 + 64):
            r = (b[0] - a[0], b[1] - a[1])
            s_ = (d_[0] - c_[0], d_[1] - c_[1])
            den = r[0] * s_[1] - r[1] * s_[0]
            if abs(den) < 1e-9:
                continue
            t = ((c_[0] - a[0]) * s_[1] - (c_[1] - a[1]) * s_[0]) / den
            u = ((c_[0] - a[0]) * r[1] - (c_[1] - a[1]) * r[0]) / den
            if 0 <= t <= 1 and 0 <= u <= 1:
                return True
    return False


def real_r(x, y):
    rw = math.hypot(x - OX, y - OY)
    return R0M * ((rw / (2 * RR) + 1) ** 2 - 1)


for c in CHAINS:
    name, cls, fw = c["attr"][:3]
    c["len"] = plen(c["pts"])
    c["S"] = sample(c["pts"])
    tram = sum(1 for q in c["S"] if near_tram(q[0], q[1])) / max(1, len(c["S"]))
    c["tram"] = tram > .5 and c["len"] > 60
    rank = 0 if fw else {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 5}[cls]
    if c["tram"]:
        rank = min(rank, 2)
    c["rank"] = rank
    if c["attr"][3] and c["len"] < 250:
        c["attr"] = c["attr"][:3] + (False,)     # underpasses too short to bother with stay on the surface
    c["w"] = 112 if fw else max(WIDTH[cls], 72 if c["tram"] else 0)
    c["gap"] = 30 if fw else GAP[min(cls, 3) if c["tram"] else cls]
    mid = c["pts"][len(c["pts"]) // 2]
    if real_r(*mid) < 2500:
        c["gap"] = min(c["gap"], 70)
    if cls <= 3 and not c["hand"] and crosses_river(c["pts"]):
        c["rank"] = min(c["rank"], 1)
        c["gap"] = 16

CHAINS = [c for c in CHAINS if c["rank"] < 5 or c["len"] > 700 or c["tram"]]   # only long side streets stay
CHAINS.sort(key=lambda c: (c["rank"], -c["len"]))
acc, acc_t = Grid(96), Grid(96)    # surface roads and tunnels don't crowd each other out
PIECES = []    # accepted runs: attr, pts [(x,y,key)], w, tram, fw, hand
touch = collections.defaultdict(set)    # node key -> accepted pieces that end there
for c in CHAINS:
    S = c["S"]
    if not S:
        continue
    hw = c["w"] / 2
    # a street is not crowded out by the roads it joins: near its own end junctions, ignore them
    ex = []
    for k, pt in ((c["keys"][0], c["pts"][0]), (c["keys"][-1], c["pts"][-1])):
        if k is not None and touch[k]:
            ex.append((pt, touch[k]))
    ok = []
    for x, y, dx, dy, s in S:
        blocked = False
        R = hw + 56 + c["gap"]
        for (qx, qy, qdx, qdy, qhw, qp) in (acc_t if c["attr"][3] else acc).near(x, y, R):
            d = math.hypot(qx - x, qy - y)
            if d < hw + qhw + c["gap"] and abs(dx * qdx + dy * qdy) > .75:
                lim = hw + qhw + c["gap"] + 30
                if any(qp in ids and math.hypot(x - e[0], y - e[1]) < lim and math.hypot(qx - e[0], qy - e[1]) < lim for e, ids in ex):
                    continue
                blocked = True
                if DEBUG and DEBUG in (c["attr"][0] or "") and not ok.count(False):
                    print("  blocked by", PIECES[qp]["attr"], "d", round(d), "lim", round(hw + qhw + c["gap"]))
                break
        ok.append(not blocked)
    if DEBUG and DEBUG in (c["attr"][0] or ""):
        print("DEBUG", c["attr"], round(c["len"]), "rank", c["rank"], "ok", sum(ok), "/", len(ok), "ends", c["keys"][0] is not None, c["keys"][-1] is not None)
    # runs of unblocked samples
    i = 0
    minrun = 0 if c["attr"][2] else 260
    runs = []
    while i < len(S):
        if not ok[i]:
            i += 1
            continue
        j = i
        while j + 1 < len(S) and ok[j + 1]:
            j += 1
        s0, s1 = S[i][4], S[j][4]
        if i == 0:
            s0 = 0
        if j == len(S) - 1:
            s1 = c["len"]
        if s1 - s0 >= minrun or (i == 0 and j == len(S) - 1) or ((i == 0 or j == len(S) - 1) and s1 - s0 > 60):
            runs.append((s0, s1))
        i = j + 1
    for s0, s1 in runs:
        pts, s = [], 0
        P_ = c["pts"]
        for k in range(len(P_) - 1):
            a, b = P_[k], P_[k + 1]
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            if s0 <= s <= s1:
                pts.append((a[0], a[1], c["keys"][k]))
            for sc in (s0, s1):
                if s < sc < s + L:
                    t = (sc - s) / L
                    pts.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, None))
            s += L
        if s0 <= s <= s1:
            pts.append((P_[-1][0], P_[-1][1], c["keys"][-1]))
        pts.sort(key=lambda q: 0)  # already in order
        if len(pts) < 2:
            continue
        pid = len(PIECES)
        PIECES.append({"attr": c["attr"], "pts": pts, "w": c["w"], "tram": c["tram"], "hand": c["hand"]})
        for q in (pts[0], pts[-1]):
            if q[2] is not None:
                touch[q[2]].add(pid)
        for x, y, dx, dy, s in S:
            if s0 - 1 <= s <= s1 + 1:
                (acc_t if c["attr"][3] else acc).add(x, y, (x, y, dx, dy, hw, pid))
print("accepted pieces", len(PIECES))
_rk = collections.Counter(c["rank"] for c in CHAINS)
_ra = collections.Counter()
for p_ in PIECES:
    _ra[p_["attr"][1]] += 1
print("chains by rank", sorted(_rk.items()), "pieces by class", sorted(_ra.items()))
print("chain len median", sorted(c["len"] for c in CHAINS)[len(CHAINS)//2])

# ------------------------------------------------------------------ junctions: snap loose ends and hand-road crossings onto other roads
_fresh = [0]


def fresh():
    _fresh[0] += 1
    return ("j", _fresh[0])


seg_grid = Grid(128)
for pi, p in enumerate(PIECES):
    for i in range(len(p["pts"]) - 1):
        a, b = p["pts"][i], p["pts"][i + 1]
        seg_grid.add((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (pi, i))
inserts = collections.defaultdict(list)   # piece -> [(seg, t, x, y, key)]


def project(px, py, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L2 = dx * dx + dy * dy or 1e-9
    t = max(0, min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L2))
    x, y = a[0] + dx * t, a[1] + dy * t
    return t, x, y, math.hypot(px - x, py - y)


deg = collections.Counter()
for p in PIECES:
    for q in p["pts"]:
        if q[2] is not None:
            deg[q[2]] += 1
    deg[p["pts"][0][2]] += 1
    deg[p["pts"][-1][2]] += 1

for pi, p in enumerate(PIECES):
    for end in (0, -1):
        q = p["pts"][end]
        if q[2] is not None and deg[q[2]] > 2:
            continue       # already a junction in the OSM data
        nb = p["pts"][1] if end == 0 else p["pts"][-2]
        ex, ey = q[0] - nb[0], q[1] - nb[1]
        el = math.hypot(ex, ey) or 1
        ex, ey = ex / el, ey / el
        best = None
        for oj, si in seg_grid.near(q[0], q[1], 200):
            if oj == pi or PIECES[oj]["attr"][3] != p["attr"][3]:
                continue
            o = PIECES[oj]
            a, b = o["pts"][si], o["pts"][si + 1]
            t, x, y, d = project(q[0], q[1], a, b)
            lim = o["w"] / 2 + p["w"] / 2 + 46
            if d > lim:
                continue
            sx, sy = b[0] - a[0], b[1] - a[1]
            sl = math.hypot(sx, sy) or 1
            if abs(ex * sx / sl + ey * sy / sl) > .8:
                continue      # running alongside, not into it
            ahead = (x - q[0]) * ex + (y - q[1]) * ey
            if ahead < -p["w"]:
                continue
            if best is None or d < best[0]:
                best = (d, oj, si, t, x, y)
        if best:
            d, oj, si, t, x, y = best
            o = PIECES[oj]
            if t < .02 and o["pts"][si][2] is not None:
                k = o["pts"][si][2]
                x, y = o["pts"][si][0], o["pts"][si][1]
            elif t > .98 and o["pts"][si + 1][2] is not None:
                k = o["pts"][si + 1][2]
                x, y = o["pts"][si + 1][0], o["pts"][si + 1][1]
            else:
                k = fresh()
                inserts[oj].append((si, t, x, y, k))
            nq = (x, y, k)
            if end == 0:
                p["pts"][0] = nq if d < 6 else p["pts"][0]
                if d >= 6:
                    p["pts"].insert(0, nq)
            else:
                if d < 6:
                    p["pts"][-1] = nq
                else:
                    p["pts"].append(nq)

# crossings: hand roads meet whatever they cross
def seg_x(a, b, c, d):
    r = (b[0] - a[0], b[1] - a[1])
    s = (d[0] - c[0], d[1] - c[1])
    den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-9:
        return None
    t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den
    u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den
    if 0 < t < 1 and 0 < u < 1:
        return t, u
    return None


seg_grid = Grid(128)
for pi, p in enumerate(PIECES):
    for i in range(len(p["pts"]) - 1):
        a, b = p["pts"][i], p["pts"][i + 1]
        for k in range(3):
            t = k / 2
            seg_grid.add(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (pi, i))
done_x = set()
for pi, p in enumerate(PIECES):
    if not p["hand"]:
        continue
    for i in range(len(p["pts"]) - 1):
        a, b = p["pts"][i], p["pts"][i + 1]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        cand = set()
        for k in range(int(L // 60) + 2):
            t = min(1, k * 60 / max(L, 1))
            cand.update(seg_grid.near(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 130))
        for oj, si in cand:
            if oj == pi or PIECES[oj]["attr"][3] or (min(pi, oj), max(pi, oj), i, si) in done_x:
                continue
            o = PIECES[oj]
            c_, d_ = o["pts"][si], o["pts"][si + 1]
            r = seg_x(a, b, c_, d_)
            if not r:
                continue
            done_x.add((min(pi, oj), max(pi, oj), i, si))
            t, u = r
            x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            k = fresh()
            inserts[pi].append((i, t, x, y, k))
            inserts[oj].append((si, u, x, y, k))

for pi, lst in inserts.items():
    p = PIECES[pi]
    lst.sort(key=lambda q: (q[0], q[1]))
    out = []
    j = 0
    for i, q in enumerate(p["pts"]):
        out.append(q)
        while j < len(lst) and lst[j][0] == i:
            out.append((lst[j][2], lst[j][3], lst[j][4]))
            j += 1
    p["pts"] = out

# ------------------------------------------------------------------ graph: split pieces at shared vertices
cnt = collections.Counter()
for p in PIECES:
    for q in p["pts"]:
        if q[2] is not None:
            cnt[q[2]] += 1
NODES, NIDX = [], {}


def node_for(q):
    k = q[2] if q[2] is not None else ("e", round(q[0]), round(q[1]))
    if k not in NIDX:
        NIDX[k] = len(NODES)
        NODES.append([q[0], q[1]])
    return NIDX[k]


EDGES = []   # [a, b, attr, w, tram, pts]
for p in PIECES:
    pts = p["pts"]
    start = 0
    for i in range(1, len(pts)):
        last = i == len(pts) - 1
        if last or (pts[i][2] is not None and cnt[pts[i][2]] > 1):
            seg = pts[start:i + 1]
            if plen(seg) > 2:
                EDGES.append([node_for(seg[0]), node_for(seg[-1]), p["attr"], p["w"], p["tram"], [(q[0], q[1]) for q in seg]])
            start = i

# merge near-coincident nodes (snapping can leave two nodes a few px apart)
ng = Grid(16)
remap = {}
for i, (x, y) in enumerate(NODES):
    hit = None
    for j in ng.near(x, y, 5):
        if math.hypot(NODES[j][0] - x, NODES[j][1] - y) < 4:
            hit = j
            break
    if hit is None:
        ng.add(x, y, i)
        remap[i] = i
    else:
        remap[i] = hit
for e in EDGES:
    e[0], e[1] = remap[e[0]], remap[e[1]]
EDGES = [e for e in EDGES if not (e[0] == e[1] and plen(e[5]) < 30)]

# prune short dead-end stubs, and small islands
for _ in range(12):
    d = collections.Counter()
    for e in EDGES:
        d[e[0]] += 1
        d[e[1]] += 1
    EDGES = [e for e in EDGES if e[2][2] or not ((d[e[0]] == 1 or d[e[1]] == 1) and plen(e[5]) < 1300)]   # dead ends and offshoots go
par = list(range(len(NODES)))


def find(i):
    while par[i] != i:
        par[i] = par[par[i]]
        i = par[i]
    return i


for e in EDGES:
    par[find(e[0])] = find(e[1])
comp_len = collections.Counter()
for e in EDGES:
    comp_len[find(e[0])] += plen(e[5])
big = max(comp_len.values())
EDGES = [e for e in EDGES if comp_len[find(e[0])] > 2500 or e[2][2]]
# join edges back together through nodes where nothing else meets (left behind where a side street was dropped)
while True:
    inc = collections.defaultdict(list)
    for i, e in enumerate(EDGES):
        inc[e[0]].append(i)
        if e[1] != e[0]:
            inc[e[1]].append(i)
    gone, merged = set(), 0
    for n, lst in inc.items():
        if len(lst) != 2 or lst[0] in gone or lst[1] in gone:
            continue
        i, j = lst
        A, B = EDGES[i], EDGES[j]
        if i == j or A[0] == A[1] or B[0] == B[1] or (A[2], A[3], A[4]) != (B[2], B[3], B[4]):
            continue
        pa = A[5] if A[1] == n else A[5][::-1]
        pb = B[5] if B[0] == n else B[5][::-1]
        a0 = A[0] if A[1] == n else A[1]
        b1 = B[1] if B[0] == n else B[0]
        EDGES[i] = [a0, b1, A[2], A[3], A[4], pa + pb[1:]]
        gone.add(j)
        merged += 1
    EDGES = [e for k, e in enumerate(EDGES) if k not in gone]
    if not merged:
        break
# a tunnel must come out somewhere: join any loose tunnel end to the nearest surface freeway with a short ramp
deg = collections.Counter()
for e in EDGES:
    deg[e[0]] += 1
    deg[e[1]] += 1
for e in [e for e in EDGES if e[2][3]]:
    for end in (0, 1):
        n = e[end]
        if deg[n] != 1:
            continue
        x, y = NODES[n]
        best = None
        for o in EDGES:
            if o[2][3] or not o[2][2]:
                continue
            for m in (o[0], o[1]):
                d = math.hypot(NODES[m][0] - x, NODES[m][1] - y)
                if d < 700 and (best is None or d < best[0]):
                    best = (d, m)
        if best:
            m = best[1]
            EDGES.append([n, m, e[2][:3] + (False,), e[3], False, [(x, y), tuple(NODES[m])]])
            deg[n] += 1
            deg[m] += 1
            print("tunnel ramp", e[2][0], round(best[0]))
        else:
            e.append("dead")     # a leftover stub of a twin tunnel: drop it
EDGES = [e for e in EDGES if e[-1] != "dead"]
if False:
    pass
used = sorted({e[0] for e in EDGES} | {e[1] for e in EDGES})
nmap = {o: i for i, o in enumerate(used)}
NODES = [NODES[o] for o in used]
for e in EDGES:
    e[0], e[1] = nmap[e[0]], nmap[e[1]]
    e[5] = rdp(e[5], 1.2)
    e[5][0] = tuple(NODES[e[0]])
    e[5][-1] = tuple(NODES[e[1]])
print("graph", len(NODES), "nodes", len(EDGES), "edges", "main component", round(big))

# ------------------------------------------------------------------ tram routes: chains of tram edges
tadj = collections.defaultdict(list)
for i, e in enumerate(EDGES):
    if e[4]:
        tadj[e[0]].append(i)
        tadj[e[1]].append(i)


def edge_dir(i, at_node, leaving):
    e = EDGES[i]
    pts = e[5] if e[0] == at_node else e[5][::-1]
    a, b = pts[0], pts[1]
    if not leaving:
        a, b = pts[1], pts[0]
    L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
    return (b[0] - a[0]) / L, (b[1] - a[1]) / L


used_t = set()
ROUTES = []
termini = [n for n, l in tadj.items() if len(l) == 1] + [n for n, l in tadj.items() if len(l) > 2]
for n0 in termini:
    for e0 in tadj[n0]:
        if e0 in used_t:
            continue
        route, n, e = [], n0, e0
        while e is not None and e not in used_t and len(route) < 400:
            used_t.add(e)
            E = EDGES[e]
            fwd = E[0] == n
            route.append(e * 2 + (0 if fwd else 1))
            n = E[1] if fwd else E[0]
            din = edge_dir(e, n, False)
            best, bd = None, .35
            for f in tadj[n]:
                if f == e or f in used_t:
                    continue
                dout = edge_dir(f, n, True)
                dot = din[0] * dout[0] + din[1] * dout[1]
                if dot > bd:
                    best, bd = f, dot
            e = best
        L = sum(plen(EDGES[r // 2][5]) for r in route)
        if L > 1800:
            ROUTES.append((L, route))
ROUTES.sort(key=lambda r: -r[0])
ROUTES = [r for _, r in ROUTES[:16]]
print("tram routes", len(ROUTES))

# ------------------------------------------------------------------ water, coast, parks, rails, labels
coast = []
for pg in PAGES:
    for w in pg["waters"]:
        if (w.get("tags") or {}).get("natural") == "coastline":
            for ls in w["g"]:
                coast.append([tuple(q) for q in ls])
# chain the coastline pieces west to east
coast.sort(key=lambda ls: ls[0][0])
chain = coast.pop(0)
while coast:
    end = chain[-1]
    bi, bd, rev = None, 1e9, False
    for i, ls in enumerate(coast):
        for r, q in ((False, ls[0]), (True, ls[-1])):
            d = math.hypot(q[0] - end[0], q[1] - end[1])
            if d < bd:
                bi, bd, rev = i, d, r
    if bd > 0.01:
        break
    ls = coast.pop(bi)
    chain += (ls[::-1] if rev else ls)[1:]
sea_ll = [(144.79, -37.886), (144.80, -37.880)] + chain + [(144.992, -37.930), (145.002, -37.948), (145.012, -37.963), (145.022, -37.976),
                                                            (145.034, -37.990), (145.040, -38.0), (144.79, -38.0)]
SEA = rdp([P(lo, la) for lo, la in sea_ll], 1.5)

WATER, LAKES = [], {}
for pg in PAGES:
    for w in pg["waterAreas"]:
        if w.get("t") != "water":
            continue
        for ring in w["g"]:
            pts = [P(lo, la) for lo, la in ring if in_bounds(lo, la)]
            if len(pts) < 4:
                continue
            a = area(pts)
            if a < 900:
                continue
            pts = rdp_ring(pts, 1.5)
            WATER.append(pts)
            if w.get("n"):
                LAKES.setdefault(w["n"], []).append(pts)
RIVERS = []
for pg in PAGES:
    for w in pg["waters"]:
        tags = w.get("tags") or {}
        if w.get("t") in ("river", "canal") and not tags.get("tunnel"):
            for ls in w["g"]:
                pts = [P(lo, la) for lo, la in ls if in_bounds(lo, la)]
                if len(pts) >= 2:
                    RIVERS.append(rdp(pts, 1.5))

PARK_KEEP = {"park": 2500, "garden": 9000, "wood": 6000, "forest": 6000, "recreation_ground": 4000, "meadow": 9000,
             "nature_reserve": 4000, "golf_course": 4000, "grass": 14000, "scrub": 9000}
PARKS = []
for pg in PAGES:
    for k in pg["parks"]:
        t = k.get("t")
        if t not in PARK_KEEP:
            continue
        for ring in k["g"]:
            pts = [P(lo, la) for lo, la in ring if in_bounds(lo, la)]
            if len(pts) < 4 or area(pts) < PARK_KEEP[t]:
                continue
            PARKS.append([t, k.get("n") or "", rdp_ring(pts, 2.5)])

RAILS = []
for L in RAIL_LINES:
    pts = rdp(L, 1.5)
    if plen(pts) > 30:
        RAILS.append(pts)

LABELS = {}
for pg in PAGES:
    for l in pg["labels"]:
        if l["kind"] == "locality" and in_bounds(l["lon"], l["lat"]):
            LABELS[l["text"]] = P(l["lon"], l["lat"])
for n, lo, la in [("Glen Waverley", 145.164, -37.878), ("Mount Waverley", 145.128, -37.881), ("Wheelers Hill", 145.188, -37.905),
                  ("Mulgrave", 145.17, -37.928), ("Rowville", 145.235, -37.927), ("Dandenong", 145.215, -37.987),
                  ("Noble Park", 145.175, -37.966), ("Springvale", 145.152, -37.949), ("Clayton", 145.12, -37.925),
                  ("Oakleigh", 145.09, -37.90), ("Chadstone", 145.095, -37.886), ("Bentleigh", 145.035, -37.918),
                  ("Moorabbin", 145.06, -37.94), ("Cheltenham", 145.05, -37.962), ("Keysborough", 145.17, -37.99),
                  ("Scoresby", 145.235, -37.900), ("Dandenong North", 145.21, -37.958), ("Highett", 145.04, -37.948),
                  ("Huntingdale", 145.105, -37.91), ("Notting Hill", 145.14, -37.905), ("Ferntree Gully", 145.29, -37.885)]:
    LABELS.setdefault(n, P(lo, la))

# ------------------------------------------------------------------ write
names = sorted({e[2][0] for e in EDGES})
nid = {n: i for i, n in enumerate(names)}
out = {
    "v": 1, "w": WPX, "h": HPX,
    "proj": {"lon0": LON0, "lat0": LAT0, "kx": KX, "ky": KY, "r0": R0M, "rr": RR, "ox": OX, "oy": OY},
    "names": names,
    "nodes": flat(NODES),
    "edges": [[e[0], e[1], e[2][1], nid[e[2][0]], (1 if e[2][2] else 0) | (2 if e[4] else 0) | (4 if e[2][3] else 0), e[3], flat(e[5])] for e in EDGES],
    "trams": ROUTES,
    "rails": [flat(r) for r in RAILS],
    "sea": flat(SEA),
    "water": [flat(w) for w in WATER],
    "rivers": [flat(r) for r in RIVERS],
    "lakes": {k: [flat(p) for p in v] for k, v in LAKES.items() if k in ("Albert Park Lake",)},
    "parks": [[t, n, flat(p)] for t, n, p in PARKS],
    "labels": [[n, round(x), round(y)] for n, (x, y) in sorted(LABELS.items())],
}
js = "// Map of Melbourne built by tools/build_map.py from OpenStreetMap data (c) OpenStreetMap contributors, ODbL.\n"
js += "window.MELB_MAP=" + json.dumps(out, separators=(",", ":")) + ";\n"
open(OUT, "w").write(js)
print("wrote", OUT, len(js) // 1024, "KB")
