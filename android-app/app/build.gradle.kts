import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val firebaseProperties = Properties().apply {
    val file = rootProject.file("firebase.properties")
    if (file.exists()) file.inputStream().use(::load)
}

fun firebaseValue(name: String): String =
    (firebaseProperties.getProperty(name) ?: "").replace("\\", "\\\\").replace("\"", "\\\"")

android {
    namespace = "ai.jimskay.mobile"
    compileSdk = 35

    defaultConfig {
        applicationId = "ai.jimskay.mobile"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "FIREBASE_API_KEY", "\"${firebaseValue("firebaseApiKey")}\"")
        buildConfigField("String", "FIREBASE_APP_ID", "\"${firebaseValue("firebaseApplicationId")}\"")
        buildConfigField("String", "FIREBASE_PROJECT_ID", "\"${firebaseValue("firebaseProjectId")}\"")
        buildConfigField("String", "FIREBASE_DATABASE_URL", "\"${firebaseValue("firebaseDatabaseUrl")}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.0")
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-database")
}
