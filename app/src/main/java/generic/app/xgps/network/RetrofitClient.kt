package generic.app.xgps.network

import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

object RetrofitClient {
    // We are using the standard Android emulator IP mapping to the host's localhost
    // Assuming a local server is running on port 3000
     //private const val BASE_URL = "http://10.126.57.203:3000/"
     private const val BASE_URL = "https://xgps.onrender.com/"


    val api: LocationApi by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(LocationApi::class.java)
    }
}
