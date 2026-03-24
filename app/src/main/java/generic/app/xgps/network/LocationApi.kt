package generic.app.xgps.network

import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

data class ConfigData(val mode: String)
data class ConfigPostData(val mode: String)

interface LocationApi {
    @POST("location")
    suspend fun postLocation(@Body locationData: LocationData): Response<ResponseBody>

    @GET("locations")
    suspend fun getLocations(): Response<Map<String, LocationData>>

    @GET("all_history")
    suspend fun getAllHistory(): Response<Map<String, List<LocationData>>>

    @GET("config")
    suspend fun getConfig(): Response<ConfigData>

    @POST("config")
    suspend fun postConfig(@Body configData: ConfigPostData): Response<ResponseBody>
}
