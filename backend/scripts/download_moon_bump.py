import urllib.request
import os

out_dir = os.path.abspath("../frontend/public/textures")
os.makedirs(out_dir, exist_ok=True)

urls = [
    ("https://www.solarsystemscope.com/textures/download/2k_moon_bump.jpg", "moon_bump_2k.jpg"),
    ("https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_uint.tif", "ldem_3_uint.tif"),
]

for url, filename in urls:
    dest = os.path.join(out_dir, filename)
    if os.path.exists(dest) and os.path.getsize(dest) > 10000:
        print(f"Already exists: {filename} ({os.path.getsize(dest)} bytes)")
        continue
    print(f"Downloading {filename} from {url}...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req, timeout=20) as resp, open(dest, 'wb') as out_file:
            out_file.write(resp.read())
        print(f"Saved {filename}: {os.path.getsize(dest)} bytes")
    except Exception as e:
        print(f"Failed to download {url}: {e}")
