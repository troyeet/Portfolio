#!/usr/bin/env python3
"""Build resume/Jeth-Roy-Delos-Santos-Resume.pdf — the version that goes on the web.

Same content as the résumé Troy sends to employers directly, with three changes
made deliberately, because this file is downloadable by anyone:

  * the mobile number is removed entirely
  * the address reads Libon, Albay — not the Cabuyao street address
  * the scanned signature is dropped (a published signature invites forgery)

The text is not painted over, it is simply never written, so nothing is
recoverable with copy-paste or pdftotext.

    python build-resume.py
"""

import pathlib

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (BaseDocTemplate, Frame, Image, KeepTogether,
                               PageTemplate, Paragraph, Spacer, Table, TableStyle)

HERE = pathlib.Path(__file__).parent
OUT = HERE / "resume" / "Jeth-Roy-Delos-Santos-Resume.pdf"
PHOTO = HERE / "img" / "jeth-delos-santos.jpg"

SERIF, BOLD = "Times-Roman", "Times-Bold"
INK = colors.HexColor("#111111")
RULE = colors.HexColor("#222222")

MARGIN = 0.72 * inch
COL = LETTER[0] - 2 * MARGIN


def style(name, **kw):
    base = dict(fontName=SERIF, fontSize=9.6, leading=12.4, textColor=INK,
                spaceBefore=0, spaceAfter=0)
    base.update(kw)
    return ParagraphStyle(name, **base)


S = {
    "name":    style("name", fontName=BOLD, fontSize=21, leading=24),
    "contact": style("contact", fontSize=9.6, leading=13),
    "head":    style("head", fontName=BOLD, fontSize=11.5, leading=14),
    "body":    style("body", alignment=TA_JUSTIFY),
    "role":    style("role", fontName=BOLD, fontSize=9.8, leading=13),
    "bullet":  style("bullet", leftIndent=22, firstLineIndent=-11, leading=12.6),
    "sub":     style("sub", leading=12.6),
    "certify": style("certify", fontSize=9.4, leading=13),
}


def bullets(items, gap=1.6):
    out = []
    for it in items:
        out.append(Paragraph("•&nbsp;&nbsp;&nbsp;" + it, S["bullet"]))
        out.append(Spacer(1, gap))
    return out


def rule(space_before=11, space_after=6.5):
    t = Table([[""]], colWidths=[COL], rowHeights=[0.6])
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.9, RULE),
                           ("TOPPADDING", (0, 0), (-1, -1), 0),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return [Spacer(1, space_before), t, Spacer(1, space_after)]


def section(title):
    """Heading with a full-width rule beneath it — matches the original."""
    return [KeepTogether([Spacer(1, 12), Paragraph(title, S["head"]), *rule(3.5, 7)])]


def two_col(left, right, widths=(0.5, 0.5), gap=14):
    w = COL - gap
    t = Table([[left, "", right]],
              colWidths=[w * widths[0], gap, w * widths[1]])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                           ("TOPPADDING", (0, 0), (-1, -1), 0),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return t


def header():
    """Name and contact block on the left, portrait on the right."""
    lines = [
        "Address:&nbsp; Libon, Albay, Philippines",
        'E-mail:&nbsp; <a href="mailto:jethroyd@gmail.com">jethroyd@gmail.com</a>',
        'Portfolio:&nbsp; <a href="https://jethroy.vercel.app/"><font color="#1a3fa8">'
        'https://jethroy.vercel.app/</font></a>',
        'Github:&nbsp; <a href="https://github.com/troyeet">https://github.com/troyeet</a>',
    ]
    left = [Paragraph("JETH ROY LIPA DELOS SANTOS", S["name"]), Spacer(1, 5)]
    left += rule(0, 4)
    left += [Paragraph(l, S["contact"]) for l in lines]

    cell = [left]
    if PHOTO.exists():
        img = Image(str(PHOTO), width=1.12 * inch, height=1.40 * inch)
        cell.append(img)
    else:
        cell.append("")

    t = Table([cell], colWidths=[COL - 1.34 * inch, 1.34 * inch])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (0, 0), "TOP"),
                           ("VALIGN", (1, 0), (1, 0), "TOP"),
                           ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                           ("TOPPADDING", (0, 0), (-1, -1), 0),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return t


def build():
    story = [header()]

    story += [*section("SUMMARY")]
    story.append(Paragraph(
        "Aspiring full-stack developer with hands-on experience in building web, mobile, "
        "and desktop applications, as well as providing hardware and software "
        "troubleshooting and IT system maintenance. Skilled in developing responsive web "
        "applications using HTML, CSS, JavaScript, PHP, MySQL, React.js, Java, and C++, "
        "with practical experience using Android Studio, NetBeans, Eclipse, and Dev-C++ "
        "for application development. Possesses a strong foundation in user interface "
        "design, database-driven systems, debugging, and problem-solving, with a focus on "
        "creating functional and user-centered applications. Also experienced in technical "
        "support, Cisco Packet Tracer, Canva, Blender, and basic IT maintenance.",
        S["body"]))

    story += [*section("WORK EXPERIENCE")]
    story.append(Paragraph("Part-Time IT Assistant – Local Government Unit (LGU) | 2025", S["role"]))
    story.append(Spacer(1, 3))
    story += bullets([
        "Provided basic IT support, including printing, scanning, and document processing.",
        "Designed posters and layouts using Canva.",
        "Performed basic hardware and software troubleshooting and minor repairs.",
    ])
    story.append(Spacer(1, 4))
    story.append(Paragraph("Staff / Assistant EMRO Computer Shop | 2019–Present", S["role"]))
    story.append(Spacer(1, 3))
    story += bullets([
        "Operated printing, scanning, photocopying, and laminating services.",
        "Designed simple posters, forms, and layouts using Canva.",
        "Assisted in selling and organizing office and school supplies.",
    ])
    story.append(Spacer(1, 4))
    story.append(Paragraph("OJT Intern – Toyota Albay", S["role"]))
    story.append(Spacer(1, 3))
    story += bullets([
        "Assisted with daily IT operations and technical support during OJT at Toyota Albay.",
        "Performed hardware and software troubleshooting, system setup, and maintenance.",
        "Resolved basic network, printer, and internet connectivity issues.",
        "Provided technical assistance for office computer systems and devices.",
    ])

    story += [*section("TECHNICAL SKILLS")]
    left = [Paragraph("<b>Programming Languages:</b>", S["sub"]),
            Paragraph("HTML, CSS, JavaScript, PHP, MySQL, Java, C++", S["sub"]),
            Spacer(1, 4),
            Paragraph("<b>Development Tools / IDEs:</b>", S["sub"]),
            Paragraph("Android Studio, NetBeans, Eclipse, Dev-C++, VS Code, GitHub", S["sub"]),
            Spacer(1, 4),
            Paragraph("<b>Other Technical Tools:</b>", S["sub"]),
            Paragraph("Cisco Packet Tracer, Figma, Canva, Blender", S["sub"])]
    right = [Paragraph("<b>Frameworks / Libraries:</b>", S["sub"]),
             Paragraph("React.js", S["sub"]),
             Spacer(1, 4),
             Paragraph("<b>Database:</b>", S["sub"]),
             Paragraph("MySQL, MongoDB, MS Access", S["sub"])]
    story.append(two_col(left, right, (0.56, 0.44)))
    story.append(Spacer(1, 7))
    story.append(Paragraph("<b>Core Development Skills:</b>", S["sub"]))
    story.append(Paragraph(
        "Web application development, mobile app development, desktop programming, "
        "responsive UI design, CRUD operations, login/authentication systems, database "
        "integration, debugging, software installation, hardware/software troubleshooting",
        S["sub"]))

    projects = [
        ("BU Polangui Interactive Navigation System",
         "Thesis / Capstone Project",
         "<b>Tech Stack:</b> React.js, JavaScript, HTML, CSS, PHP, MySQL",
         ["Developed a web-based system for campus navigation and information access.",
          "Built responsive user interfaces and database-driven features.",
          "Applied front-end and back-end integration to support practical user needs."]),
        ("Student Management System Website", None,
         "<b>Tech Stack:</b> HTML, CSS, JavaScript, PHP, MySQL",
         ["Developed login and sign-up features.",
          "Implemented database-backed user authentication and management.",
          "Built a responsive web interface with dynamic system functionality."]),
        ("Android Application Development Projects", None,
         "<b>Tools:</b> Android Studio, Java",
         ["Developed introductory Android applications during second year of college.",
          "Built app layouts, screen navigation, event handling, and basic mobile features."]),
        ("Java and C++ Programming Exercises / Mini Projects", None,
         "<b>Tools:</b> NetBeans, Eclipse, Dev-C++",
         ["Created classroom exercises and small programming projects using Java and C++.",
          "Strengthened problem-solving, logic building, and object-oriented programming "
          "fundamentals."]),
    ]
    for i, (title, sub, stack, items) in enumerate(projects):
        block = [Paragraph(title, S["role"])]
        if sub:
            block.append(Paragraph(sub, S["role"]))
        block.append(Paragraph(stack, S["sub"]))
        block.append(Spacer(1, 3))
        block += bullets(items)
        block.append(Spacer(1, 5))
        if i == 0:
            # keep the heading with the first project so it never orphans at a page foot
            story.append(KeepTogether([*section("ACADEMIC PROJECTS"), *block]))
        else:
            story.append(KeepTogether(block))

    story += [*section("EDUCATION")]
    left = [Paragraph("<b>Bachelor of Science in Information Technology</b>", S["sub"]),
            Paragraph("Bicol University Polangui", S["sub"]),
            Paragraph("<b>Latin:</b> Cum Laude", S["sub"]),
            Paragraph("<b>Honors:</b> Dean’s Lister", S["sub"]),
            Paragraph("2022 – 2026", S["sub"])]
    right = [Paragraph("<b>Senior High School – Accountancy, Business, and Management</b>", S["sub"]),
             Paragraph("Libon Agro Industrial High School", S["sub"]),
             Paragraph("With Honors", S["sub"]),
             Paragraph("2020 – 2022", S["sub"])]
    story.append(two_col(left, right, (0.5, 0.5)))

    story += [*section("CERTIFICATIONS")]
    story += bullets([
        "<b>Cyber Resilience: Understanding the Evolving Landscape of Data Leaks</b> "
        "&nbsp;DICT Webinar | 2024",
        "<b>AI Essentials: Unlocking the Power of Artificial Intelligence</b> "
        "&nbsp;DICT Webinar | 2024",
        "<b>Computer Hardware Servicing – Assemble, Repairing, Reformating, Troubleshoot</b> "
        "&nbsp;Legacy Global Solutions (LGS) Training Seminar | 2020",
    ], gap=3)

    story.append(Spacer(1, 18))
    story.append(Paragraph(
        "I hereby certify that the above information is true and correct to the best of my "
        "knowledge.", S["certify"]))
    story.append(Spacer(1, 16))
    story.append(Paragraph("<b><u>JETH ROY L. DELOS SANTOS</u></b>", S["certify"]))
    story.append(Paragraph("&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Applicant", S["certify"]))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(str(OUT), pagesize=LETTER,
                          leftMargin=MARGIN, rightMargin=MARGIN,
                          topMargin=MARGIN, bottomMargin=0.6 * inch,
                          title="Jeth Roy L. Delos Santos — Resume",
                          author="Jeth Roy L. Delos Santos",
                          subject="Full-stack developer and 3D modeler",
                          creator="")
    frame = Frame(MARGIN, 0.6 * inch, COL, LETTER[1] - MARGIN - 0.6 * inch, id="body",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="page", frames=[frame])])
    doc.build(story)
    print(f"wrote {OUT.relative_to(HERE)}  ({OUT.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    build()
