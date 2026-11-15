import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import pytest
# Run tests without anyio plugin interfering
ret = pytest.main(["tests/test_spice_geometry.py", "-v", "-p", "no:anyio"])
sys.exit(ret)
