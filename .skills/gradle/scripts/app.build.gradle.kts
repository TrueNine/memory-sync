// app/build.gradle.kts
plugins {
  id("kotlin-application")
}

application {
  mainClass.set("com.example.MainKt")
}

dependencies {
  implementation(projects.core.common)
}
