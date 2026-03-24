import re

with open(r'c:\androidprojects\xgps\app\src\main\java\generic\app\xgps\MainActivity.kt', 'r', encoding='utf-8') as f:
    text = f.read()

imports = '''import android.graphics.Bitmap
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
'''

# Add imports
text = text.replace('import org.osmdroid.views.overlay.Marker\n', 'import org.osmdroid.views.overlay.Marker\n' + imports)

# Add custom marker drawing before object MapSources
funcs = '''
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
'''
text = text.replace('object MapSources {', funcs + '\nobject MapSources {')

# Add UI vars
ui_vars = '''
    val otherMarkers = remember { mutableMapOf<String, Marker>() }
    val devicePolylines = remember { mutableMapOf<String, Polyline>() }
    var showTrails by remember { mutableStateOf(false) }
'''
text = text.replace('val otherMarkers = remember { mutableMapOf<String, Marker>() }', ui_vars)

# Update polling loop
old_poll = '''    LaunchedEffect("ConfigPoll") {
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
                                    marker = Marker(mapReference).apply {
                                        title = "Device: " + (if(id.length > 8) id.substring(0,8) else id)
                                        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                                        mapReference!!.overlays.add(this)
                                        otherMarkers[id] = this
                                    }
                                }
                                marker.position = point
                            }
                        }
                        mapReference?.invalidate()
                    }
                }
            } catch (e: Exception) { e.printStackTrace() }
            kotlinx.coroutines.delay(5000)
        }
    }'''

new_poll = '''    LaunchedEffect("ConfigPoll") {
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
    }'''
text = text.replace(old_poll, new_poll)


# Update UI with Toggle
old_mode_ui = '''            // Mode Selection UI
            Box(modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(bottom = 32.dp, start = 16.dp)
            ) {
                Button(onClick = { modeMenuExpanded = true }) {
                    Text(modes[appMode] ?: "Select Mode")
                }'''

new_mode_ui = '''            // Mode Selection UI
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
                    }'''
text = text.replace(old_mode_ui, new_mode_ui)

with open(r'c:\androidprojects\xgps\app\src\main\java\generic\app\xgps\MainActivity.kt', 'w', encoding='utf-8') as f:
    f.write(text)
print("Trails UI injected.")
