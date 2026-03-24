import re

with open(r'c:\androidprojects\xgps\app\src\main\java\generic\app\xgps\MainActivity.kt', 'r') as f:
    text = f.read()

imports_to_add = '''import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
'''
text = text.replace('import androidx.compose.material.icons.filled.MoreVert\n', 'import androidx.compose.material.icons.filled.MoreVert\n' + imports_to_add)

vars_to_add = '''
    // Device ID handling
    var deviceIdInputDialog by remember { mutableStateOf(false) }
    val prefs = context.getSharedPreferences("xgps_prefs", Context.MODE_PRIVATE)
    val defaultId = android.provider.Settings.Secure.getString(context.contentResolver, android.provider.Settings.Secure.ANDROID_ID)
    var deviceId by remember { mutableStateOf(prefs.getString("device_id", defaultId) ?: defaultId) }
    var tempDeviceId by remember { mutableStateOf("") }
    
    val otherMarkers = remember { mutableMapOf<String, Marker>() }
'''
text = text.replace('val context = LocalContext.current\n    var isServiceRunning by remember { mutableStateOf(false) }', 'val context = LocalContext.current\n    var isServiceRunning by remember { mutableStateOf(false) }\n' + vars_to_add)

poll_others = '''
    LaunchedEffect(Unit) {
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
    }
'''

text = text.replace('LaunchedEffect(Unit) {', poll_others + '\n    LaunchedEffect("ConfigPoll") {')

ui_to_add = '''
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
'''

text = text.replace('onRelease = {\n                    it.onDetach()\n                }\n            )\n            \n            // Map Type Selector Button', 'onRelease = {\n                    it.onDetach()\n                }\n            )\n' + ui_to_add + '\n            // Map Type Selector Button')
text = text.replace('catch (e: Exception) {}', 'catch (e: Exception) { e.printStackTrace() }')
with open(r'c:\androidprojects\xgps\app\src\main\java\generic\app\xgps\MainActivity.kt', 'w') as f:
    f.write(text)
print("Done patching")
