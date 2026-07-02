# Render Deployment Guide

## Quick Start

Follow these steps to deploy **Swarm Rescue Ops** on Render:

### 1. Push to GitHub
```bash
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

### 2. Connect to Render
1. Go to [render.com](https://render.com) and sign up/login
2. Click **"New +"** → **"Web Service"**
3. Select **"Deploy an existing Git repository"**
4. Authorize GitHub and select your repository

### 3. Configure the Web Service
- **Name**: `swarm-rescue-ops` (or your preferred name)
- **Runtime**: Node
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: Free (or Paid if you need better performance)

### 4. Environment Variables
Add these in the **Environment** section:
```
NODE_ENV=production
```

The `PORT` variable is automatically provided by Render.

### 5. Deploy
Click **"Create Web Service"** and wait for deployment to complete. Your app will be available at:
```
https://swarm-rescue-ops-[random-id].onrender.com
```

## Features Included
✅ Express.js + Socket.io configured for production  
✅ PORT environment variable support (Render provides PORT automatically)  
✅ NODE_ENV production mode  
✅ Node version specified (18.x or 20.x)  
✅ CORS enabled for cross-origin connections  
✅ Static file serving from `/public` directory  
✅ QR code generation endpoint  
✅ Game state management via WebSockets  

## Switching Between Localhost & Render

### Auto-Detection
The app automatically detects whether you're running on:
- **Localhost**: Uses `localhost:3000` 
- **Render**: Uses your Render deployment URL

### Manual Server Override
To manually specify a different server, add the `server` parameter:

```
https://your-render-url.onrender.com/?server=https://different-server.onrender.com
https://your-render-url.onrender.com/client.html?room=XXXX&server=https://different-server.onrender.com
```

This is useful for:
- Testing production server from local machine
- Connecting to a different Render instance
- Cross-server gameplay testing

## Testing After Deployment
1. Open your Render URL in a browser
2. You should see the Host screen
3. Create a room and share the QR code or room code
4. Open `/client.html?room=XXXX` on another device on the same network
5. Start playing!

## Common Issues

### Cold Start
- Free plans on Render spin down after 15 minutes of inactivity
- First request after inactivity may take 30-60 seconds
- Consider upgrading to a Paid plan for better uptime

### WebSocket Connection Issues
- Make sure CORS is enabled (already configured in your code)
- Check browser console for connection errors
- Verify your client connects to the correct Render URL

### Performance
- For production use, consider upgrading to a paid plan
- Monitor your WebSocket connections in Render dashboard
- Check Render logs for any errors

## Monitoring
- View logs: Click your service → **"Logs"**
- Check dashboard for memory/CPU usage
- Monitor active connections via Socket.io debug

## Additional Notes
- The free plan on Render may have connection limits
- For best experience with multiple rooms, use a paid plan
- Data is not persisted (no database configured)
- Each deployment is a fresh instance

For more help, visit [Render Docs](https://render.com/docs)
