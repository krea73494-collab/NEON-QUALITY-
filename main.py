from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
import subprocess
import uuid
import os

app = FastAPI()

UPLOAD_DIR = "/tmp/neon_uploads"
OUTPUT_DIR = "/tmp/neon_outputs"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)


@app.get("/")
def home():
    return {
        "name": "NEON QUALITY",
        "status": "online"
    }


@app.post("/process")
async def process_video(file: UploadFile = File(...)):

    uid = str(uuid.uuid4())

    input_file = os.path.join(
        UPLOAD_DIR, uid + "_input.mp4"
    )

    output_file = os.path.join(
        OUTPUT_DIR, uid + "_NEON_QUALITY.mp4"
    )

    with open(input_file, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            f.write(chunk)

    command = [
        "ffmpeg",
        "-y",
        "-i", input_file,

        "-map", "0:v:0",
        "-map", "0:a:0?",

        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "16",

        "-pix_fmt", "yuv420p",

        "-c:a", "aac",
        "-b:a", "192k",

        "-movflags", "+faststart",

        output_file
    ]

    subprocess.run(
        command,
        check=True
    )

    return FileResponse(
        output_file,
        media_type="video/mp4",
        filename="NEON_QUALITY.mp4"
    )
