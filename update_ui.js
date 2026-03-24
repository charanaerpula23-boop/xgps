const fs = require('fs');
let content = fs.readFileSync('server2.js', 'utf8');

const oldVars = \        var marker = null;
        var accuracyCircle = null;
        var polyline = null;
        var showHistory = false;
        var lastPathLat = null;
        var lastPathLng = null;\;

const newVars = \        var markers = {};
        var accuracyCircles = {};
        var polylines = {};
        var showHistory = false;
        var lastPathLat = {};
        var lastPathLng = {};\;

content = content.replace(oldVars, newVars);


let oldToggleHistory = \        function toggleHistory() {
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
        }\;

let newToggleHistory = \        function toggleHistory() {
            showHistory = document.getElementById('show-history').checked;
            if (showHistory) {
                fetchHistory();
            } else {
                Object.keys(polylines).forEach(id => map.removeLayer(polylines[id]));
                polylines = {};
                lastPathLat = {};
                lastPathLng = {};
            }
        }\;

content = content.replace(oldToggleHistory, newToggleHistory);

let oldFetchHistory = \        function fetchHistory() {
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
        }\;

let newFetchHistory = \        function fetchHistory() {
            if (!showHistory) return;
            fetch('/all_history')
                .then(res => res.json())
                .then(allData => {
                    Object.keys(allData).forEach(deviceId => {
                        var data = allData[deviceId];
                        var latlngs = data.map(d => [d.latitude, d.longitude]);
                        if (latlngs.length > 0) {
                            var lastItem = latlngs[latlngs.length - 1];
                            lastPathLat[deviceId] = lastItem[0];
                            lastPathLng[deviceId] = lastItem[1];
                        }
                        if (polylines[deviceId]) {
                            polylines[deviceId].setLatLngs(latlngs);
                        } else {
                            // Assign random colors based on deviceId length/characters
                            const colors = ['blue', 'red', 'green', 'purple', 'orange', 'darkred', 'darkblue', 'cadetblue'];
                            let charSum = deviceId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                            let color = colors[charSum % colors.length];
                            
                            polylines[deviceId] = L.polyline(latlngs, {color: color, weight: 4, opacity: 0.7}).addTo(map);
                        }
                    });
                });
        }\;

content = content.replace(oldFetchHistory, newFetchHistory);

let oldUpdateLocation = \        function updateLocation() {
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
                        
                        document.getElementById('status-text').innerHTML = 
                            "<b>Live:</b> " + data.latitude.toFixed(5) + ", " + data.longitude.toFixed(5) + 
                            " <br><small>Speed: " + (data.speed ? data.speed.toFixed(1) : "0.0") + " km/h | Mode: " + 
                            document.getElementById('mode-select').value + "</small>";
                    }
                })
                .catch(err => {
                    // console.error(err);
                });
        }\;

let newUpdateLocation = \        function updateLocation() {
            fetch('/locations')
                .then(response => {
                    if(!response.ok) throw new Error("No data");
                    return response.json();
                })
                .then(allData => {
                    if (Object.keys(allData).length === 0) return;
                    
                    let statusHtml = "<b>Live Devices:</b><br>";
                    
                    Object.keys(allData).forEach(deviceId => {
                        let data = allData[deviceId];
                        if (data && data.latitude !== undefined) {
                            const latLng = [data.latitude, data.longitude];
                            
                            if (!markers[deviceId]) {
                                let labelTitle = deviceId === 'default' ? 'Unknown' : deviceId;
                                let devIcon = L.divIcon({
                                    className: 'custom-div-icon',
                                    html: "<div style='background-color:#4285F4; width:15px; height:15px; border-radius:50%; border:3px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);'></div>" +
                                          "<div style='margin-left: 20px; margin-top: -15px; background: rgba(255,255,255,0.8); padding: 2px 5px; border-radius: 4px; font-size: 10px; font-weight: bold; white-space: nowrap;'>" + labelTitle.substring(0, 8) + "</div>",
                                    iconSize: [21, 21],
                                    iconAnchor: [10, 10]
                                });
                                
                                markers[deviceId] = L.marker(latLng, {icon: devIcon}).addTo(map);
                                accuracyCircles[deviceId] = L.circle(latLng, {
                                    color: '#4285F4',
                                    fillColor: '#4285F4',
                                    fillOpacity: 0.15,
                                    radius: 50
                                }).addTo(map);
                                
                                // Auto-center only on the first device found for simplicity
                                if (Object.keys(markers).length === 1) {
                                    map.setView(latLng, 16);
                                }
                            } else {
                                markers[deviceId].setLatLng(latLng);
                                if (accuracyCircles[deviceId]) accuracyCircles[deviceId].setLatLng(latLng);
                            }

                            // Appends dynamic trailing dots live - obeying the 50m rule
                            if (showHistory && polylines[deviceId]) {
                                if (lastPathLat[deviceId] == null) {
                                    polylines[deviceId].addLatLng(latLng);
                                    lastPathLat[deviceId] = data.latitude;
                                    lastPathLng[deviceId] = data.longitude;
                                } else {
                                    let dist = getDistanceMeters(lastPathLat[deviceId], lastPathLng[deviceId], data.latitude, data.longitude);
                                    if (dist >= 50) {
                                        polylines[deviceId].addLatLng(latLng);
                                        lastPathLat[deviceId] = data.latitude;
                                        lastPathLng[deviceId] = data.longitude;
                                    }
                                }
                            }
                            
                            statusHtml += "<small>" + (deviceId === 'default' ? 'Dev' : deviceId.substring(0,8)) + ": " + 
                                data.latitude.toFixed(4) + ", " + data.longitude.toFixed(4) + 
                                " | " + (data.speed ? data.speed.toFixed(1) : "0.0") + " km/h</small><br>";
                        }
                    });
                    
                    document.getElementById('status-text').innerHTML = statusHtml;
                })
                .catch(err => {
                    // console.error(err);
                });
        }\;

content = content.replace(oldUpdateLocation, newUpdateLocation);

fs.writeFileSync('server.js', content);
console.log("Done overwriting server.js");
