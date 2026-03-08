import math
from typing import List, Optional
from PIL import Image


def stitch_images(
    image_paths: List[str],
    direction: str = "horizontal",
    cols: Optional[int] = None,
    rows: Optional[int] = None,
    row_gap: int = 10,
    col_gap: int = 10,
    bg_color: str = "#FFFFFF",
    output_path: str = "output.jpg",
    fmt: str = "JPEG",
    quality: int = 90,
    preview_max: int = 0,
) -> str:
    """
    Stitch images together in a grid layout.
    direction: 'horizontal' (fix cols) or 'vertical' (fix rows)
    preview_max: if >0, scale final image to fit within this pixel dimension
    """
    if not image_paths:
        raise ValueError("No images provided")

    images = [Image.open(p).convert("RGB") for p in image_paths]
    n = len(images)

    # Determine grid size
    if direction == "horizontal":
        num_cols = cols if cols else math.ceil(math.sqrt(n))
        num_rows = math.ceil(n / num_cols)
    else:
        num_rows = rows if rows else math.ceil(math.sqrt(n))
        num_cols = math.ceil(n / num_rows)

    # Normalize image sizes
    if direction == "horizontal":
        target_h = min(img.height for img in images)
        resized = []
        for img in images:
            if img.height != target_h:
                ratio = target_h / img.height
                new_w = int(img.width * ratio)
                img = img.resize((new_w, target_h), Image.LANCZOS)
            resized.append(img)
    else:
        target_w = min(img.width for img in images)
        resized = []
        for img in images:
            if img.width != target_w:
                ratio = target_w / img.width
                new_h = int(img.height * ratio)
                img = img.resize((target_w, new_h), Image.LANCZOS)
            resized.append(img)

    # Build grid: calculate cell dimensions per row/col
    # Group images into rows
    grid = []
    for r in range(num_rows):
        row_imgs = resized[r * num_cols: (r + 1) * num_cols]
        grid.append(row_imgs)

    # Compute canvas size
    row_heights = []
    for row_imgs in grid:
        if row_imgs:
            row_heights.append(max(img.height for img in row_imgs))
        else:
            row_heights.append(0)

    col_widths = []
    for c in range(num_cols):
        col_imgs = [grid[r][c] for r in range(num_rows) if c < len(grid[r])]
        if col_imgs:
            col_widths.append(max(img.width for img in col_imgs))
        else:
            col_widths.append(0)

    total_w = sum(col_widths) + col_gap * (num_cols - 1)
    total_h = sum(row_heights) + row_gap * (num_rows - 1)

    # Parse bg color
    bg = _parse_color(bg_color)
    canvas = Image.new("RGB", (total_w, total_h), bg)

    # Paste images
    y = 0
    for r, row_imgs in enumerate(grid):
        x = 0
        for c, img in enumerate(row_imgs):
            canvas.paste(img, (x, y))
            x += col_widths[c] + col_gap
        y += row_heights[r] + row_gap

    # Scale for preview if needed
    if preview_max > 0:
        ratio = min(preview_max / canvas.width, preview_max / canvas.height)
        if ratio < 1:
            new_w = int(canvas.width * ratio)
            new_h = int(canvas.height * ratio)
            canvas = canvas.resize((new_w, new_h), Image.LANCZOS)

    save_kwargs = {}
    if fmt == "JPEG":
        save_kwargs["quality"] = quality
        save_kwargs["optimize"] = True

    canvas.save(output_path, fmt, **save_kwargs)
    return output_path


def _parse_color(color_str: str):
    color_str = color_str.strip()
    if color_str.startswith("#"):
        h = color_str[1:]
        if len(h) == 6:
            return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
    return (255, 255, 255)
