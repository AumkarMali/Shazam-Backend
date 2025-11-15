# MP3 File Upload App

A React application that allows users to upload MP3 files, with automatic upload to a Python Flask server running on Heroku.

## Features

- 🎵 **MP3 File Upload**: Drag and drop or click to browse
- 📤 **Automatic Upload**: Files are automatically sent to Heroku server on selection
- 🎧 **Audio Preview**: Built-in audio player to preview uploaded files
- ⚡ **Real-time Status**: Upload progress and status indicators
- 🔄 **Retry Functionality**: Retry failed uploads with a single click
- 📱 **Responsive Design**: Works on desktop and mobile devices

## Project Structure

```
.
├── src/                 # React frontend
│   ├── App.jsx         # Main app component
│   ├── App.css         # Styles
│   └── main.jsx        # Entry point
├── server/             # Python Flask backend
│   ├── app.py          # Flask server
│   ├── requirements.txt # Python dependencies
│   ├── Procfile        # Heroku deployment config
│   └── runtime.txt     # Python version
└── DEPLOYMENT.md       # Deployment guide
```

## Quick Start

### Frontend (React)

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Create `.env` file** (optional, already configured with default):
   ```bash
   VITE_HEROKU_API_URL=https://shazam-backend-045431d25692.herokuapp.com
   ```
   The app is already configured to use the Heroku backend by default.

3. **Run development server**:
   ```bash
   npm run dev
   ```

4. **Build for production**:
   ```bash
   npm run build
   ```

### Backend (Python Flask)

See `server/README.md` and `DEPLOYMENT.md` for detailed instructions.

**Quick deployment to Heroku**:
```bash
cd server
heroku create your-app-name
git init
git add .
git commit -m "Initial commit"
git push heroku main
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
VITE_HEROKU_API_URL=https://shazam-backend-045431d25692.herokuapp.com
```

**Current Backend URL**: https://shazam-backend-045431d25692.herokuapp.com/

**Important**: 
- The app is already configured with the default Heroku URL
- Restart your dev server after changing `.env` file
- For production deployments, set environment variables in your hosting platform's dashboard

## API Endpoints

### POST /upload
Upload an MP3 file to the server.

**Request:**
- Content-Type: `multipart/form-data`
- Body: `audio` (file)

**Response:**
```json
{
  "status": "success",
  "message": "File uploaded successfully",
  "filename": "song.mp3",
  "saved_as": "uuid.mp3",
  "size": 1234567,
  "timestamp": "2024-01-01T12:00:00"
}
```

### GET /
Health check endpoint.

### GET /files
List all uploaded files.

## Deployment

See `DEPLOYMENT.md` for complete deployment instructions.

### Frontend Deployment Options
- Vercel
- Netlify
- GitHub Pages
- Any static hosting service

### Backend Deployment
- Heroku (configured)
- Any Python hosting service

## Technologies Used

- **Frontend**: React, Vite
- **Backend**: Python, Flask, Flask-CORS
- **Deployment**: Heroku (backend)

## Development

### Running Locally

1. **Start the React app**:
   ```bash
   npm run dev
   ```

2. **Start the Python server** (in another terminal):
   ```bash
   cd server
   pip install -r requirements.txt
   python app.py
   ```

3. **Update `.env`** to point to local server:
   ```env
   VITE_HEROKU_API_URL=http://localhost:5000
   ```

## Troubleshooting

### CORS Issues
- Make sure Flask-CORS is enabled in `server/app.py`
- Verify your Heroku app URL is correct in `.env` file

### File Upload Fails
- Check browser console for errors
- Check Heroku logs: `heroku logs --tail`
- Verify file size is under 50MB
- Verify file is a valid MP3 file

### Environment Variables Not Working
- Make sure `.env` file is in the root directory
- Restart your dev server after changing `.env`
- For production, set environment variables in your hosting platform

## License

MIT
