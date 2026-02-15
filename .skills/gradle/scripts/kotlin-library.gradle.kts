// build-logic/src/main/kotlin/kotlin-library.gradle.kts
// 基础模式 — 单一职责
plugins {
  kotlin("jvm")
}

kotlin {
  jvmToolchain(21)
}

tasks.withType<Test> {
  useJUnitPlatform()
}
