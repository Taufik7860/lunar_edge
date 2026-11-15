import urllib.request
import re

url = 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req, timeout=10) as resp:
    html = resp.read().decode('utf-8', errors='ignore')
    moon_tfs = re.findall(r'href="([^"]*moon[^"]*\.tf)"', html)
    print("Available lunar frame kernels on NAIF:")
    for f in sorted(set(moon_tfs)):
        print(" ", f)
