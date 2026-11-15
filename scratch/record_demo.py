import os
import time
import cv2
from playwright.sync_api import sync_playwright

output_dir = "c:/Users/Nikhil/Desktop/nasa/demo_video"
os.makedirs(output_dir, exist_ok=True)
mp4_path = os.path.join(output_dir, "lunar_edge_mission_control_demo.mp4")

print("Starting 30-second automated video recording...")

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
    context = browser.new_context(
        viewport={"width": 1920, "height": 1080},
        record_video_dir=output_dir,
        record_video_size={"width": 1920, "height": 1080}
    )
    page = context.new_page()
    page.goto("http://localhost:3000", wait_until="networkidle")
    print("Page loaded successfully at 1080p resolution.")

    # 1. Explorer & 3D Moon Orbit Demonstration (0s - 5s)
    page.wait_for_timeout(2000)

    # Smoothly drag mouse across the 3D Moon canvas to demonstrate real-time day/night terminator rotation
    canvas = page.locator("canvas").first
    canvas_box = canvas.bounding_box()
    if canvas_box:
        cx = canvas_box["x"] + canvas_box["width"] * 0.45
        cy = canvas_box["y"] + canvas_box["height"] * 0.5
        page.mouse.move(cx, cy)
        page.mouse.down()
        for i in range(30):
            page.mouse.move(cx + i * 7, cy - i * 2)
            page.wait_for_timeout(35)
        page.mouse.up()
        page.wait_for_timeout(1000)

    # Select Nobile Crater Rim 1 from bottom timeline dock
    nobile_chip = page.locator("button:has-text('Nobile Crater Rim 1')").first
    if nobile_chip.is_visible():
        nobile_chip.click()
        page.wait_for_timeout(2000)

    # 2. Opportunity Discovery Workspace (5s - 11s)
    page.locator("aside button:has-text('Opportunity Discovery')").click()
    page.wait_for_timeout(2500)

    # Filter by Conditional tab
    cond_tab = page.locator("button:has-text('Conditional')").first
    if cond_tab.is_visible():
        cond_tab.click()
        page.wait_for_timeout(1500)

    # Return to ALL candidates filter
    all_tab = page.locator("button:has-text('ALL')").first
    if all_tab.is_visible():
        all_tab.click()
        page.wait_for_timeout(1500)

    # 3. Candidate Intelligence Workspace (11s - 17s)
    page.locator("aside button:has-text('Candidate Intelligence')").click()
    page.wait_for_timeout(2500)

    # Scroll through comparative intelligence charts & matrix
    page.mouse.wheel(0, 450)
    page.wait_for_timeout(2000)
    page.mouse.wheel(0, 450)
    page.wait_for_timeout(2000)

    # 4. Mission Resilience Workspace (17s - 23s)
    page.locator("aside button:has-text('Mission Resilience')").click()
    page.wait_for_timeout(3000)

    # Smooth scroll down to view Monte Carlo landing dispersion & sensitivity
    page.mouse.wheel(0, 400)
    page.wait_for_timeout(2500)

    # 5. Mission Recovery Workspace (23s - 28s)
    page.locator("aside button:has-text('Mission Recovery')").click()
    page.wait_for_timeout(3000)

    # Scroll down to view counterfactual recovery interventions
    page.mouse.wheel(0, 350)
    page.wait_for_timeout(2500)

    # 6. Return to 3D Mission Explorer for Grand Finale (28s - 31s)
    page.locator("aside button:has-text('Mission Explorer')").click()
    page.wait_for_timeout(3000)

    # Close context to flush video to disk
    context.close()
    video_path = page.video.path()
    print("Raw WebM recording completed:", video_path)
    browser.close()

# Convert WebM to MP4 for universal playback compatibility
print("Converting recording to high-definition MP4 format...")
cap = cv2.VideoCapture(video_path)
fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1920
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 1080

fourcc = cv2.VideoWriter_fourcc(*'mp4v')
out = cv2.VideoWriter(mp4_path, fourcc, fps, (width, height))

frame_count = 0
while True:
    ret, frame = cap.read()
    if not ret:
        break
    out.write(frame)
    frame_count += 1

cap.release()
out.release()

duration_sec = frame_count / fps
print(f"Demo video produced successfully!")
print(f"MP4 Path: {mp4_path}")
print(f"Frames: {frame_count}, FPS: {fps}, Duration: {duration_sec:.1f}s, Resolution: {width}x{height}")
