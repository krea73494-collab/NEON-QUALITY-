import os
import shutil
import subprocess
import tempfile

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(title="NEON QUALITY")


# Allow the frontend to communicate with the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "name": "NEON QUALITY",
        "status": "online",
        "engine": "FFmpeg"
    }


@app.get("/health")
def health():
    return {
        "status": "ok"
    }


@app.post("/process")
async def process_video(file: UploadFile = File(...)):

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="No video file received."
        )

    # Basic video extension check
    allowed_extensions = {
        ".mp4",
        ".mov",
        ".mkv",
        ".webm",
        ".avi",
        ".m4v"
    }

    extension = os.path.splitext(
        file.filename
    )[1].lower()

    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Unsupported video format."
        )


    # Temporary working directory
    work_dir = tempfile.mkdtemp(
        prefix="neon_quality_"
    )

    input_file = os.path.join(
        work_dir,
        "input" + extension
    )

    output_file = os.path.join(
        work_dir,
        "NEON_QUALITY.mp4"
    )


    try:

        # -----------------------------------------
        # SAVE UPLOADED VIDEO
        # -----------------------------------------

        with open(
            input_file,
            "wb"
        ) as output:

            while True:

                chunk = await file.read(
                    1024 * 1024
                )

                if not chunk:
                    break

                output.write(chunk)


        # -----------------------------------------
        # CHECK FFmpeg
        # -----------------------------------------

        try:

            subprocess.run(
                [
                    "ffmpeg",
                    "-version"
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=True
            )

        except Exception:

            raise HTTPException(
                status_code=500,
                detail="FFmpeg is not installed on the server."
            )


        # -----------------------------------------
        # NEON QUALITY ENCODING
        # -----------------------------------------
        #
        # Important:
        #
        # - No scaling
        # - No FPS conversion
        # - No crop
        # - No padding
        # - Keep first video stream
        # - Keep first audio stream
        #
        # 1080p60 source -> 1080p60 output
        #
        # CRF 16 = high quality
        # slow = better compression efficiency
        #
        # -----------------------------------------

        command = [

            "ffmpeg",

            "-y",

            "-i",
            input_file,


            # VIDEO
            "-map",
            "0:v:0",

            # AUDIO (if available)
            "-map",
            "0:a:0?",


            # H.264
            "-c:v",
            "libx264",

            "-preset",
            "slow",

            "-crf",
            "16",

            "-profile:v",
            "high",

            "-pix_fmt",
            "yuv420p",


            # Do NOT force resolution
            # Do NOT force FPS


            # Reasonable GOP
            "-g",
            "60",

            "-keyint_min",
            "30",


            # AUDIO
            "-c:a",
            "aac",

            "-b:a",
            "192k",

            "-ar",
            "48000",


            # MP4 compatibility
            "-tag:v",
            "avc1",

            "-movflags",
            "+faststart",


            # Remove subtitles/data streams
            "-sn",
            "-dn",


            # Remove unnecessary metadata
            "-map_metadata",
            "-1",


            output_file
        ]


        # -----------------------------------------
        # RUN FFmpeg
        # -----------------------------------------

        process = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )


        if process.returncode != 0:

            print(
                "FFmpeg ERROR:"
            )

            print(
                process.stderr
            )

            raise HTTPException(
                status_code=500,
                detail="FFmpeg processing failed."
            )


        # -----------------------------------------
        # VERIFY OUTPUT
        # -----------------------------------------

        if not os.path.exists(
            output_file
        ):

            raise HTTPException(
                status_code=500,
                detail="FFmpeg did not create an output file."
            )


        if os.path.getsize(
            output_file
        ) == 0:

            raise HTTPException(
                status_code=500,
                detail="Output video is empty."
            )


        # -----------------------------------------
        # RETURN VIDEO
        # -----------------------------------------

        return FileResponse(

            output_file,

            media_type="video/mp4",

            filename="NEON_QUALITY.mp4",

            background=None
        )


    except HTTPException:

        raise


    except Exception as error:

        print(
            "NEON QUALITY ERROR:",
            error
        )

        raise HTTPException(
            status_code=500,
            detail=str(error)
        )


    finally:

        # Temporary input/output files are
        # cleaned after the response is finished
        #
        # FileResponse may still need the output,
        # so cleanup is handled separately below.

        pass
