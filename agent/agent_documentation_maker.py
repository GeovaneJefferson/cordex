# import os
# import requests
# import json

# OLLAMA_URL = "http://localhost:11434/api/generate"
# MODEL_NAME = "qwen2.5-coder:7b"
# # SCRIPT_DIR = "./pipeline"
# SCRIPT_DIR = "/home/geovane/MEGA/python/cordex/"
# DOCS_DIR = "./docs"

# def ask_ollama_structured(prompt):
#     """Sends a prompt to Ollama, forcing a structured JSON output with the markdown text."""
    
#     # Enforce a strict schema demanding the full markdown documentation content
#     response_schema = {
#         "type": "object",
#         "properties": {
#             "markdown_content": {
#                 "type": "string"
#             }
#         },
#         "required": ["markdown_content"]
#     }

#     payload = {
#         "model": MODEL_NAME,
#         "prompt": prompt,
#         "format": response_schema,
#         "stream": False,
#         "options": {
#             "temperature": 0.2      # Low temperature for structured layouts
#         }
#     }
    
#     try:
#         response = requests.post(OLLAMA_URL, json=payload)
#         response.raise_for_status()
        
#         outer_json = response.json()
#         raw_response_text = outer_json.get("response", "")
        
#         inner_json = json.loads(raw_response_text)
#         return inner_json.get("markdown_content", "")
        
#     except Exception as e:
#         print(f"⚠️ Error communicating with Ollama: {e}")
#         return None

# def generate_documentation():
#     # Automatically create the docs directory if it doesn't exist
#     if not os.path.exists(DOCS_DIR):
#         os.makedirs(DOCS_DIR)
#         print(f"📁 Created directory: {DOCS_DIR}")

#     scripts = sorted([f for f in os.listdir(SCRIPT_DIR) if f.endswith('.py')])
    
#     print(f"🤖 Starting Documentation Agent using Model: {MODEL_NAME}...")
#     print("---------------------------------------------------------------------")

#     for script in scripts:
#         script_path = os.path.join(SCRIPT_DIR, script)
#         doc_filename = script.replace(".py", ".md")
#         doc_path = os.path.join(DOCS_DIR, doc_filename)
        
#         print(f"\n📄 Processing: {script} ...")
        
#         with open(script_path, "r") as f:
#             source_code = f.read()
            
#         prompt = f"""
# You are a technical writer. Document the following Python script.
# Create clear, beautiful Markdown documentation containing:
# 1. An Overview describing what the script does.
# 2. Function Signatures explained clearly (parameters, return types).
# 3. Data Structures Used (if applicable).
# 4. Code Block Example.

# ### Source Code:
# {source_code}
# """
#         print(f"🧠 Generating Markdown for {script}...")
#         markdown_doc = ask_ollama_structured(prompt)
        
#         if markdown_doc:
#             with open(doc_path, "w") as f:
#                 f.write(markdown_doc)
#             print(f"✅ Saved documentation to: {doc_path}")
#         else:
#             print(f"❌ Failed to generate documentation for {script}")

# if __name__ == "__main__":
#     if os.path.exists(SCRIPT_DIR):
#         generate_documentation()
#     else:
#         print(f"Please make sure the '{SCRIPT_DIR}' directory exists and has your scripts.")

import os
import json
import fnmatch
import requests
from pathlib import Path

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "llama3.1:8b"

PROJECT_DIR = "/home/geovane/MEGA/python/cordex"
OUTPUT_FILE = os.path.join(PROJECT_DIR, "PROJECT_DOCS.md")

EXCLUDE_DIRS = {
    ".git",
    "node_modules",
    "__pycache__",
    "dist",
    "build",
    "target",
    "vendor",
    ".venv",
    "venv",
    ".idea",
    ".vscode",
}

IGNORE_PATTERNS = [
    "*.png",
    "*.jpg",
    "*.jpeg",
    "*.gif",
    "*.ico",
    "*.zip",
    "*.lock",
    "*.min.js",
    "*.map",
]

SOURCE_EXTENSIONS = {
    ".py", ".js", ".ts", ".tsx", ".jsx",
    ".go", ".rs", ".java", ".cpp", ".c",
    ".html", ".css", ".json", ".md"
}


def is_binary(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            f.read(1024)
        return False
    except:
        return True


def should_ignore(filename):
    return any(fnmatch.fnmatch(filename, p) for p in IGNORE_PATTERNS)


def collect_files(root):
    files = []

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [
            d for d in dirnames
            if d not in EXCLUDE_DIRS and not d.startswith(".")
        ]

        for filename in filenames:
            if should_ignore(filename):
                continue

            full_path = os.path.join(dirpath, filename)

            if is_binary(full_path):
                continue

            ext = Path(filename).suffix.lower()

            if ext in SOURCE_EXTENSIONS:
                files.append(full_path)

    return sorted(files)


def build_tree(root):
    tree = []

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [
            d for d in dirnames
            if d not in EXCLUDE_DIRS and not d.startswith(".")
        ]

        rel = os.path.relpath(dirpath, root)
        depth = 0 if rel == "." else rel.count(os.sep) + 1

        indent = "  " * depth

        name = os.path.basename(dirpath)
        tree.append(f"{indent}📁 {name}/")

        for f in sorted(filenames):
            if should_ignore(f):
                continue

            path = os.path.join(dirpath, f)

            if is_binary(path):
                continue

            tree.append(f"{indent}  📄 {f}")

    return "\n".join(tree)


def read_file_snippet(path, max_chars=6000):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read(max_chars)
    except:
        return ""


def ask_ollama(prompt):
    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_predict": 8192
        }
    }

    response = requests.post(OLLAMA_URL, json=payload)
    response.raise_for_status()

    return response.json()["response"]


def summarize_file(rel_path, content):
    prompt = f"""
You are analyzing a source file in a software project.

FILE:
{rel_path}

CONTENT:
{content}

Explain:
- Purpose of this file
- Main classes/functions
- Important logic
- Dependencies
- How it interacts with the rest of the system

Output concise markdown.
"""

    return ask_ollama(prompt)


def generate_project_docs(root):
    files = collect_files(root)

    print(f"Found {len(files)} source files")

    tree = build_tree(root)

    file_summaries = []

    for file_path in files:
        rel = os.path.relpath(file_path, root)

        print(f"Analyzing: {rel}")

        content = read_file_snippet(file_path)

        if not content.strip():
            continue

        summary = summarize_file(rel, content)

        file_summaries.append({
            "file": rel,
            "summary": summary
        })

    combined = "\n\n".join(
        f"# {x['file']}\n{x['summary']}"
        for x in file_summaries
    )

    final_prompt = f"""
You are a senior software architect and technical writer.

Using ONLY the provided project analysis, generate complete project documentation.

Include:

# Project Overview
# Tech Stack
# Architecture
# Directory Structure
# Core Components
# Data Flow
# APIs
# Build & Run
# Development Notes
# Important Design Decisions

PROJECT TREE:
{tree}

FILE ANALYSIS:
{combined}

Output raw markdown only.
"""

    final_docs = ask_ollama(final_prompt)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(final_docs)

    print(f"Documentation written to: {OUTPUT_FILE}")


if __name__ == "__main__":
    generate_project_docs(PROJECT_DIR)