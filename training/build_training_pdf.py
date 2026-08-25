from __future__ import annotations

import re
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "training" / "factory-terminal-training-source.md"
OUTPUT = ROOT / "output" / "pdf" / "factory-terminal-operator-training.pdf"


GOLD = colors.HexColor("#f6c945")
BLACK = colors.HexColor("#11100c")
DARK = colors.HexColor("#262219")
MUTED = colors.HexColor("#62583d")


def clean_inline(text: str) -> str:
    text = escape(text.strip())
    text = re.sub(r"`([^`]+)`", r"<b>\1</b>", text)
    return text


def parse_table(lines: list[str], start: int) -> tuple[list[list[str]], int]:
    rows: list[list[str]] = []
    i = start
    while i < len(lines) and lines[i].strip().startswith("|"):
        raw = lines[i].strip().strip("|")
        cells = [clean_inline(cell) for cell in raw.split("|")]
        if not all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in cells):
            rows.append(cells)
        i += 1
    return rows, i


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(0.5)
    canvas.line(16 * mm, 15 * mm, 194 * mm, 15 * mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(16 * mm, 10 * mm, "Anglo Windows Factory Terminal training")
    canvas.drawRightString(194 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_pdf() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    lines = SOURCE.read_text(encoding="utf-8").splitlines()

    sample = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle(
            "title",
            parent=sample["Title"],
            fontName="Helvetica-Bold",
            fontSize=25,
            leading=29,
            textColor=GOLD,
            alignment=TA_CENTER,
            spaceAfter=8,
        ),
        "subtitle": ParagraphStyle(
            "subtitle",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=colors.white,
            alignment=TA_CENTER,
            spaceAfter=18,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=sample["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=19,
            textColor=BLACK,
            backColor=GOLD,
            borderPadding=(5, 7, 5, 7),
            spaceBefore=12,
            spaceAfter=8,
        ),
        "h3": ParagraphStyle(
            "h3",
            parent=sample["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            textColor=BLACK,
            spaceBefore=8,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=BLACK,
            spaceAfter=5,
        ),
        "bullet": ParagraphStyle(
            "bullet",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=BLACK,
            leftIndent=11,
            firstLineIndent=-7,
            spaceAfter=3,
        ),
        "small": ParagraphStyle(
            "small",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=8,
            leading=11,
            textColor=MUTED,
        ),
    }

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=17 * mm,
        bottomMargin=22 * mm,
        title="Anglo Windows Factory Terminal Operator Training",
        author="Anglo Windows",
    )

    story = [
        Table(
            [[
                Paragraph("ANGLO WINDOWS", styles["title"]),
                Paragraph("Factory Terminal<br/>Operator Training", styles["title"]),
            ]],
            colWidths=[70 * mm, 100 * mm],
            style=[
                ("BACKGROUND", (0, 0), (-1, -1), BLACK),
                ("BOX", (0, 0), (-1, -1), 1.2, GOLD),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, DARK),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 14),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
            ],
        ),
        Spacer(1, 6 * mm),
        Paragraph(
            "Quick practical guide for factory operators using the station tablets. "
            "The Google Sheet remains the master record.",
            styles["subtitle"],
        ),
    ]

    i = 0
    pending_bullets: list[str] = []

    def flush_bullets() -> None:
        nonlocal pending_bullets
        if not pending_bullets:
            return
        for item in pending_bullets:
            story.append(Paragraph(clean_inline(item), styles["bullet"]))
        story.append(Spacer(1, 3 * mm))
        pending_bullets = []

    while i < len(lines):
        line = lines[i].rstrip()
        stripped = line.strip()
        if not stripped:
            flush_bullets()
            i += 1
            continue

        if stripped.startswith("|"):
            flush_bullets()
            rows, i = parse_table(lines, i)
            if rows:
                table = Table(
                    [[Paragraph(cell, styles["small"]) for cell in row] for row in rows],
                    repeatRows=1,
                )
                table.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), BLACK),
                    ("TEXTCOLOR", (0, 0), (-1, 0), GOLD),
                    ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d8c98c")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]))
                story.append(table)
                story.append(Spacer(1, 4 * mm))
            continue

        if stripped.startswith("# "):
            flush_bullets()
            i += 1
            continue
        if stripped.startswith("## "):
            flush_bullets()
            heading = stripped[3:]
            if heading in {"Starting A Shift", "Finding A Job", "Station Status Guide", "Troubleshooting For Operators", "Trainer Demonstration Script"}:
                story.append(PageBreak())
            story.append(Paragraph(clean_inline(heading), styles["h2"]))
            i += 1
            continue
        if stripped.startswith("### "):
            flush_bullets()
            story.append(Paragraph(clean_inline(stripped[4:]), styles["h3"]))
            i += 1
            continue
        if re.match(r"^\d+\.\s+", stripped):
            pending_bullets.append(stripped)
            i += 1
            continue
        if stripped.startswith("- "):
            pending_bullets.append("- " + stripped[2:])
            i += 1
            continue

        if pending_bullets:
            pending_bullets[-1] = f"{pending_bullets[-1]} {stripped}"
            i += 1
            continue

        flush_bullets()
        parts = [stripped]
        i += 1
        while i < len(lines):
            lookahead = lines[i].strip()
            if (
                not lookahead
                or lookahead.startswith("#")
                or lookahead.startswith("|")
                or lookahead.startswith("- ")
                or re.match(r"^\d+\.\s+", lookahead)
            ):
                break
            parts.append(lookahead)
            i += 1
        story.append(Paragraph(clean_inline(" ".join(parts)), styles["body"]))

    flush_bullets()
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    build_pdf()
