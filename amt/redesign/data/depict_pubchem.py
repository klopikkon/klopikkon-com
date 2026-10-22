"""Draw a small SVG from a PubChem 2D compound record.

PUG REST does not serve SVG. The drawing uses the record's 2D coordinates,
bond orders and draw annotations (`record_type=2d`). Carbon-bound hydrogens
are left implicit. The file is a standalone SVG, so a page can lazy-load it.
"""

from __future__ import annotations

import math

SYMBOL = {
    1: "H", 3: "Li", 5: "B", 6: "C", 7: "N", 8: "O", 9: "F", 11: "Na",
    12: "Mg", 14: "Si", 15: "P", 16: "S", 17: "Cl", 19: "K", 20: "Ca",
    35: "Br", 53: "I", 34: "Se", 50: "Sn",
}

# PC-BondAnnotation values we draw. Others fall through to the bond order.
WEDGE_UP = 5
WEDGE_DOWN = 6
WAVY = 3
ARROW = 7
DASHED = 2
DOTTED = 4
AROMATIC = 8
RESONANCE = 9
BOLD = 10
CROSSED = 1

SCALE = 28.0
PAD = 26.0
FONT = 13.0


def trim_record(payload: dict) -> dict:
    """Keep the 2D depiction fields from a PUG REST compound record."""
    compounds = payload.get("PC_Compounds") or []
    if not compounds:
        return {"ok": False}
    compound = compounds[0]
    atoms = compound.get("atoms") or {}
    bonds = compound.get("bonds") or {}
    coords = compound.get("coords") or []
    if not atoms.get("aid") or not coords or not coords[0].get("conformers"):
        return {"ok": False}
    conformer = coords[0]["conformers"][0]
    if "x" not in conformer or "y" not in conformer:
        return {"ok": False}
    charges = {row["aid"]: int(row["value"]) for row in atoms.get("charge") or []}
    isotopes = {row["aid"]: int(row["value"]) for row in atoms.get("isotope") or []}
    radicals = {row["aid"]: int(row["type"]) for row in atoms.get("radical") or []}
    xy = {}
    for aid, x, y in zip(coords[0]["aid"], conformer["x"], conformer["y"]):
        xy[int(aid)] = [float(x), float(y)]
    styles = []
    style = conformer.get("style") or {}
    for annotation, aid1, aid2 in zip(
        style.get("annotation") or [],
        style.get("aid1") or [],
        style.get("aid2") or [],
    ):
        styles.append({"annotation": int(annotation), "aid1": int(aid1), "aid2": int(aid2)})
    atom_rows = []
    for aid, element in zip(atoms["aid"], atoms["element"]):
        aid = int(aid)
        atom_rows.append(
            {
                "aid": aid,
                "el": int(element),
                "charge": charges.get(aid, 0),
                "isotope": isotopes.get(aid),
                "radical": radicals.get(aid),
            }
        )
    bond_rows = []
    for aid1, aid2, order in zip(bonds.get("aid1") or [], bonds.get("aid2") or [], bonds.get("order") or []):
        bond_rows.append({"aid1": int(aid1), "aid2": int(aid2), "order": int(order)})
    return {"ok": True, "atoms": atom_rows, "bonds": bond_rows, "xy": {str(k): v for k, v in xy.items()}, "styles": styles}


def _charge(value: int) -> str:
    if value == 0:
        return ""
    sign = "+" if value > 0 else "-"
    magnitude = abs(value)
    return sign if magnitude == 1 else f"{magnitude}{sign}"


def _label(atom: dict, hydrogens: int, left: bool) -> str | None:
    element = atom["el"]
    symbol = SYMBOL.get(element)
    if symbol is None:
        symbol = f"E{element}"
    special = atom["charge"] or atom["isotope"] or atom["radical"]
    if element == 6 and not special:
        return None
    if element == 1 and not special and hydrogens == 0:
        return "H"
    body = symbol
    if hydrogens == 1:
        body = f"H{symbol}" if left else f"{symbol}H"
    elif hydrogens > 1:
        body = f"H{hydrogens}{symbol}" if left else f"{symbol}H{hydrogens}"
    if atom["isotope"]:
        body = f"{atom['isotope']}{body}"
    body += _charge(atom["charge"])
    if atom["radical"]:
        body += "*"
    return body


def _prepare(trimmed: dict) -> tuple[dict, list] | None:
    if not trimmed.get("ok"):
        return None
    atoms = {row["aid"]: dict(row) for row in trimmed["atoms"]}
    xy = {int(key): tuple(value) for key, value in trimmed["xy"].items()}
    if not atoms or not xy:
        return None
    neighbors: dict[int, list[int]] = {aid: [] for aid in atoms}
    raw_bonds = []
    for bond in trimmed["bonds"]:
        aid1, aid2 = bond["aid1"], bond["aid2"]
        if aid1 not in atoms or aid2 not in atoms or aid1 not in xy or aid2 not in xy:
            continue
        neighbors[aid1].append(aid2)
        neighbors[aid2].append(aid1)
        raw_bonds.append(bond)
    styles: dict[tuple[int, int], set[int]] = {}
    for style in trimmed.get("styles") or []:
        styles.setdefault((style["aid1"], style["aid2"]), set()).add(style["annotation"])

    drop = set()
    hydrogens = {aid: 0 for aid in atoms}
    for aid, atom in atoms.items():
        if atom["el"] != 1 or atom["charge"] or atom["isotope"] or atom["radical"]:
            continue
        bonded = neighbors[aid]
        if len(bonded) != 1:
            continue
        parent = bonded[0]
        drop.add(aid)
        if atoms[parent]["el"] != 6:
            hydrogens[parent] += 1
        elif atoms[parent]["charge"] or atoms[parent]["isotope"] or atoms[parent]["radical"]:
            hydrogens[parent] += 1

    kept = [aid for aid in atoms if aid not in drop and aid in xy]
    if not kept:
        return None

    def heavy_neighbors(aid: int) -> list[int]:
        return [other for other in neighbors[aid] if other not in drop]

    for aid in kept:
        others = heavy_neighbors(aid)
        if others:
            mean_x = sum(xy[other][0] for other in others) / len(others)
            left = xy[aid][0] < mean_x - 0.05
        else:
            left = False
        atoms[aid]["label"] = _label(atoms[aid], hydrogens[aid], left)
        atoms[aid]["heavy"] = others

    drawn = []
    for bond in raw_bonds:
        aid1, aid2 = bond["aid1"], bond["aid2"]
        if aid1 in drop or aid2 in drop:
            continue
        annotation = set(styles.get((aid1, aid2), ()))
        annotation |= set(styles.get((aid2, aid1), ()))
        # Wedge direction follows the annotated atom order.
        wedge = None
        for source, target, kind in (
            (aid1, aid2, WEDGE_UP),
            (aid2, aid1, WEDGE_UP),
            (aid1, aid2, WEDGE_DOWN),
            (aid2, aid1, WEDGE_DOWN),
        ):
            if kind in styles.get((source, target), ()):
                wedge = (kind, source, target)
                break
        drawn.append(
            {
                "aid1": aid1,
                "aid2": aid2,
                "order": bond["order"],
                "annotation": annotation,
                "wedge": wedge,
            }
        )
    return atoms, drawn


def _screen(xy: dict[int, tuple[float, float]], aids: list[int]) -> tuple[dict[int, tuple[float, float]], float, float]:
    xs = [xy[aid][0] for aid in aids]
    ys = [-xy[aid][1] for aid in aids]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    if max_x - min_x < 0.4:
        max_x = min_x + 0.4
    if max_y - min_y < 0.4:
        max_y = min_y + 0.4
    points = {}
    for aid in aids:
        x, y = xy[aid]
        points[aid] = (PAD + (x - min_x) * SCALE, PAD + (-y - min_y) * SCALE)
    width = PAD * 2 + (max_x - min_x) * SCALE
    height = PAD * 2 + (max_y - min_y) * SCALE
    return points, width, height


def _fmt(pair: tuple[float, float]) -> str:
    return f"{pair[0]:.1f},{pair[1]:.1f}"


def _shorten(start, end, pad_start: float, pad_end: float):
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dy) or 1.0
    if pad_start + pad_end > length * 0.62:
        scale = (length * 0.62) / (pad_start + pad_end or 1.0)
        pad_start *= scale
        pad_end *= scale
    ux, uy = dx / length, dy / length
    return (start[0] + ux * pad_start, start[1] + uy * pad_start), (
        end[0] - ux * pad_end,
        end[1] - uy * pad_end,
    )


def _pad(atom: dict) -> float:
    label = atom.get("label")
    if not label:
        return 0.0
    return min(16.0, 5.0 + 3.6 * len(label))


def _offset(start, end, distance: float):
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dy) or 1.0
    ox, oy = -dy / length * distance, dx / length * distance
    return (start[0] + ox, start[1] + oy), (end[0] + ox, end[1] + oy)


def _toward_center(start, end, center, distance: float):
    mid = ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)
    dx, dy = center[0] - mid[0], center[1] - mid[1]
    length = math.hypot(dx, dy) or 1.0
    ox, oy = dx / length * distance, dy / length * distance
    return (start[0] + ox, start[1] + oy), (end[0] + ox, end[1] + oy)


def _segment(start, end) -> str:
    return f"M{_fmt(start)}L{_fmt(end)}"


def _wedge(start, end, width: float) -> str:
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dy) or 1.0
    ox, oy = -dy / length * width / 2, dx / length * width / 2
    left = (end[0] + ox, end[1] + oy)
    right = (end[0] - ox, end[1] - oy)
    return f"M{_fmt(start)}L{_fmt(left)}L{_fmt(right)}Z"


def _hash_wedge(start, end, width: float) -> str:
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dy) or 1.0
    ux, uy = dx / length, dy / length
    ox, oy = -uy, ux
    parts = []
    count = 7
    for index in range(1, count + 1):
        tick = index / (count + 0.4)
        half = width * tick / 2
        cx, cy = start[0] + ux * length * tick, start[1] + uy * length * tick
        parts.append(_segment((cx + ox * half, cy + oy * half), (cx - ox * half, cy - oy * half)))
    return "".join(parts)


def _wavy(start, end) -> str:
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dy) or 1.0
    ux, uy = dx / length, dy / length
    ox, oy = -uy, ux
    waves = max(3, int(length / 8))
    steps = waves * 8
    points = []
    for index in range(steps + 1):
        tick = index / steps
        amp = math.sin(tick * waves * math.pi * 2) * 2.1
        points.append((start[0] + ux * length * tick + ox * amp, start[1] + uy * length * tick + oy * amp))
    return "M" + "L".join(_fmt(point) for point in points)


def to_svg(trimmed: dict) -> str | None:
    prepared = _prepare(trimmed)
    if prepared is None:
        return None
    atoms, bonds = prepared
    xy = {int(key): tuple(value) for key, value in trimmed["xy"].items()}
    aids = [aid for aid, atom in atoms.items() if "label" in atom]
    points, width, height = _screen(xy, aids)

    aromatic_ids = []
    for bond in bonds:
        if AROMATIC in bond["annotation"] or RESONANCE in bond["annotation"]:
            aromatic_ids.extend((bond["aid1"], bond["aid2"]))
    if aromatic_ids:
        center = (
            sum(points[aid][0] for aid in aromatic_ids) / len(aromatic_ids),
            sum(points[aid][1] for aid in aromatic_ids) / len(aromatic_ids),
        )
    else:
        center = None

    plain = []
    dashed = []
    filled = []
    hashes = []
    for bond in bonds:
        aid1, aid2 = bond["aid1"], bond["aid2"]
        start, end = _shorten(points[aid1], points[aid2], _pad(atoms[aid1]), _pad(atoms[aid2]))
        annotation = bond["annotation"]
        wedge = bond["wedge"]
        if wedge:
            kind, source, target = wedge
            if source == aid2:
                start, end = end, start
            if kind == WEDGE_UP:
                filled.append(_wedge(start, end, 7.0))
            else:
                hashes.append(_hash_wedge(start, end, 7.0))
            continue
        if WAVY in annotation:
            plain.append(_wavy(start, end))
            continue
        if DASHED in annotation:
            dashed.append(_segment(start, end))
            continue
        if DOTTED in annotation:
            dashed.append(_segment(start, end))
            continue
        width_boost = BOLD in annotation
        aromatic = AROMATIC in annotation or RESONANCE in annotation
        order = 1 if aromatic else max(1, bond["order"])
        plain.append(_segment(start, end))
        if order >= 2 or aromatic:
            if center and aromatic:
                left, right = _toward_center(start, end, center, 3.2)
            else:
                left, right = _offset(start, end, 3.2)
            target = dashed if aromatic else plain
            target.append(_segment(left, right))
        if order >= 3:
            left, right = _offset(start, end, -3.2)
            plain.append(_segment(left, right))
        if width_boost:
            plain.append(_segment(start, end))
        if ARROW in annotation:
            filled.append(_wedge(start, end, 6.0))

    text = []
    for aid in aids:
        label = atoms[aid].get("label")
        if not label:
            continue
        x, y = points[aid]
        text.append(f'<text x="{x:.1f}" y="{y:.1f}">{_escape(label)}</text>')

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.1f} {height:.1f}" width="{width:.0f}" height="{height:.0f}">',
        f'<rect width="100%" height="100%" fill="#fff"/>',
        '<g fill="none" stroke="#161616" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">',
    ]
    if plain:
        parts.append(f'<path d="{"".join(plain)}"/>')
    if dashed:
        parts.append(f'<path d="{"".join(dashed)}" stroke-dasharray="2.2 2.2"/>')
    if hashes:
        parts.append(f'<path d="{"".join(hashes)}" stroke-width="1.3"/>')
    parts.append("</g>")
    if filled:
        parts.append(f'<g fill="#161616" stroke="none"><path d="{"".join(filled)}"/></g>')
    if text:
        parts.append(
            f'<g font-family="sans-serif" font-size="{FONT:.0f}" text-anchor="middle" dominant-baseline="central" fill="#161616">'
            + "".join(text)
            + "</g>"
        )
    parts.append("</svg>")
    svg = "".join(parts)
    if len(svg) < 80 or "<svg" not in svg:
        return None
    return svg


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
