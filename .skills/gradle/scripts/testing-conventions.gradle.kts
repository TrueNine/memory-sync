// build-logic/src/main/kotlin/testing-conventions.gradle.kts
// 带共享依赖 — 统一测试框架
plugins {
  kotlin("jvm")
}

dependencies {
  testImplementation(platform(libs.junit.bom))
  testImplementation(libs.junit.jupiter)
  testRuntimeOnly(libs.junit.platform.launcher)
}

tasks.withType<Test> {
  useJUnitPlatform()
}
