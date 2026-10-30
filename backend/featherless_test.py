from openai import OpenAI
import os, time

api_key = os.getenv("FEATHERLESS_API_KEY")
model = os.getenv("FEATHERLESS_MODEL")
if not api_key or not model:
    raise SystemExit("Set FEATHERLESS_API_KEY and FEATHERLESS_MODEL first.")
client = OpenAI(api_key=api_key, base_url="https://api.featherless.ai/v1")
start = time.perf_counter()
response = client.chat.completions.create(
    model=model,
    messages=[{"role": "user", "content": "Reply with: Featherless connection successful."}],
)
print(response.choices[0].message.content)
print(f"Time taken: {time.perf_counter() - start:.2f} seconds")