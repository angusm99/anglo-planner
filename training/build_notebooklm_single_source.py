from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, PageBreak, Paragraph, Preformatted, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "output" / "notebooklm"
MD_OUT = OUT_DIR / "factory-terminal-notebooklm-single-source.md"
PDF_OUT = OUT_DIR / "factory-terminal-notebooklm-single-source.pdf"

TEXT_SOURCES = [
    ROOT / "training" / "factory-terminal-training-source.md",
    ROOT / "TABLET_ROLLOUT.md",
    ROOT / "public" / "cover.html",
    ROOT / "public" / "index.html",
    ROOT / "public" / "station.html",
]

IMAGE_SOURCES = [
    ROOT / "public" / "cover-wallpaper.jpg",
    ROOT / "public" / "icons" / "factory-terminal-512.png",
]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace").strip()


def build_markdown() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    parts = [
        "# Anglo Windows Factory Terminal - NotebookLM Single Source",
        "",
        "This is the current working-version source bundle for generating training material.",
        "",
        "Important:",
        "",
        "- Treat this file as the primary source for NotebookLM Studio.",
        "- The working tablet rollout was committed as `586da61`.",
        "- Older tablet notes that conflict with this file should be ignored.",
        "- Do not reveal or infer admin passwords, Sheet tokens, service credentials, cookies, or secrets.",
        "- Operator flow: shortcut -> charging cover -> START NORMAL OPERATION -> station dashboard.",
        "- In-app Home returns to station selection using `/?select=1`.",
        "",
        "## Included Source Files",
        "",
    ]
    for path in TEXT_SOURCES:
        rel = path.relative_to(ROOT).as_posix()
        parts.extend([
            f"## Source File: `{rel}`",
            "",
            "```" + ("html" if path.suffix == ".html" else "markdown"),
            read_text(path),
            "```",
            "",
        ])
    parts.extend([
        "## Image Sources Included In Repo",
        "",
    ])
    for path in IMAGE_SOURCES:
        rel = path.relative_to(ROOT).as_posix()
        parts.append(f"- `{rel}`")
    parts.append("")
    MD_OUT.write_text("\n".join(parts), encoding="utf-8")


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#f6c945"))
    canvas.setLineWidth(0.5)
    canvas.line(16 * mm, 15 * mm, 194 * mm, 15 * mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#62583d"))
    canvas.drawString(16 * mm, 10 * mm, "Anglo Windows Factory Terminal - NotebookLM source")
    canvas.drawRightString(194 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_pdf() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sample = getSampleStyleSheet()
    title = ParagraphStyle(
        "title",
        parent=sample["Title"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=26,
        textColor=colors.HexColor("#f6c945"),
        alignment=TA_CENTER,
        backColor=colors.HexColor("#11100c"),
        borderPadding=(14, 12, 14, 12),
        spaceAfter=10,
    )
    h = ParagraphStyle(
        "h",
        parent=sample["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=17,
        textColor=colors.black,
        backColor=colors.HexColor("#f6c945"),
        borderPadding=(5, 7, 5, 7),
        spaceBefore=10,
        spaceAfter=7,
    )
    body = ParagraphStyle(
        "body",
        parent=sample["BodyText"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=13,
        textColor=colors.black,
        spaceAfter=5,
    )
    code = ParagraphStyle(
        "code",
        parent=sample["Code"],
        fontName="Courier",
        fontSize=6.2,
        leading=7.5,
        textColor=colors.HexColor("#222222"),
    )

    doc = SimpleDocTemplate(
        str(PDF_OUT),
        pagesize=A4,
        rightMargin=14 * mm,
        leftMargin=14 * mm,
        topMargin=15 * mm,
        bottomMargin=22 * mm,
        title="Anglo Windows Factory Terminal NotebookLM Single Source",
        author="Anglo Windows",
    )

    story = [
        Paragraph("ANGLO WINDOWS<br/>Factory Terminal NotebookLM Single Source", title),
        Paragraph(
            "Use this as the single supported-source PDF when NotebookLM rejects zip files. "
            "The Markdown source bundle beside this PDF contains the complete raw source text.",
            body,
        ),
        Paragraph("Current Working Behavior", h),
        Paragraph(
            "Tablet shortcut opens the station charging cover. START NORMAL OPERATION opens the station dashboard. "
            "The in-app Home button opens the station-selection page via /?select=1. Admin mode is password-protected "
            "and is not part of normal operator training.",
            body,
        ),
    ]

    for path in IMAGE_SOURCES:
        if path.exists():
            story.append(Paragraph(f"Visual Reference: {escape(path.relative_to(ROOT).as_posix())}", h))
            img = Image(str(path))
            max_w = 165 * mm
            max_h = 90 * mm
            scale = min(max_w / img.imageWidth, max_h / img.imageHeight)
            img.drawWidth = img.imageWidth * scale
            img.drawHeight = img.imageHeight * scale
            story.extend([img, Spacer(1, 5 * mm)])

    for path in TEXT_SOURCES:
        rel = path.relative_to(ROOT).as_posix()
        story.append(PageBreak())
        story.append(Paragraph(f"Source File: {escape(rel)}", h))
        text = read_text(path)
        if path.name == "station.html":
            text = text[:16000] + "\n\n[station.html truncated in PDF for readability; full text is in the .md single-source file]"
        for chunk_start in range(0, len(text), 3500):
            chunk = text[chunk_start:chunk_start + 3500]
            story.append(Preformatted(chunk, code))
            story.append(Spacer(1, 3 * mm))

    doc.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    build_markdown()
    build_pdf()

