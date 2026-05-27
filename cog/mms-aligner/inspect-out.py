"""Quick local-debug script to eyeball MMS aligner output on song 3.mp3."""
import json
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/mms-out.json"
data = json.loads(open(path).read())

print(f"Total words: {len(data)}")
print(f"First: {data[0]['start']:.2f}s {data[0]['text']!r}")
print(f"Last:  {data[-1]['start']:.2f}s {data[-1]['text']!r}")

print("\n=== 0:50–1:25  first chorus + outro (Static skin lines) ===")
for w in data:
    if 50 <= w["start"] <= 85:
        print(f"  {w['start']:7.3f}-{w['end']:7.3f}  {w['text']!r}")

print("\n=== 1:55–2:20  bridge -> pre-chorus (and you said / I'd never come back / So take it...) ===")
for w in data:
    if 115 <= w["start"] <= 140:
        print(f"  {w['start']:7.3f}-{w['end']:7.3f}  {w['text']!r}")
