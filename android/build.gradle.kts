// AGP 9's built-in Kotlin defaults lower; this pins the compiler used by the
// serialization and Compose compiler plugins. Keep aligned with the catalog.
buildscript {
    dependencies {
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.3.21")
    }
}

plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}
