package generic.app.xgps

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import generic.app.xgps.service.LocationService
import generic.app.xgps.network.RetrofitClient
import generic.app.xgps.network.ConfigPostData
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope
import generic.app.xgps.ui.theme.XgpsTheme
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.ITileSource
import org.osmdroid.tileprovider.tilesource.OnlineTileSourceBase
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.util.MapTileIndex
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.graphics.Color as AndroidColor
import org.osmdroid.views.overlay.Polyline
import androidx.compose.material3.Switch
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Surface
import androidx.compose.foundation.shape.RoundedCornerShape


fun createCustomMarker(context: Context, color: Int, label: String): Drawable {
    val bitmap = Bitmap.createBitmap(80, 100, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color
    }
    val path = android.graphics.Path()
    path.moveTo(40f, 100f)
    path.lineTo(20f, 60f)
    path.arcTo(android.graphics.RectF(0f, 0f, 80f, 80f), 150f, 240f)
    path.close()
    canvas.drawPath(path, paint)
    
    paint.style = Paint.Style.STROKE
    paint.color = AndroidColor.WHITE
    paint.strokeWidth = 3f
    canvas.drawPath(path, paint)

    paint.style = Paint.Style.FILL
    paint.textSize = 28f
    paint.textAlign = Paint.Align.CENTER
    val title = if (label.length >= 2) label.substring(0, 2).uppercase() else label.uppercase()
    canvas.drawText(title, 40f, 48f, paint)

    return BitmapDrawable(context.resources, bitmap)
}

fun getColorForDevice(deviceId: String): Int {
    val colors = listOf(
        AndroidColor.parseColor("#E53935"),
        AndroidColor.parseColor("#1E88E5"),
        AndroidColor.parseColor("#43A047"),
        AndroidColor.parseColor("#EC407A"),
        AndroidColor.parseColor("#F4511E"),
        AndroidColor.parseColor("#00ACC1")
    )
    val sum = deviceId.map { it.code }.sum()
    return colors[sum % colors.size]
}






object MapSources {
    val GoogleDefault = object : OnlineTileSourceBase(
        "Google-Default",
        0, 20, 256, ".png",
        arrayOf(
            "https://mt0.google.com/vt/lyrs=m&x=",
            "https://mt1.google.com/vt/lyrs=m&x=",
            "https://mt2.google.com/vt/lyrs=m&x=",
            "https://mt3.google.com/vt/lyrs=m&x="
        )
    ) {
        override fun getTileURLString(pMapTileIndex: Long): String {
            return (baseUrl + MapTileIndex.getX(pMapTileIndex) + "&y=" +
                    MapTileIndex.getY(pMapTileIndex) + "&z=" + MapTileIndex.getZoom(pMapTileIndex))
        }
    }

    val GoogleSatellite = object : OnlineTileSourceBase(
        "Google-Satellite",
        0, 20, 256, ".jpg",
        arrayOf(
            "https://mt0.google.com/vt/lyrs=s&x=",
            "https://mt1.google.com/vt/lyrs=s&x=",
            "https://mt2.google.com/vt/lyrs=s&x=",
            "https://mt3.google.com/vt/lyrs=s&x="
        )
    ) {
        override fun getTileURLString(pMapTileIndex: Long): String {
            return (baseUrl + MapTileIndex.getX(pMapTileIndex) + "&y=" +
                    MapTileIndex.getY(pMapTileIndex) + "&z=" + MapTileIndex.getZoom(pMapTileIndex))
        }
    }
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Initialize OSMDroid configuration using application context to prevent memory leaks
        val prefs = getSharedPreferences("osmdroid", Context.MODE_PRIVATE)
        Configuration.getInstance().load(applicationContext, prefs)
        Configuration.getInstance().userAgentValue = packageName
        
        // Removed enableEdgeToEdge() to respect the status bar spacing
        
        setContent {
            XgpsTheme {
                MainScreen()
            }
        }
    }
}

@Composable
fun MainScreen() {
    val context = LocalContext.current
    var isServiceRunning by remember { mutableStateOf(false) }

    // Device ID handling
    var deviceIdInputDialog by remember { mutableStateOf(false) }
    val prefs = context.getSharedPreferences("xgps_prefs", Context.MODE_PRIVATE)
    val defaultId = android.provider.Settings.Secure.getString(context.contentResolver, android.provider.Settings.Secure.ANDROID_ID)
    var deviceId by remember { mutableStateOf(prefs.getString("device_id", defaultId) ?: defaultId) }
    var tempDeviceId by remember { mutableStateOf("") }
    
    
    
    val otherMarkers = remember { mutableMapOf<String, Marker>() }
    val devicePolylines = remember { mutableMapOf<String, Polyline>() }
    var showTrails by remember { mutableStateOf(false) }



    // Collect the latest location from the service
    val latestLocation by LocationService.locationFlow.collectAsState(initial = null)

    var mapReference by remember { mutableStateOf<MapView?>(null) }
    var locationMarker by remember { mutableStateOf<Marker?>(null) }
    
    // Map Layer State
    var mapTypeMenuExpanded by remember { mutableStateOf(false) }
    var currentTileSource by remember { mutableStateOf<ITileSource>(TileSourceFactory.MAPNIK) }

    val fusedLocationClient = remember { LocationServices.getFusedLocationProviderClient(context) }

    // Remote Sync Mode
    var appMode by remember { mutableStateOf("current") }
    var modeMenuExpanded by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()
    val modes = mapOf("current" to "Standard", "stationary" to "Stationary", "high_precision" to "High Precision")

    
    


    LaunchedEffect("ConfigPoll") {
        while(true) {
            try {
                val response = RetrofitClient.api.getLocations()
                if (response.isSuccessful) {
                    val locations = response.body() ?: emptyMap()
                    if (mapReference != null) {
                        locations.forEach { (id, locationData) ->
                            if (id != deviceId) {
                                val point = GeoPoint(locationData.latitude, locationData.longitude)
                                var marker = otherMarkers[id]
                                if (marker == null) {
                                    val devColor = getColorForDevice(id)
                                    marker = Marker(mapReference).apply {
                                        title = "Device: " + (if(id.length > 8) id.substring(0,8) else id)
                                        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                                        icon = createCustomMarker(context, devColor, id)
                                        mapReference!!.overlays.add(this)
                                        otherMarkers[id] = this
                                    }
                                }
                                marker.position = point
                            }
                        }
                        
                        // History Trails logic
                        if (showTrails) {
                            val historyResponse = RetrofitClient.api.getAllHistory()
                            if (historyResponse.isSuccessful) {
                                val allHistory = historyResponse.body() ?: emptyMap()
                                allHistory.forEach { (id, points) ->
                                    val geoPoints = points.map { GeoPoint(it.latitude, it.longitude) }
                                    var polyline = devicePolylines[id]
                                    if (polyline == null) {
                                        polyline = Polyline(mapReference).apply {
                                            outlinePaint.color = getColorForDevice(id)
                                            outlinePaint.strokeWidth = 10f
                                            if (mapReference!!.overlays.isNotEmpty()) {
                                                mapReference!!.overlays.add(0, this) 
                                            } else {
                                                mapReference!!.overlays.add(this)
                                            }
                                            devicePolylines[id] = this
                                        }
                                    }
                                    polyline.setPoints(geoPoints)
                                }
                            }
                        } else {
                            if (devicePolylines.isNotEmpty()) {
                                devicePolylines.values.forEach { mapReference!!.overlays.remove(it) }
                                devicePolylines.clear()
                            }
                        }
                        
                        mapReference?.invalidate()
                    }
                }
            } catch (e: Exception) { e.printStackTrace() }
            kotlinx.coroutines.delay(5000)
        }
    }

    LaunchedEffect("ConfigPoll") {
        while(true) {
            try {
                val response = RetrofitClient.api.getConfig()
                if (response.isSuccessful) {
                    appMode = response.body()?.mode ?: "current"
                }
            } catch (e: Exception) { e.printStackTrace() }
            kotlinx.coroutines.delay(5000)
        }
    }

    // Reusable function to center the map and update the pin location
    val moveTo = { lat: Double, lon: Double ->
        val point = GeoPoint(lat, lon)
        mapReference?.controller?.animateTo(point)
        if (locationMarker == null && mapReference != null) {
            locationMarker = Marker(mapReference).apply {
                title = "Current Location"
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                // Using the custom red pin UI we generated 
                icon = ContextCompat.getDrawable(context, R.drawable.ic_red_pin)
                mapReference!!.overlays.add(this)
            }
        }
        locationMarker?.position = point
        mapReference?.invalidate()
    }

    LaunchedEffect(currentTileSource) {
        mapReference?.setTileSource(currentTileSource)
        mapReference?.invalidate()
    }

    // Always fetch immediate last location the moment Map is ready
    LaunchedEffect(mapReference) {
        if (mapReference != null) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                fusedLocationClient.lastLocation.addOnSuccessListener { loc ->
                    // Only apply if the service hasn't already beaten us to it
                    if (loc != null && latestLocation == null) {
                        moveTo(loc.latitude, loc.longitude)
                    }
                }
            }
        }
    }

    // Handles subsequent continuous updates when sharing is active
    LaunchedEffect(latestLocation) {
        latestLocation?.let { location ->
            moveTo(location.latitude, location.longitude)
        }
    }

    val permissions = mutableListOf(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
    ).apply {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
        onResult = { perms ->
            val allGranted = perms.values.all { it }
            if (allGranted) {
                // If they just granted permissions, try to instantly locate them!
                fusedLocationClient.lastLocation.addOnSuccessListener { loc ->
                    if (loc != null && latestLocation == null) {
                        moveTo(loc.latitude, loc.longitude)
                    }
                }
                
                val intent = Intent(context, LocationService::class.java).apply {
                    action = if (isServiceRunning) LocationService.ACTION_STOP else LocationService.ACTION_START
                }
                
                if (isServiceRunning) {
                    context.stopService(intent)
                    isServiceRunning = false
                } else {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(intent)
                    } else {
                        context.startService(intent)
                    }
                    isServiceRunning = true
                }
            } else {
                Toast.makeText(context, "Permissions required for location sharing", Toast.LENGTH_SHORT).show()
            }
        }
    )

    Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding).fillMaxSize()) {
            
            AndroidView(
                factory = { ctx ->
                    MapView(ctx).apply {
                        setTileSource(currentTileSource)
                        setMultiTouchControls(true)
                        controller.setZoom(17.0)
                        
                        // Basic starting point while waiting for location service
                        val startPoint = GeoPoint(20.5937, 78.9629) // India default
                        controller.setCenter(startPoint)
                        
                        mapReference = this
                    }
                },
                update = { map -> 
                    map.setTileSource(currentTileSource)
                },
                modifier = Modifier.fillMaxSize(),
                onRelease = {
                    it.onDetach()
                }
            )

            // Settings Button top left
            Box(modifier = Modifier.align(Alignment.TopStart).padding(top = 16.dp, start = 16.dp)) {
                FloatingActionButton(onClick = { 
                    tempDeviceId = deviceId
                    deviceIdInputDialog = true 
                }) {
                    Icon(imageVector = Icons.Default.Settings, contentDescription = "Settings")
                }
            }

            if (deviceIdInputDialog) {
                AlertDialog(
                    onDismissRequest = { deviceIdInputDialog = false },
                    title = { Text("Assign Device ID") },
                    text = {
                        OutlinedTextField(
                            value = tempDeviceId,
                            onValueChange = { tempDeviceId = it },
                            label = { Text("Device ID") },
                            singleLine = true
                        )
                    },
                    confirmButton = {
                        TextButton(onClick = {
                            val finalId = if (tempDeviceId.isBlank()) defaultId else tempDeviceId
                            prefs.edit().putString("device_id", finalId).apply()
                            deviceId = finalId
                            deviceIdInputDialog = false
                        }) {
                            Text("Save")
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { deviceIdInputDialog = false }) {
                            Text("Cancel")
                        }
                    }
                )
            }

            // Map Type Selector Button
            Box(modifier = Modifier.align(Alignment.TopEnd).padding(top = 16.dp, end = 16.dp)) {
                FloatingActionButton(onClick = { mapTypeMenuExpanded = true }) {
                    Icon(imageVector = Icons.Default.MoreVert, contentDescription = "Map Type")
                }
                DropdownMenu(
                    expanded = mapTypeMenuExpanded,
                    onDismissRequest = { mapTypeMenuExpanded = false }
                ) {
                    DropdownMenuItem(
                        text = { Text("OSM Default") },
                        onClick = {
                            currentTileSource = TileSourceFactory.MAPNIK
                            mapTypeMenuExpanded = false
                        }
                    )
                    DropdownMenuItem(
                        text = { Text("Google Map (Default)") },
                        onClick = {
                            currentTileSource = MapSources.GoogleDefault
                            mapTypeMenuExpanded = false
                        }
                    )
                    DropdownMenuItem(
                        text = { Text("Google Map (Satellite)") },
                        onClick = {
                            currentTileSource = MapSources.GoogleSatellite
                            mapTypeMenuExpanded = false
                        }
                    )
                }
            }

            // Locate Me Button
            FloatingActionButton(
                onClick = {
                    if (latestLocation != null) {
                        moveTo(latestLocation!!.latitude, latestLocation!!.longitude)
                    } else if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                        fusedLocationClient.lastLocation.addOnSuccessListener { loc ->
                            if (loc != null) {
                                moveTo(loc.latitude, loc.longitude)
                            } else {
                                Toast.makeText(context, "Waiting for GPS fix...", Toast.LENGTH_SHORT).show()
                            }
                        }
                    } else {
                        Toast.makeText(context, "Location permission missing", Toast.LENGTH_SHORT).show()
                    }
                },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(bottom = 100.dp, end = 16.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.LocationOn,
                    contentDescription = "Locate Me"
                )
            }

            // Start/Stop Share Button
            Button(
                onClick = {
                    val allPermsGranted = permissions.all {
                        ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
                    }
                    if (allPermsGranted) {
                        val intent = Intent(context, LocationService::class.java).apply {
                            action = if (isServiceRunning) LocationService.ACTION_STOP else LocationService.ACTION_START
                        }
                        if (isServiceRunning) {
                            context.stopService(intent)
                            isServiceRunning = false
                        } else {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                context.startForegroundService(intent)
                            } else {
                                context.startService(intent)
                            }
                            isServiceRunning = true
                        }
                    } else {
                        permissionLauncher.launch(permissions.toTypedArray())
                    }
                },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(bottom = 32.dp, end = 16.dp)
            ) {
                Text(if (isServiceRunning) "Stop Sharing" else "Start Sharing")
            }

            // Mode Selection UI
            Box(modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(bottom = 32.dp, start = 16.dp)
            ) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 8.dp)) {
                        Surface(color = androidx.compose.material3.MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(8.dp), tonalElevation = 4.dp) {
                            Text("Show Trails", modifier = Modifier.padding(8.dp, 4.dp))
                        }
                        Spacer(Modifier.width(8.dp))
                        Switch(checked = showTrails, onCheckedChange = { showTrails = it; if (!it) mapReference?.invalidate() })
                    }
                    Button(onClick = { modeMenuExpanded = true }) {
                        Text(modes[appMode] ?: "Select Mode")
                    }
                DropdownMenu(
                    expanded = modeMenuExpanded,
                    onDismissRequest = { modeMenuExpanded = false }
                ) {
                    modes.forEach { (modeKey, modeTitle) ->
                        DropdownMenuItem(
                            text = { Text(modeTitle) },
                            onClick = {
                                appMode = modeKey
                                modeMenuExpanded = false
                                coroutineScope.launch {
                                    try {
                                        RetrofitClient.api.postConfig(ConfigPostData(modeKey))
                                    } catch (e: Exception) { e.printStackTrace() }
                                }
                            }
                        )
                    }
                }
            }
        }
    }
}}
