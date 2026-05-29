#!/usr/bin/env python3
import os
import sys
import requests
import json

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "qwen2.5-coder:7b"
SCRIPT_DIR = "./pipeline"

def ask_ollama_structured(prompt):
    """Sends a prompt to Ollama, forcing a structured JSON output via a JSON schema."""
    
    # Strict JSON Schema enforcing the structure Ollama MUST return
    response_schema = {
        "type": "object",
        "properties": {
            "commented_code": {
                "type": "string"
            }
        },
        "required": ["commented_code"]
    }

    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "format": response_schema,  # Forces Ollama to strictly output the schema
        "stream": False,
        "options": {
            "temperature": 0.0      # Hard zero removes random conversational variations
        }
    }
    
    try:
        response = requests.post(OLLAMA_URL, json=payload)
        response.raise_for_status()
        
        # Ollama wraps its response text inside a primary JSON field called 'response'
        outer_json = response.json()
        raw_response_text = outer_json.get("response", "")
        
        # The raw text is guaranteed to be a stringified version of our schema
        inner_json = json.loads(raw_response_text)
        return inner_json.get("commented_code", "")
        
    except Exception as e:
        print(f"⚠️ Error parsing or communicating with Ollama: {e}")
        return None

def comment_agent():
    # Automatically read and sort all python files in the directory exactly like bug-fixer
    scripts = sorted([f for f in os.listdir(SCRIPT_DIR) if f.endswith('.py')])
    
    print(f"🤖 Starting Structured Agentic Documentation Loop using Model: {MODEL_NAME}...")
    print("---------------------------------------------------------------------")

    for script in scripts:
        filepath = os.path.join(SCRIPT_DIR, script)
        print(f"\nEvaluating {script} for documentation...")
        
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                raw_code = f.read()
        except Exception as e:
            print(f"❌ Error reading {script}: {e}")
            continue

        # Mechanical prompt. No need to say "don't talk"—the schema forces it.
        prompt = f"""
Analyze the provided Python script and add clean, professional docstrings and inline comments throughout the code.

CRITICAL RULES:
1. Do NOT alter, optimize, or change a single line of execution logic, variable names, or syntax. 
2. Add a comprehensive docstring at the top of functions/classes explaining their purpose, parameters, and return types.
3. Add meaningful inline comments above complex logic blocks, loops, or conditionals.
4. Use standard Python # comments and triple-quote \"\"\" docstrings \"\"\".
5. Provide ONLY the complete updated version of the script.

### SOURCE CODE TO DOCUMENT:
{raw_code}
"""
        print(f"🧠 Querying Ollama via Native JSON Schema...")
        commented_code = ask_ollama_structured(prompt)
        
        if commented_code:
            try:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(commented_code)
                print(f"🚀 Successfully updated inline documentation in: {script}")
            except Exception as e:
                print(f"❌ Error writing updates to {script}: {e}")
        else:
            print("⚠️ Failed to parse structural response this turn. Skipping...")

if __name__ == "__main__":
    if os.path.exists(SCRIPT_DIR):
        comment_agent()
    else:
        print(f"Please create the '{SCRIPT_DIR}' directory and populate it with scripts first.")