package generic.app.xgps.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import generic.app.xgps.network.LocationData
import generic.app.xgps.network.RetrofitClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch

class LocationService : Service() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback

    private var currentMode = "current"
    private var lastSentLocation: Location? = null
    private var isTracking = false

    companion object {
        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"
        private const val NOTIFICATION_CHANNEL_ID = "location_channel"
        private const val NOTIFICATION_ID = 1
        
        // Flow to broadcast location for the UI map
        private val _locationFlow = MutableSharedFlow<Location>(replay = 1)
        val locationFlow: SharedFlow<Location> = _locationFlow
    }

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                super.onLocationResult(result)
                result.lastLocation?.let { location ->
                    serviceScope.launch {
                        _locationFlow.emit(location)
                        tryPostLocationToServer(location)
                    }
                }
            }
        }

        serviceScope.launch {
            while (true) {
                if (isTracking) {
                    pollConfig()
                }
                kotlinx.coroutines.delay(5000)
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startLocationTracking()
            ACTION_STOP -> stopLocationTracking()
        }
        return START_STICKY
    }

    private fun startLocationTracking() {
        createNotificationChannel()
        
        val notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Location Sharing Active")
            .setContentText("Your location is being shared in the background")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .build()
            
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        isTracking = true
        updateLocationRequestForMode()
    }

    private fun updateLocationRequestForMode() {
        if (!isTracking) return
        fusedLocationClient.removeLocationUpdates(locationCallback)

        val priority = if (currentMode == "high_precision") Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_HIGH_ACCURACY
        val interval = if (currentMode == "high_precision") 1000L else 2000L
        
        val locationRequest = LocationRequest.Builder(priority, interval).build()
        try {
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback,
                Looper.getMainLooper()
            )
        } catch (e: SecurityException) {
            Log.e("LocationService", "Missing location permissions", e)
        }
    }

    private suspend fun pollConfig() {
        try {
            val response = RetrofitClient.api.getConfig()
            if (response.isSuccessful) {
                response.body()?.mode?.let { newMode ->
                    if (newMode != currentMode) {
                        currentMode = newMode
                        Log.d("LocationService", "Mode updated to: $newMode")
                        updateLocationRequestForMode()
                    }
                }
            }
        } catch (e: Exception) {
            Log.e("LocationService", "Error polling config: ${e.message}")
        }
    }

    private fun stopLocationTracking() {
        isTracking = false
        fusedLocationClient.removeLocationUpdates(locationCallback)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private suspend fun tryPostLocationToServer(location: Location) {
        if (currentMode == "stationary") {
            if (lastSentLocation != null) {
                val distance = lastSentLocation!!.distanceTo(location)
                if (distance < 50f) {
                    return
                }
            }
        }
        
        lastSentLocation = location
        postLocationToServer(location)
    }

    private suspend fun postLocationToServer(location: Location) {
        try {
            val prefs = getSharedPreferences("xgps_prefs", Context.MODE_PRIVATE)
            val defaultId = android.provider.Settings.Secure.getString(contentResolver, android.provider.Settings.Secure.ANDROID_ID)
            val deviceId = prefs.getString("device_id", defaultId)

            val data = LocationData(
                latitude = location.latitude,
                longitude = location.longitude,
                timestamp = System.currentTimeMillis(),
                deviceId = deviceId
            )
            val response = RetrofitClient.api.postLocation(data)
            if (response.isSuccessful) {
                Log.d("LocationService", "Location posted successfully")
            } else {
                Log.e("LocationService", "Failed to post location: ${response.code()}")
            }
        } catch (e: Exception) {
            Log.e("LocationService", "Error posting location", e)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Location Tracking Channel",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
        fusedLocationClient.removeLocationUpdates(locationCallback)
    }
}
