import os
import subprocess
import requests
import json

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "qwen2.5-coder:7b"  # Note: qwen2.5 and llama3 variants are highly optimized for this
SCRIPT_DIR = "./pipeline"

def ask_ollama_structured(prompt):
    """Sends a prompt to Ollama, forcing a structured JSON output via a JSON schema."""
    
    # Enforce a strict JSON Schema that the model MUST conform to
    response_schema = {
        "type": "object",
        "properties": {
            "fixed_code": {
                "type": "string"
            }
        },
        "required": ["fixed_code"]
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
        return inner_json.get("fixed_code", "")
        
    except Exception as e:
        print(f"⚠️ Error parsing or communicating with Ollama: {e}")
        return None

def run_script(filepath):
    """Executes a target script and captures stdout or stderr."""
    result = subprocess.run(["python", filepath], capture_output=True, text=True)
    if result.returncode == 0:
        return True, result.stdout.strip()
    else:
        return False, result.stderr.strip()

def fix_agent():
    scripts = sorted([f for f in os.listdir(SCRIPT_DIR) if f.endswith('.py')])
    
    print(f"🤖 Starting Structured Agentic Fixer Loop using Model: {MODEL_NAME}...")
    print("---------------------------------------------------------------------")

    for script in scripts:
        filepath = os.path.join(SCRIPT_DIR, script)
        print(f"\nEvaluating {script}...")
        
        for attempt in range(1, 4):
            success, output = run_script(filepath)
            
            if success:
                print(f"✅ {script} passed! Output: {output}")
                break
            else:
                print(f"❌ {script} failed (Attempt {attempt}/3). Parsing traceback...")
                
                with open(filepath, "r") as f:
                    broken_code = f.read()
                
                # Mechanical prompt. No need to say "don't talk"—the schema forces it.
                prompt = f"""
Analyze this broken Python script and its accompanying error traceback. 
Provide the corrected, fully functioning version of the script.

### Broken Code:
{broken_code}

### Error Message:
{output}
"""
                print(f"🧠 Querying Ollama via Native JSON Schema...")
                fixed_code = ask_ollama_structured(prompt)
                
                if fixed_code:
                    with open(filepath, "w") as f:
                        f.write(fixed_code)
                else:
                    print("⚠️ Failed to parse structural response this turn. Retrying...")
        else:
            print(f"💀 Failed to fix {script} after 3 attempts.")

if __name__ == "__main__":
    if os.path.exists(SCRIPT_DIR):
        fix_agent()
    else:
        print(f"Please create the '{SCRIPT_DIR}' directory and populate it with broken scripts first.")