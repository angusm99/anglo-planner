"""Display original cutting-list pages without saving anything on the tablet."""
import base64
import json
import sys
import fitz

with fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf") as pdf:
    if not 0 < len(pdf) <= 30:
        raise ValueError("Expected 1 to 30 pages")
    pages = []
    for page in pdf:
        scale = min(2, 1800 / max(page.rect.width, page.rect.height))
        image = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        pages.append("data:image/jpeg;base64," + base64.b64encode(image.tobytes("jpeg", jpg_quality=85)).decode("ascii"))
    print(json.dumps(pages))
