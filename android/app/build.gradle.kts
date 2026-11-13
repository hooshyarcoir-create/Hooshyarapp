import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// One single source of truth for the UI: /webapp at the repository root.
// It is synced into generated assets at build time (never duplicated in git).
val webRoot = File(rootProject.projectDir.parentFile, "webapp")
val generatedAssets = File(layout.buildDirectory.get().asFile, "generated/hooshyarAssets")
val syncWebAssets = tasks.register<Sync>("syncWebAssets") {
    group = "hooshyar"
    description = "Copies webapp/ into Android assets (www/)"
    from(webRoot)
    into(File(generatedAssets, "www"))
    exclude("**/.DS_Store", "**/node_modules/**")
}

android {
    namespace = "ir.hooshyar.pos"
    compileSdk = 34

    defaultConfig {
        applicationId = "ir.hooshyar.pos"
        minSdk = 23
        targetSdk = 34
        versionCode = 2
        versionName = "2.0.0"
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets.getByName("main").assets.srcDirs(generatedAssets)
    buildFeatures {
        buildConfig = true
    }
}

tasks.named("preBuild") { dependsOn(syncWebAssets) }
