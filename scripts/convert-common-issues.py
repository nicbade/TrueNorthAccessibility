#!/usr/bin/env python3
"""Convert the common issues workbook (Numbers export) into src/data/commonIssues.json.

Usage: python3 scripts/convert-common-issues.py path/to/common-issues-audit.xlsx
Requires: pip install openpyxl

Only working examples hosted on public documentation sites (PUBLIC_HOSTS) are
kept; links to private or internal documentation are dropped entirely, and
site-specific page titles in the text are replaced with a placeholder. The
script fails if any URL in the output is not on the public allowlist.
"""

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import openpyxl

OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "commonIssues.json"

PRIORITIES = {"Blocker", "Critical", "Major", "Minor"}

CATEGORY_ALIASES = {
    "Buttons / Links": "Buttons/Links",
    "Image": "Images",
    "Video": "Videos",
}

PUBLIC_HOSTS = (
    "developer.apple.com",
    "developer.android.com",
    "www.w3.org",
    "developer.mozilla.org",
    "codepen.io",
    "www.deque.com",
    "webaim.org",
    "learn.microsoft.com",
    "accessibility.princeton.edu",
    "www.sitepoint.com",
    "accessibility.huit.harvard.edu",
    "www.w3schools.com",
    "www.unimelb.edu.au",
    "accessibility.iu.edu",
    "m2.material.io",
    "www.geeksforgeeks.org",
    "accessibilityinsights.io",
    "github.com",
)
URL_RE = re.compile(r"https?://[^\s\"'<>)]+")
TEXT_REPLACEMENTS = [
    (re.compile(r"\|\s*[\w-]+\.com\s*</title>", re.IGNORECASE), "| Site Name </title>"),
]

# sheet -> {spreadsheet header: field}
SHEETS = {
    "Desktop": {
        "Issue #": "number",
        "Description": "description",
        "Expected Behaviors": "expectedBehavior",
        "Fixes": "fix",
        "Priority": "priority",
        "Working Example - Internal": "example:Internal",
        "Working Example - External": "example:External",
        "WCAG Guideline": "wcag",
        "Category": "category",
    },
    "iOS": {
        "Issue #": "number",
        "Description": "description",
        "Expected Behaviors": "expectedBehavior",
        "Fixes": "fix",
        "Priority": "priority",
        "Working Example - Internal": "example:Internal",
        "Working Example - External": "example:External",
        "WCAG Guideline": "wcag",
        "Category": "category",
        "Comments": "comments",
    },
    "Mobile": {
        "Issue #": "number",
        "Description": "description",
        "Expected Behaviors": "expectedBehavior",
        "iOS Fixes": "fix:iOS",
        "Android Fixes": "fix:Android",
        "Priority": "priority",
        "Working Example - Internal": "example:Internal",
        "Working Example - iOS": "example:iOS",
        "Working Example - Android": "example:Android",
        "WCAG Guideline": "wcag",
        "Category": "category",
        "Comments": "comments",
    },
}


def clean(value):
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n").strip()
    text = re.sub(r"[ \t]{2,}", " ", text)
    for pattern, replacement in TEXT_REPLACEMENTS:
        text = pattern.sub(replacement, text)
    return text


def is_public_url(url):
    return urlparse(url).scheme == "https" and (urlparse(url).hostname or "").lower() in PUBLIC_HOSTS


def parse_wcag(value):
    return re.findall(r"\d+\.\d+\.\d+", clean(value))


def convert(path):
    wb = openpyxl.load_workbook(path)
    issues = []
    dropped = 0
    for sheet, mapping in SHEETS.items():
        ws = wb[sheet]
        headers = [clean(c.value) for c in ws[1]]
        for row in ws.iter_rows(min_row=2):
            cells = {headers[i]: row[i] for i in range(len(headers)) if headers[i]}
            if not clean(cells["Description"].value):
                continue
            number = int(cells["Issue #"].value)
            issue = {
                "id": f"{sheet.lower()}-{number}",
                "platform": sheet,
                "number": number,
                "description": "",
                "expectedBehavior": "",
                "fix": "",
                "priority": "",
                "wcag": [],
                "category": "",
                "comments": "",
                "examples": [],
            }
            fixes = []
            for header, field in mapping.items():
                cell = cells[header]
                value = clean(cell.value)
                if field == "number":
                    continue
                if field.startswith("example:"):
                    if value:
                        url = (cell.hyperlink.target if cell.hyperlink else "") or ""
                        if not is_public_url(url):
                            dropped += 1
                            continue
                        issue["examples"].append({"kind": field.split(":")[1], "label": value, "url": url})
                elif field.startswith("fix:"):
                    if value:
                        fixes.append(f"{field.split(':')[1]}: {value}")
                elif field == "wcag":
                    issue["wcag"] = parse_wcag(value)
                elif field == "priority":
                    issue["priority"] = value if value in PRIORITIES else ""
                elif field == "category":
                    issue["category"] = CATEGORY_ALIASES.get(value, value)
                else:
                    issue[field] = value
            if fixes:
                issue["fix"] = "\n\n".join(fixes)
            issues.append(issue)
    return issues, dropped


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    data, dropped = convert(sys.argv[1])
    output = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    private = sorted({u for u in URL_RE.findall(output) if not is_public_url(u)})
    if private:
        sys.exit(f"Non-public URLs survived conversion: {private}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(output, encoding="utf-8")
    print(f"Wrote {len(data)} issues to {OUT} ({dropped} non-public example links dropped)")
