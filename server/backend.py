from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
from werkzeug.utils import secure_filename
import uuid
from datetime import datetime
from pydub import AudioSegment
import time
import gc
import torch
import soundfile as sf
import librosa
import numpy as np

app = Flask(__name__)
# Enable CORS for all routes - permissive for local development
# In production, you should restrict origins
CORS(app,
     origins="*",
     methods=["GET", "POST", "OPTIONS", "PUT", "DELETE"],
     allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
     supports_credentials=False,
     max_age=3600)

# Model loading - lazy load to avoid startup crashes
MODEL_NAME = "preszzz/drone-audio-detection-05-17-trial-0"
extractor = None
model = None
_model_loading = False
_model_load_error = None

# OpenUnmix model caching
umx_model = None
_umx_model_loading = False
_umx_model_load_error = None


def load_model():
    """Lazy load the drone detection model"""
    global extractor, model, _model_loading, _model_load_error

    if model is not None and extractor is not None:
        return True  # Already loaded

    if _model_loading:
        return False  # Currently loading

    if _model_load_error:
        return False  # Previous load failed

    try:
        _model_loading = True

        # Import here to avoid startup crashes
        import librosa
        import torch
        import numpy as np
        from transformers import AutoFeatureExtractor, AutoModelForAudioClassification

        # Set torch to use less memory
        torch.set_num_threads(1)

        # Load model with memory optimizations
        extractor = AutoFeatureExtractor.from_pretrained(MODEL_NAME)
        model = AutoModelForAudioClassification.from_pretrained(
            MODEL_NAME,
            torch_dtype=torch.float32,  # Use float32 instead of float16 to avoid issues
            low_cpu_mem_usage=True  # Optimize memory usage during loading
        )

        # Set model to eval mode and move to CPU explicitly
        model.eval()
        model = model.cpu()

        # Disable gradient computation globally
        for param in model.parameters():
            param.requires_grad = False

        _model_loading = False
        return True

    except Exception as e:
        error_msg = f"Error loading model: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        _model_load_error = error_msg
        _model_loading = False
        extractor = None
        model = None
        return False


# Configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac', 'mpeg'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB max file size

# Create upload folder if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE


def allowed_file(filename):
    """Check if file has allowed extension"""
    return '.' in filename and \
        filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def safe_delete_file(filepath, max_retries=10, retry_delay=0.2):
    """Safely delete a file with retry logic for Windows file locking issues"""
    if not filepath or not os.path.exists(filepath):
        return True  # File doesn't exist, nothing to delete

    for attempt in range(max_retries):
        try:
            os.remove(filepath)
            return True
        except (OSError, PermissionError) as e:
            if attempt < max_retries - 1:
                # Exponential backoff with longer delays
                delay = retry_delay * (2 ** attempt)  # Exponential: 0.2s, 0.4s, 0.8s, 1.6s, etc.
                time.sleep(delay)
                gc.collect()  # Force garbage collection to release file handles
            else:
                print(f"Warning: Could not delete file {filepath} after {max_retries} attempts: {e}")
                return False
    return True


def predict_drone(audio_path):
    """Predict if audio contains a drone"""
    global _model_load_error
    # Try to load model if not loaded
    if not load_model():
        error_msg = _model_load_error or "Model not loaded"
        return None, None, error_msg

    try:
        # Import here to avoid import errors if model loading failed
        import librosa
        import torch
        import gc

        # Set torch to use less memory
        torch.set_num_threads(1)  # Use single thread to reduce memory

        # Load audio at the model's expected SR (16 kHz)
        # Limit audio length to reduce memory usage (max 10 seconds)
        audio, sr = librosa.load(audio_path, sr=16000, mono=True, duration=10.0)

        # Convert audio to HF input format
        inputs = extractor(
            audio,
            sampling_rate=16000,
            return_tensors="pt"
        )

        # Move inputs to CPU explicitly (model should already be on CPU)
        inputs = {k: v.cpu() if isinstance(v, torch.Tensor) else v for k, v in inputs.items()}

        # Run inference with memory optimizations
        with torch.no_grad():
            # Set model to eval mode and disable gradient tracking
            model.eval()
            logits = model(**inputs).logits

        # Convert to probabilities
        probs = torch.softmax(logits, dim=-1)[0]

        # Get predicted class
        pred_id = int(torch.argmax(probs))
        label = model.config.id2label[pred_id]
        confidence = float(probs[pred_id])

        # Clear cache and free memory
        del inputs, logits, probs, audio
        torch.cuda.empty_cache() if torch.cuda.is_available() else None
        gc.collect()

        return label, confidence, None

    except Exception as e:
        import traceback
        traceback.print_exc()
        # Clean up on error
        import gc
        gc.collect()
        return None, None, str(e)


@app.route('/', methods=['GET', 'OPTIONS'])
def home():
    """Health check endpoint"""
    global model, extractor, _model_load_error
    model_status = "loaded" if (model is not None and extractor is not None) else "not loaded"
    if _model_load_error:
        model_status = f"error: {_model_load_error[:100]}"  # Truncate long errors

    return jsonify({
        'status': 'success',
        'message': 'MP3 Upload Server is running',
        'model_status': model_status,
        'timestamp': datetime.utcnow().isoformat(),
        'cors_enabled': True
    })


@app.route('/test', methods=['GET', 'OPTIONS'])
def test_connection():
    """Simple test endpoint to verify frontend can connect"""
    if request.method == 'OPTIONS':
        # Handle preflight request
        response = jsonify({'status': 'ok'})
        return response

    return jsonify({
        'status': 'success',
        'message': 'Connection test successful',
        'server': 'Flask backend',
        'timestamp': datetime.utcnow().isoformat()
    })


@app.before_request
def log_request_info():
    """Log request details for debugging"""
    print(f"\n{'=' * 60}")
    print(f"Request: {request.method} {request.path}")
    print(f"Origin: {request.headers.get('Origin', 'N/A')}")
    print(f"Content-Type: {request.headers.get('Content-Type', 'N/A')}")
    print(f"URL: {request.url}")
    if request.method == 'OPTIONS':
        print("This is a CORS preflight request")
    print(f"{'=' * 60}\n")


@app.route('/upload', methods=['POST'])
def upload_file():
    """Handle audio file upload and convert to WAV"""
    try:
        # Check if file is present in request
        if 'audio' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['audio']

        # Check if file is selected
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Validate file extension
        if not allowed_file(file.filename):
            return jsonify({
                'error': 'Invalid file type. Allowed formats: WAV, MP3, M4A, AAC, OGG, FLAC'
            }), 400

        # Generate unique filename
        original_filename = secure_filename(file.filename)
        file_extension = original_filename.rsplit('.', 1)[1].lower()
        temp_filename = f"{uuid.uuid4()}.{file_extension}"
        temp_filepath = os.path.join(app.config['UPLOAD_FOLDER'], temp_filename)

        # Save temporarily
        file.save(temp_filepath)

        try:
            # Convert to WAV format (standard for ML/Audio processing)
            wav_filename = f"{uuid.uuid4()}.wav"
            wav_filepath = os.path.join(app.config['UPLOAD_FOLDER'], wav_filename)

            # Load audio file
            audio = AudioSegment.from_file(temp_filepath)

            # Convert to WAV: 16kHz, mono channel (standard for ML)
            audio.set_frame_rate(16000).set_channels(1).export(wav_filepath, format="wav")

            # Explicitly delete audio object to release file handles
            del audio
            gc.collect()

            # Add delay to allow Windows to release file handles from ffmpeg/ffprobe
            time.sleep(0.5)

            # Get file size
            file_size = os.path.getsize(wav_filepath)

            # Run drone detection prediction
            prediction_label = None
            prediction_confidence = None
            prediction_error = None

            try:
                prediction_label, prediction_confidence, prediction_error = predict_drone(wav_filepath)
            except Exception as pred_error:
                print(f"Prediction error: {str(pred_error)}")
                prediction_error = str(pred_error)

            # Clean up original file using safe delete
            safe_delete_file(temp_filepath)

            # Build response
            response_data = {
                'status': 'success',
                'message': 'File uploaded and converted successfully',
                'filename': original_filename,
                'saved_as': wav_filename,
                'wav_path': wav_filepath,
                'size': file_size,
                'timestamp': datetime.utcnow().isoformat()
            }

            # Add prediction data if available
            if prediction_label is not None and prediction_confidence is not None:
                response_data['prediction'] = {
                    'label': prediction_label,
                    'confidence': round(prediction_confidence * 100, 2)  # Convert to percentage
                }
            elif prediction_error:
                response_data['prediction_error'] = prediction_error

            return jsonify(response_data), 200

        except Exception as conversion_error:
            # Clean up on conversion error
            safe_delete_file(temp_filepath)
            raise conversion_error

    except Exception as e:
        print(f"Error uploading file: {str(e)}")
        return jsonify({
            'error': f'Server error: {str(e)}'
        }), 500


def load_umx_model():
    """Lazy load the OpenUnmix model and cache it globally"""
    global umx_model, _umx_model_loading, _umx_model_load_error

    if umx_model is not None:
        return True  # Already loaded

    if _umx_model_loading:
        return False  # Currently loading

    if _umx_model_load_error:
        return False  # Previous load failed

    try:
        _umx_model_loading = True

        # Import here to avoid startup crashes
        import openunmix

        # Load UMX model
        umx_model = openunmix.umxhq(pretrained=True).eval()

        # Move to CPU and disable gradients
        umx_model = umx_model.cpu()
        for param in umx_model.parameters():
            param.requires_grad = False

        _umx_model_loading = False
        print("OpenUnmix model loaded successfully")
        return True

    except ImportError:
        error_msg = "openunmix is not installed. Please install it with: pip install openunmix"
        print(error_msg)
        _umx_model_load_error = error_msg
        _umx_model_loading = False
        umx_model = None
        return False
    except Exception as e:
        error_msg = f"Error loading OpenUnmix model: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        _umx_model_load_error = error_msg
        _umx_model_loading = False
        umx_model = None
        return False


@app.route('/denoise', methods=['POST'])
def denoise_audio():
    """Denoise audio using openunmix to extract drone sounds"""
    global umx_model, _umx_model_load_error

    try:
        # Check if file is present in request
        if 'audio' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['audio']

        # Check if file is selected
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Validate file extension
        if not allowed_file(file.filename):
            return jsonify({
                'error': 'Invalid file type. Allowed formats: WAV, MP3, M4A, AAC, OGG, FLAC'
            }), 400

        # Generate unique filename for input
        original_filename = secure_filename(file.filename)
        file_extension = original_filename.rsplit('.', 1)[1].lower()
        temp_filename = f"{uuid.uuid4()}.{file_extension}"
        temp_filepath = os.path.join(app.config['UPLOAD_FOLDER'], temp_filename)

        # Save temporarily
        file.save(temp_filepath)

        try:
            # Try to load model if not loaded
            if not load_umx_model():
                error_msg = _umx_model_load_error or "OpenUnmix model not loaded"
                safe_delete_file(temp_filepath)
                return jsonify({
                    'error': f'Model loading failed: {error_msg}'
                }), 500

            # Generate output filename
            output_filename = f"{uuid.uuid4()}_denoised.wav"
            output_filepath = os.path.join(app.config['UPLOAD_FOLDER'], output_filename)

            # ------------------------
            # Load mono audio
            # ------------------------
            y, sr_old = librosa.load(temp_filepath, sr=None, mono=True)

            # ------------------------
            # Resample to 44.1 kHz for UMX
            # ------------------------
            if sr_old != 44100:
                y = librosa.resample(y, orig_sr=sr_old, target_sr=44100)
            sr = 44100

            # ------------------------
            # UMX requires stereo → duplicate mono channel
            # ------------------------
            y_stereo = np.stack([y, y], axis=0).astype(np.float32)  # (2, T)

            # Shape for model: (batch=1, channels=2, samples=T)
            audio_tensor = torch.tensor(y_stereo)[None, :, :]

            # ------------------------
            # Run separation
            # ------------------------
            print(f"Running separation on audio tensor shape: {audio_tensor.shape}")
            with torch.no_grad():
                separated = umx_model(audio_tensor)

            print("UMX output shape:", separated.shape)
            # expected: (1, 4, 2, T)

            # ------------------------
            # Extract "OTHER" stem (index 3)
            # ------------------------
            other = separated[0, 3].cpu().numpy()  # shape (2, T)

            # Convert stereo to mono
            other_mono = other.mean(axis=0)

            # ------------------------
            # Match loudness to original audio
            # ------------------------
            orig_rms = np.sqrt(np.mean(y ** 2))
            out_rms = np.sqrt(np.mean(other_mono ** 2))
            if out_rms > 0:
                gain = orig_rms / out_rms
                other_mono = other_mono * gain

            # ------------------------
            # Save
            # ------------------------
            sf.write(output_filepath, other_mono, sr)
            print("Saved:", output_filepath)

            # Clean up temporary input file
            safe_delete_file(temp_filepath)

            # Clean up tensors to free memory
            del y, y_stereo, audio_tensor, separated, other, other_mono
            gc.collect()

            # Return JSON with file URL - frontend will fetch the file using this URL
            return jsonify({
                'status': 'success',
                'message': 'Audio denoised successfully',
                'filename': output_filename,
                'url': f'/uploads/{output_filename}'
            }), 200

        except Exception as denoise_error:
            # Clean up on error
            safe_delete_file(temp_filepath)
            error_msg = str(denoise_error)
            print(f"Denoising error: {error_msg}")
            import traceback
            traceback.print_exc()
            # Return more detailed error message
            return jsonify({
                'error': f'Denoising failed: {error_msg}'
            }), 500

    except Exception as e:
        print(f"Error in denoise endpoint: {str(e)}")
        return jsonify({
            'error': f'Server error: {str(e)}'
        }), 500


@app.route('/uploads/<filename>', methods=['GET'])
def serve_upload(filename):
    """Serve uploaded/processed audio files"""
    try:
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if os.path.exists(filepath) and os.path.isfile(filepath):
            return send_file(filepath, mimetype='audio/wav')
        else:
            return jsonify({'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'error': f'Server error: {str(e)}'}), 500


@app.route('/files', methods=['GET'])
def list_files():
    """List all uploaded files"""
    try:
        files = []
        if os.path.exists(UPLOAD_FOLDER):
            for filename in os.listdir(UPLOAD_FOLDER):
                filepath = os.path.join(UPLOAD_FOLDER, filename)
                if os.path.isfile(filepath):
                    files.append({
                        'filename': filename,
                        'size': os.path.getsize(filepath),
                        'modified': datetime.fromtimestamp(
                            os.path.getmtime(filepath)
                        ).isoformat()
                    })

        return jsonify({
            'status': 'success',
            'files': files,
            'count': len(files)
        }), 200

    except Exception as e:
        return jsonify({
            'error': f'Server error: {str(e)}'
        }), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"\n{'=' * 60}")
    print("Flask Server Starting...")
    print(f"Available routes:")
    print(f"  GET  / - Health check")
    print(f"  POST /upload - Upload audio file")
    print(f"  POST /denoise - Denoise audio using openunmix")
    print(f"  GET  /files - List uploaded files")
    print(f"  GET  /uploads/<filename> - Serve audio files")
    print(f"{'=' * 60}\n")
    app.run(host='0.0.0.0', port=port, debug=False)

# For cloud platforms that need PORT from environment
# The Procfile/gunicorn will handle this automatically
