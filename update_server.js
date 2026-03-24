const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

content = content.replace('let latestLocation = null;', 'let latestLocations = {};');
content = content.replace('let locationHistory = [];', 'let locationHistory = {};');

content = content.replace("app.post('/location', (req, res) => {", "app.post('/location', (req, res) => {\n    const deviceId = req.body.deviceId || 'default';");

content = content.replace('if (latestLocation) {', 'let previousLocation = latestLocations[deviceId];\n        if (previousLocation) {');

content = content.replace('const timeDiff = (ts - latestLocation.timestamp) / 1000;', 'const timeDiff = (ts - previousLocation.timestamp) / 1000;');

content = content.replace('const dist = getDistanceInMeters(latestLocation.latitude, latestLocation.longitude, latitude, longitude);', 'const dist = getDistanceInMeters(previousLocation.latitude, previousLocation.longitude, latitude, longitude);');

content = content.replace('if (locationHistory.length === 0) {', 'if (!locationHistory[deviceId]) locationHistory[deviceId] = [];\n        let history = locationHistory[deviceId];\n        if (history.length === 0) {');

content = content.replace('const lastHist = locationHistory[locationHistory.length - 1];', 'const lastHist = history[history.length - 1];');

content = content.replace('if (addToHistory) {\n            locationHistory.push(newLocation);\n        }', 'if (addToHistory) {\n            history.push(newLocation);\n        }');

content = content.replace('latestLocation = newLocation;', 'latestLocations[deviceId] = newLocation;');

content = content.replace('locationHistory = locationHistory.filter(loc => loc.timestamp >= twentyFourHoursAgo);', 'locationHistory[deviceId] = history.filter(loc => loc.timestamp >= twentyFourHoursAgo);');

content = content.replace('console.log([] GPS Update', 'console.log([] [] GPS Update');

content = content.replace("app.get('/location', (req, res) => {\n    if (latestLocation) {\n        res.status(200).json(latestLocation);\n    } else {\n        res.status(404).json({ message: \"No location data received from Android yet.\" });\n    }\n});", "app.get('/locations', (req, res) => {\n    res.status(200).json(latestLocations);\n});\n\n// Legacy endpoint for backward compatibility during transition\napp.get('/location', (req, res) => {\n    const keys = Object.keys(latestLocations);\n    if (keys.length > 0) {\n        res.status(200).json(latestLocations[keys[0]]);\n    } else {\n        res.status(404).json({ message: \"No location data received from Android yet.\" });\n    }\n});");

content = content.replace("app.get('/history', (req, res) => {\n    res.status(200).json(locationHistory);\n});", "app.get('/history', (req, res) => {\n    const deviceId = req.query.deviceId || 'default';\n    res.status(200).json(locationHistory[deviceId] || []);\n});\napp.get('/all_history', (req, res) => {\n    res.status(200).json(locationHistory);\n});");

fs.writeFileSync('server2.js', content);
console.log("Done");
