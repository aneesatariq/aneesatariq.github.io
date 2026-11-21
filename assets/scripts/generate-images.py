"""Regenerate portrait derivatives and PNG icons; never overwrite source artwork.

Requires Python 3 and Pillow with JPEG/WebP support. The original SVG is the
monogram source; this renderer intentionally supports only its basic shapes.
Pillow 13.0.0 on Python 3.14.5 produced the initial assets. Encoder library
versions can affect compressed bytes without changing the output dimensions.
"""

import argparse
from io import BytesIO
from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image, ImageCms, ImageDraw, ImageFilter, ImageOps, features


ROOT = Path(__file__).resolve().parents[2]
COVERS = ROOT / "assets" / "image" / "covers"
ICONS = ROOT / "assets" / "image" / "icons"
WIDTHS = (480, 800, 1200)
MAX_BYTES = 200_000
SUPERSAMPLING = 4

# Fixed 4:5 crops retain the face in both portraits and the visible about hand.
# The hero original does not contain a visible hand. Its height is retained
# apart from four bottom pixels; redundant left-side background is removed.
PORTRAITS = {
    "hero": {"size": (2673, 2854), "box": (393, 0, 2673, 2850)},
    "about": {"size": (3285, 4615), "box": (0, 180, 3280, 4280)},
}


def encode_portrait(image, image_format):
    """Choose the highest quality within the bounded published-image budget."""
    start_quality = 86 if image_format == "JPEG" else 84
    # Only a grain-heavy JPEG that cannot meet the budget gets subpixel
    # smoothing; the WebP and all other derivatives retain their full detail.
    radii = (0, 0.35, 0.5) if image_format == "JPEG" else (0,)
    for radius in radii:
        candidate = image.filter(ImageFilter.GaussianBlur(radius)) if radius else image
        for quality in range(start_quality, 63, -2):
            output = BytesIO()
            options = {"quality": quality}
            if image_format == "JPEG":
                options.update(optimize=True, progressive=True, subsampling=2)
            else:
                options.update(method=6)
            candidate.save(output, format=image_format, **options)
            data = output.getvalue()
            if len(data) <= MAX_BYTES:
                return data, quality, radius
    raise ValueError(
        f"{image_format} at {image.size} needs {len(data):,} bytes at quality 64; "
        f"the limit is {MAX_BYTES:,}. Review the source composition."
    )


def generate_portraits():
    if not features.check("webp") or not features.check("jpg"):
        raise RuntimeError("Pillow must include both WebP and JPEG encoders.")
    outputs = []
    for name, composition in PORTRAITS.items():
        source_path = COVERS / f"{name}.png"
        with Image.open(source_path) as original:
            oriented = ImageOps.exif_transpose(original)
            if oriented.size != composition["size"]:
                raise ValueError(
                    f"{source_path.name} has changed dimensions: {oriented.size}. "
                    "Review its face/hand composition and update the explicit crop."
                )
            source = oriented.convert("RGB")
            profile = oriented.info.get("icc_profile")
            if profile:
                source = ImageCms.profileToProfile(
                    source,
                    ImageCms.ImageCmsProfile(BytesIO(profile)),
                    ImageCms.createProfile("sRGB"),
                    outputMode="RGB",
                )
            # Clearing metadata keeps derivatives small and excludes source EXIF.
            source.info.clear()
            crop = source.crop(composition["box"])
            print(
                f"SOURCE {source_path.relative_to(ROOT).as_posix()} "
                f"{oriented.width}x{oriented.height} {source_path.stat().st_size} bytes "
                f"crop={composition['box']}"
            )
            for width in WIDTHS:
                height = width * 5 // 4
                resized = crop.resize((width, height), Image.Resampling.LANCZOS)
                for extension, image_format in (("webp", "WEBP"), ("jpg", "JPEG")):
                    data, quality, smoothing = encode_portrait(resized, image_format)
                    path = COVERS / f"{name}-{width}.{extension}"
                    outputs.append((path, data, width, height, quality, smoothing))
    # Encoding finishes before any published derivative is overwritten.
    for path, data, width, height, quality, smoothing in outputs:
        path.write_bytes(data)
        print(
            f"OUTPUT {path.relative_to(ROOT).as_posix()} "
            f"{width}x{height} {len(data)} bytes quality={quality} smoothing={smoothing}px"
        )


def color(value):
    return None if value in (None, "none") else value


def render_monogram(svg_root, size, purpose):
    canvas_size = size * SUPERSAMPLING
    factor = canvas_size / 512
    navy = svg_root.find("{http://www.w3.org/2000/svg}rect").attrib["fill"]
    transparent = purpose == "any"
    image = Image.new(
        "RGBA" if transparent else "RGB",
        (canvas_size, canvas_size),
        (0, 0, 0, 0) if transparent else navy,
    )
    draw = ImageDraw.Draw(image)
    # With a 0.86 scale, all essential artwork fits well within the maskable
    # safe circle (radius 204.8 at 512px). The full background remains opaque.
    inset_scale = 0.86 if purpose == "maskable" else 1
    for element in svg_root:
        tag = element.tag.rsplit("}", 1)[-1]
        attributes = element.attrib
        if tag == "title":
            continue
        if tag == "rect":
            if purpose == "maskable":
                continue
            x, y = float(attributes["x"]), float(attributes["y"])
            width, height = float(attributes["width"]), float(attributes["height"])
            box = (x * factor, y * factor, (x + width) * factor, (y + height) * factor)
            draw.rounded_rectangle(
                box,
                radius=float(attributes.get("rx", 0)) * factor,
                fill=color(attributes.get("fill")),
                outline=color(attributes.get("stroke")),
                width=max(1, round(float(attributes.get("stroke-width", 1)) * factor)),
            )
        elif tag == "polygon":
            coordinates = []
            for pair in attributes["points"].split():
                x, y = (float(value) for value in pair.split(","))
                coordinates.append(
                    (
                        (256 + (x - 256) * inset_scale) * factor,
                        (256 + (y - 256) * inset_scale) * factor,
                    )
                )
            draw.polygon(coordinates, fill=attributes["fill"])
        else:
            raise ValueError(f"Unsupported SVG primitive: {tag}. Extend the renderer first.")
    return image.resize((size, size), Image.Resampling.LANCZOS)


def generate_icons():
    source_path = ICONS / "favicon.svg"
    with source_path.open("rb") as source:
        svg_bytes = source.read(65_537)
    if len(svg_bytes) > 65_536:
        raise ValueError("The simple monogram source must stay below 64 KiB.")
    svg_text = svg_bytes.decode("utf-8")
    # Reject DTD/entity declarations before parsing this bounded UTF-8 source.
    # The maintenance renderer needs no external references or custom entities.
    if "<!DOCTYPE" in svg_text.upper() or "<!ENTITY" in svg_text.upper():
        raise ValueError("DTD and entity declarations are not allowed in the monogram.")
    svg_root = ET.fromstring(svg_text)
    if svg_root.attrib.get("viewBox") != "0 0 512 512":
        raise ValueError("The monogram renderer requires a 512-unit square viewBox.")
    print(f"SOURCE {source_path.relative_to(ROOT).as_posix()} 512x512 {source_path.stat().st_size} bytes")
    variants = (
        ("icon-192.png", 192, "any"),
        ("icon-512.png", 512, "any"),
        ("imsk-512.png", 512, "maskable"),
        ("apple-touch-icon.png", 180, "apple"),
    )
    outputs = []
    for filename, size, purpose in variants:
        image = render_monogram(svg_root, size, purpose)
        output = BytesIO()
        image.save(output, format="PNG", optimize=True)
        outputs.append((ICONS / filename, output.getvalue(), size, purpose))
    for path, data, size, purpose in outputs:
        path.write_bytes(data)
        print(
            f"OUTPUT {path.relative_to(ROOT).as_posix()} "
            f"{size}x{size} {len(data)} bytes purpose={purpose}"
        )


def main():
    parser = argparse.ArgumentParser(
        description="Regenerate bounded 4:5 portrait derivatives and original AT PNG icons."
    )
    parser.add_argument(
        "--only",
        choices=("all", "portraits", "icons"),
        default="all",
        help="select asset family (default: all); originals and SVG are never overwritten",
    )
    args = parser.parse_args()
    if args.only in ("all", "portraits"):
        generate_portraits()
    if args.only in ("all", "icons"):
        generate_icons()


if __name__ == "__main__":
    main()
