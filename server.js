const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse incoming JSON bodies
app.use(express.json());

// In-memory store for the latest location and history
let latestLocation = null;
let locationHistory = [];
let appConfig = { mode: 'current' }; // Modes: 'current', 'stationary', 'high_precision'

function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// POST Endpoint: The Android App calls this every 5 seconds (when Sharing is ON)
app.post('/location', (req, res) => {
    const { latitude, longitude, timestamp } = req.body;
    
    if (latitude !== undefined && longitude !== undefined) {
        const ts = timestamp || Date.now();
        let speed = 0;
        
        // Calculate speed based on distance traveled since the last poll
        if (latestLocation) {
            const timeDiff = (ts - latestLocation.timestamp) / 1000; // seconds
            const dist = getDistanceInMeters(latestLocation.latitude, latestLocation.longitude, latitude, longitude);
            if (timeDiff > 0) {
                speed = (dist / timeDiff) * 3.6; // convert m/s to km/h
            }
        }

        const newLocation = {
            latitude,
            longitude,
            timestamp: ts,
            speed: speed,
            receivedAt: new Date().toISOString()
        };
        
        // Only log to history if distance > 50m from the last trailed node
        let addToHistory = false;
        if (locationHistory.length === 0) {
            addToHistory = true;
        } else {
            const lastHist = locationHistory[locationHistory.length - 1];
            const distFromLastHist = getDistanceInMeters(lastHist.latitude, lastHist.longitude, latitude, longitude);
            if (distFromLastHist >= 50) {
                addToHistory = true;
            }
        }
        
        if (addToHistory) {
            locationHistory.push(newLocation);
        }
        
        // Update the current known location regardless
        latestLocation = newLocation;
        
        // Keep only the last 24 hours of history to avoid memory bloat
        const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
        locationHistory = locationHistory.filter(loc => loc.timestamp >= twentyFourHoursAgo);

        console.log(`[${latestLocation.receivedAt}] GPS Update \t Lat: ${latitude} \t Lng: ${longitude} \t Speed: ${speed.toFixed(1)} km/h`);
        res.status(200).json({ success: true, message: "Location received successfully" });
    } else {
        console.log("Failed attempt to send location. Payload:", req.body);
        res.status(400).json({ success: false, message: "Invalid payload: missing latitude or longitude" });
    }
});

// GET Endpoint for current location
app.get('/location', (req, res) => {
    if (latestLocation) {
        res.status(200).json(latestLocation);
    } else {
        res.status(404).json({ message: "No location data received from Android yet." });
    }
});

// GET Endpoint for travel history
app.get('/history', (req, res) => {
    res.status(200).json(locationHistory);
});

// Config Endpoints
app.get('/config', (req, res) => {
    res.status(200).json(appConfig);
});

app.post('/config', (req, res) => {
    if (req.body && req.body.mode) {
        appConfig.mode = req.body.mode;
        console.log("Config updated remotely: mode=" + req.body.mode);
        res.status(200).json({ success: true, mode: appConfig.mode });
    } else {
        res.status(400).json({ success: false, message: "Invalid payload" });
    }
});

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Live GPS Tracker</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        body { margin: 0; padding: 0; font-family: sans-serif; }
        #map { width: 100vw; height: 100vh; }
        #status { 
            position: absolute; 
            top: 10px; 
            right: 10px; 
            z-index: 1000; 
            background: white; 
            padding: 15px; 
            border-radius: 8px; 
            box-shadow: 0 0 15px rgba(0,0,0,0.3); 
            min-width: 200px;
        }
        .controls { 
            margin-top: 15px; 
            padding-top: 15px; 
            border-top: 1px solid #eee; 
            font-size: 14px; 
        }
        .controls label {
            display: flex;
            align-items: center;
            cursor: pointer;
            font-weight: bold;
            margin-bottom: 8px;
        }
        .controls input {
            margin-right: 8px;
            width: 16px;
            height: 16px;
        }
        .controls select {
            width: 100%;
            padding: 5px;
            margin-top: 10px;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div id="status">
        <div id="status-text">Waiting for GPS Fix from Android App...</div>
        <div class="controls">
            <label>
                <input type="checkbox" id="show-history" onchange="toggleHistory()"> 
                Show Path Trail
            </label>
            <label>Tracking Mode: </label>
            <select id="mode-select" onchange="changeMode()">
                <option value="current">Current (Standard)</option>
                <option value="stationary">Stationary (50m Avg)</option>
                <option value="high_precision">High Precision</option>
            </select>
        </div>
    </div>
    <div id="map"></div>
    <script>
        var osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        });
        
        var googleSat = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            attribution: '© Google Images'
        });

        var map = L.map('map', {
            layers: [osmLayer]
        }).setView([0, 0], 2);
        
        // Add Map type selector control
        var baseMaps = {
            "OSM Default": osmLayer,
            "Google Satellite": googleSat
        };
        L.control.layers(baseMaps).addTo(map);

        var customIcon = L.divIcon({
            className: 'custom-div-icon',
            html: "<div style='background-color:#4285F4; width:15px; height:15px; border-radius:50%; border:3px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);'></div>",
            iconSize: [21, 21],
            iconAnchor: [10, 10]
        });

        var marker = null;
        var accuracyCircle = null;
        var polyline = null;
        var showHistory = false;
        var lastPathLat = null;
        var lastPathLng = null;

        function getDistanceMeters(lat1, lon1, lat2, lon2) {
            const R = 6371000;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                      Math.sin(dLon / 2) * Math.sin(dLon / 2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }

        function toggleHistory() {
            showHistory = document.getElementById('show-history').checked;
            if (showHistory) {
                fetchHistory();
            } else {
                if (polyline) {
                    map.removeLayer(polyline);
                    polyline = null;
                    lastPathLat = null;
                    lastPathLng = null;
                }
            }
        }

        function fetchHistory() {
            if (!showHistory) return;
            fetch('/history')
                .then(res => res.json())
                .then(data => {
                    var latlngs = data.map(d => [d.latitude, d.longitude]);
                    if (latlngs.length > 0) {
                        var lastItem = latlngs[latlngs.length - 1];
                        lastPathLat = lastItem[0];
                        lastPathLng = lastItem[1];
                    }
                    if (polyline) {
                        polyline.setLatLngs(latlngs);
                    } else {
                        polyline = L.polyline(latlngs, {color: 'blue', weight: 4, opacity: 0.7}).addTo(map);
                    }
                });
        }

        function syncConfig() {
            fetch('/config')
                .then(res => res.json())
                .then(data => {
                    document.getElementById('mode-select').value = data.mode;
                });
        }

        function changeMode() {
            const newMode = document.getElementById('mode-select').value;
            fetch('/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: newMode })
            });
        }

        function updateLocation() {
            fetch('/location')
                .then(response => {
                    if(!response.ok) throw new Error("No data");
                    return response.json();
                })
                .then(data => {
                    if (data && data.latitude !== undefined) {
                        const latLng = [data.latitude, data.longitude];
                        if (!marker) {
                            marker = L.marker(latLng, {icon: customIcon}).addTo(map);
                            accuracyCircle = L.circle(latLng, {
                                color: '#4285F4',
                                fillColor: '#4285F4',
                                fillOpacity: 0.15,
                                radius: 50
                            }).addTo(map);
                            map.setView(latLng, 16);
                        } else {
                            marker.setLatLng(latLng);
                            if (accuracyCircle) accuracyCircle.setLatLng(latLng);
                        }

                        // Appends dynamic trailing dots live - obeying the 50m rule
                        if (showHistory && polyline) {
                            if (lastPathLat == null) {
                                polyline.addLatLng(latLng);
                                lastPathLat = data.latitude;
                                lastPathLng = data.longitude;
                            } else {
                                let dist = getDistanceMeters(lastPathLat, lastPathLng, data.latitude, data.longitude);
                                if (dist >= 50) {
                                    polyline.addLatLng(latLng);
                                    lastPathLat = data.latitude;
                                    lastPathLng = data.longitude;
                                }
                            }
                        }

                        let speedKmh = (data.speed || 0).toFixed(1);
                        document.getElementById('status-text').innerHTML = "<b>Live Tracking</b><br>Lat: " + data.latitude.toFixed(6) + "<br>Lng: " + data.longitude.toFixed(6) + "<br>Speed: " + speedKmh + " km/h<br>Updated: " + new Date(data.timestamp).toLocaleTimeString();
                    }
                })
                .catch(err => {
                    // Fail silently while waiting for valid fix
                });
        }

        setInterval(updateLocation, 2500);
        setInterval(fetchHistory, 15000); // Sync full path periodically
        setInterval(syncConfig, 5000); // Poll config changes occasionally
        updateLocation();
        syncConfig();
    </script>
</body>
</html>`);
});

app.listen(PORT, () => {
    console.log(`\n===========================================`);
    console.log(`🌎 Location Server is Running!`);
    console.log(`Listening for Android GPS Updates on Port ${PORT}`);
    console.log(`===========================================\n`);
    

});
