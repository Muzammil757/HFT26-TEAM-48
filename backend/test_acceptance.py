import requests

def test_ingest():
    demo_files = [
        '../demo_data/01_benign_openai.jsonl',
        '../demo_data/02_shadow_traffic.jsonl',
        '../demo_data/03_key_leak.jsonl',
        '../demo_data/04_pii_leak.jsonl',
        '../demo_data/05_agent_chain.jsonl',
        '../demo_data/06_false_positive_bait.jsonl'
    ]

    for file_path in demo_files:
        with open(file_path, 'r') as file:
            response = requests.post('http://127.0.0.1:8000/api/ingest', json=[{'payload': line} for line in file.readlines()])
            assert response.status_code == 200, f'Ingest failed for {file_path}'
            response_json = response.json()
            assert 'status' in response_json, f"Expected 'status' in response for {file_path}"
            assert 'processed' in response_json, f"Expected 'processed' in response for {file_path}"
            assert 'incidents' in response_json, f"Expected 'incidents' in response for {file_path}"

if __name__ == '__main__':
    test_ingest()