const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

let latestLocations = {};
let locationHistory = {};
let appConfig = { mode: 'current' };

function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

app.post('/location', (req, res) => {
    const { latitude, longitude, timestamp, deviceId } = req.body;
    const devId = deviceId || 'default';
    
    if (latitude !== undefined && longitude !== undefined) {
        const ts = timestamp || Date.now();
        let speed = 0;
        
        let previousLocation = latestLocations[devId];
        if (previousLocation) {
            const timeDiff = (ts - previousLocation.timestamp) / 1000;
            const dist = getDistanceInMeters(previousLocation.latitude, previousLocation.longitude, latitude, longitude);
            if (timeDiff > 0) speed = (dist / timeDiff) * 3.6;
        }

        const newLocation = { latitude, longitude, timestamp: ts, speed, receivedAt: new Date().toISOString() };
        
        if (!locationHistory[devId]) locationHistory[devId] = [];
        let history = locationHistory[devId];
        
        let addToHistory = false;
        if (history.length === 0) {
            addToHistory = true;
        } else {
            const lastHist = history[history.length - 1];
            const distFromLastHist = getDistanceInMeters(lastHist.latitude, lastHist.longitude, latitude, longitude);
            if (distFromLastHist >= 2) addToHistory = true;
        }
        
        if (addToHistory) history.push(newLocation);
        
        latestLocations[devId] = newLocation;
        
        const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
        locationHistory[devId] = history.filter(loc => loc.timestamp >= twentyFourHoursAgo);

        console.log(`[${newLocation.receivedAt}] [${devId}] GPS Update \t Lat: ${latitude} \t Lng: ${longitude} \t Speed: ${speed.toFixed(1)} km/h`);
        res.status(200).json({ success: true, message: "Location received successfully" });
    } else {
        res.status(400).json({ success: false, message: "Invalid payload: missing latitude or longitude" });
    }
});

app.get('/locations', (req, res) => {
    res.status(200).json(latestLocations);
});

app.get('/location', (req, res) => {
    const keys = Object.keys(latestLocations);
    if (keys.length > 0) res.status(200).json(latestLocations[keys[0]]);
    else res.status(404).json({ message: "No location data received from Android yet." });
});

app.get('/history', (req, res) => {
    const devId = req.query.deviceId || 'default';
    res.status(200).json(locationHistory[devId] || []);
});

app.get('/all_history', (req, res) => {
    res.status(200).json(locationHistory);
});

app.get('/config', (req, res) => res.status(200).json(appConfig));

app.post('/config', (req, res) => {
    if (req.body && req.body.mode) {
        appConfig.mode = req.body.mode;
        res.status(200).json({ success: true, mode: appConfig.mode });
    } else res.status(400).json({ success: false, message: "Invalid payload" });
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
            position: absolute; top: 10px; right: 10px; z-index: 1000; 
            background: white; padding: 15px; border-radius: 8px; box-shadow: 0 0 15px rgba(0,0,0,0.3); min-width: 200px;
        }
        .controls { margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee; font-size: 14px; }
        .controls label { display: flex; align-items: center; cursor: pointer; font-weight: bold; margin-bottom: 8px; }
        .controls input { margin-right: 8px; width: 16px; height: 16px; }
        .controls select { width: 100%; padding: 5px; margin-top: 10px; border-radius: 4px; }
    </style>
</head>
<body>
    <div id="status">
        <div id="status-text">Waiting for GPS Fix from Android App...</div>
        <div class="controls">
            <label><input type="checkbox" id="show-history" onchange="toggleHistory()"> Show Path Trail</label>
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
        var osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
        var googleSat = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 20 });
        var googleDefault = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20 });
        var darkMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 });

        var map = L.map('map', { layers: [osmLayer] }).setView([0, 0], 2);
        
        var baseMaps = { "OSM Default": osmLayer, "Google Satellite": googleSat, "Google Default": googleDefault, "Dark Map": darkMap };
        L.control.layers(baseMaps).addTo(map);

        var markers = {};
        var accuracyCircles = {};
        var polylines = {};
        var showHistory = false;
        var lastPathLat = {};
        var lastPathLng = {};

        function getDistanceMeters(lat1, lon1, lat2, lon2) {
            const R = 6371000;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }

        function toggleHistory() {
            showHistory = document.getElementById('show-history').checked;
            if (showHistory) {
                fetchHistory();
            } else {
                Object.keys(polylines).forEach(id => map.removeLayer(polylines[id]));
                polylines = {}; lastPathLat = {}; lastPathLng = {};
            }
        }

        function fetchHistory() {
            if (!showHistory) return;
            fetch('/all_history').then(res => res.json()).then(allData => {
                Object.keys(allData).forEach(deviceId => {
                    var latlngs = allData[deviceId].map(d => [d.latitude, d.longitude]);
                    if (latlngs.length > 0) { lastPathLat[deviceId] = latlngs[latlngs.length-1][0]; lastPathLng[deviceId] = latlngs[latlngs.length-1][1]; }
                    const colors = ['blue', 'red', 'green', 'purple', 'orange', 'darkred', 'darkblue', 'cadetblue'];
                    let charSum = deviceId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                    let color = colors[charSum % colors.length];
                    if (polylines[deviceId]) polylines[deviceId].setLatLngs(latlngs);
                    else polylines[deviceId] = L.polyline(latlngs, {color: color, weight: 4, opacity: 0.7}).addTo(map);
                });
            });
        }

        function syncConfig() {
            fetch('/config').then(res => res.json()).then(data => document.getElementById('mode-select').value = data.mode);
        }

        function changeMode() {
            fetch('/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: document.getElementById('mode-select').value }) });
        }

        function updateLocation() {
            fetch('/locations').then(res => res.json()).then(allData => {
                if (Object.keys(allData).length === 0) return;
                let statusHtml = "<b>Live Devices:</b><br>";
                Object.keys(allData).forEach(deviceId => {
                    let data = allData[deviceId];
                    if (data && data.latitude !== undefined) {
                        const latLng = [data.latitude, data.longitude];
                        if (!markers[deviceId]) {
                            let devIcon = L.divIcon({
                                className: 'custom-div-icon',
                                html: "<div style='background-color:#4285F4; width:15px; height:15px; border-radius:50%; border:3px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);'></div>" +
                                      "<div style='margin-left: 20px; margin-top: -15px; background: rgba(255,255,255,0.8); padding: 2px 5px; border-radius: 4px; font-size: 10px; font-weight: bold; white-space: nowrap;'>" + (deviceId==='default'?'Unknown':deviceId).substring(0, 8) + "</div>",
                                iconSize: [21, 21], iconAnchor: [10, 10]
                            });
                            markers[deviceId] = L.marker(latLng, {icon: devIcon}).addTo(map);
                            accuracyCircles[deviceId] = L.circle(latLng, {color: '#4285F4', fillColor: '#4285F4', fillOpacity: 0.15, radius: 50}).addTo(map);
                            if (Object.keys(markers).length === 1) map.setView(latLng, 16);
                        } else {
                            markers[deviceId].setLatLng(latLng);
                            if (accuracyCircles[deviceId]) accuracyCircles[deviceId].setLatLng(latLng);
                        }

                        if (showHistory && polylines[deviceId]) {
                            if (lastPathLat[deviceId] == null) {
                                polylines[deviceId].addLatLng(latLng); lastPathLat[deviceId] = data.latitude; lastPathLng[deviceId] = data.longitude;
                            } else {
                                let dist = getDistanceMeters(lastPathLat[deviceId], lastPathLng[deviceId], data.latitude, data.longitude);
                                if (dist >= 50) { polylines[deviceId].addLatLng(latLng); lastPathLat[deviceId] = data.latitude; lastPathLng[deviceId] = data.longitude; }
                            }
                        }
                        statusHtml += "<small>" + (deviceId==='default'?'Dev':deviceId.substring(0,8)) + ": " + data.latitude.toFixed(4) + ", " + data.longitude.toFixed(4) + " | " + (data.speed ? data.speed.toFixed(1) : "0.0") + " km/h</small><br>";
                    }
                });
                document.getElementById('status-text').innerHTML = statusHtml;
            });
        }

        setInterval(updateLocation, 5000);
        setInterval(syncConfig, 10000);
        updateLocation(); syncConfig();
    </script>
</body>
</html>`);
});

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
