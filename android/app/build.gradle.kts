plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.gunther"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.gunther"
        minSdk = 26
        targetSdk = 35
        versionCode = 6
        versionName = "1.3.1"
    }

    signingConfigs {
        create("shared") {
            storeFile = file("gunther.keystore")
            storePassword = "gunther-sideload"
            keyAlias = "gunther"
            keyPassword = "gunther-sideload"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("shared")
        }
        debug {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("shared")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = false
    }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.security:security-crypto:1.0.0")
    implementation("androidx.documentfile:documentfile:1.0.1")
}
