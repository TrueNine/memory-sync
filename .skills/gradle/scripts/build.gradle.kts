plugins {
  alias(libs.plugins.org.jetbrains.kotlin.jvm)
}

dependencies {
  implementation(libs.org.jetbrains.kotlinx.coroutines.core)
  implementation(projects.core.common)

  testImplementation(platform(libs.junit.bom))
  testImplementation(libs.junit.jupiter)
  testRuntimeOnly(libs.junit.platform.launcher)
}

tasks.withType<Test> {
  useJUnitPlatform()
}
