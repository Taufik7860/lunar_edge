from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=[
            "--use-gl=angle",
            "--use-angle=d3d11",
            "--enable-webgl",
            "--ignore-gpu-blocklist"
        ]
    )
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    page.goto("http://localhost:3000", wait_until="networkidle")
    page.wait_for_timeout(3000)
    page.screenshot(path="c:/Users/Nikhil/Desktop/nasa/scratch/test_screenshot.png")
    print("Screenshot saved to c:/Users/Nikhil/Desktop/nasa/scratch/test_screenshot.png")
    browser.close()
