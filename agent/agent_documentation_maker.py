import os
import requests
import json

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "qwen2.5-coder:3b"
SCRIPT_DIR = "./pipeline"
DOCS_DIR = "./docs"

def ask_ollama_structured(prompt):
    """Sends a prompt to Ollama, forcing a structured JSON output with the markdown text."""
    
    # Enforce a strict schema demanding the full markdown documentation content
    response_schema = {
        "type": "object",
        "properties": {
            "markdown_content": {
                "type": "string"
            }
        },
        "required": ["markdown_content"]
    }

    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "format": response_schema,
        "stream": False,
        "options": {
            "temperature": 0.2      # Low temperature for structured layouts
        }
    }
    
    try:
        response = requests.post(OLLAMA_URL, json=payload)
        response.raise_for_status()
        
        outer_json = response.json()
        raw_response_text = outer_json.get("response", "")
        
        inner_json = json.loads(raw_response_text)
        return inner_json.get("markdown_content", "")
        
    except Exception as e:
        print(f"⚠️ Error communicating with Ollama: {e}")
        return None

def generate_documentation():
    # Automatically create the docs directory if it doesn't exist
    if not os.path.exists(DOCS_DIR):
        os.makedirs(DOCS_DIR)
        print(f"📁 Created directory: {DOCS_DIR}")

    scripts = sorted([f for f in os.listdir(SCRIPT_DIR) if f.endswith('.py')])
    
    print(f"🤖 Starting Documentation Agent using Model: {MODEL_NAME}...")
    print("---------------------------------------------------------------------")

    for script in scripts:
        script_path = os.path.join(SCRIPT_DIR, script)
        doc_filename = script.replace(".py", ".md")
        doc_path = os.path.join(DOCS_DIR, doc_filename)
        
        print(f"\n📄 Processing: {script} ...")
        
        with open(script_path, "r") as f:
            source_code = f.read()
            
        prompt = f"""
You are a technical writer. Document the following Python script.
Create clear, beautiful Markdown documentation containing:
1. An Overview describing what the script does.
2. Function Signatures explained clearly (parameters, return types).
3. Data Structures Used (if applicable).
4. Code Block Example.

### Source Code:
{source_code}
"""
        print(f"🧠 Generating Markdown for {script}...")
        markdown_doc = ask_ollama_structured(prompt)
        
        if markdown_doc:
            with open(doc_path, "w") as f:
                f.write(markdown_doc)
            print(f"✅ Saved documentation to: {doc_path}")
        else:
            print(f"❌ Failed to generate documentation for {script}")

if __name__ == "__main__":
    if os.path.exists(SCRIPT_DIR):
        generate_documentation()
    else:
        print(f"Please make sure the '{SCRIPT_DIR}' directory exists and has your scripts.")