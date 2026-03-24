package generic.app.xgps.network

data class LocationData(
    val latitude: Double,
    val longitude: Double,
    val timestamp: Long,
    val deviceId: String? = null
)
