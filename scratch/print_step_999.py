import json

transcript_path = r"C:\Users\Mythri Banda\.gemini\antigravity-ide\brain\5dc0d23c-8034-4ab8-8f06-4eadd57f741d\.system_generated\logs\transcript.jsonl"

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            step = json.loads(line)
            if step.get('step_index') == 999:
                print("Step 999:")
                print(json.dumps(step, indent=2))
        except Exception as e:
            pass
